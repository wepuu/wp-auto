import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, chmod, mkdir, statfs } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { collectScenarioResult } from './persistent-test-result.mjs';
import { postgresPlan, inspectPostgresImage, safePostgresFailure } from './postgres-image-gate.mjs';
import { postgresDockerExecutor } from './postgres-docker-executor.mjs';
import { integrationOptions, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget,
  verifyCompiledIdentity, verifyOwnedStopped, integrationFailure, compiledIdentityCode } from './persistent-image-contract.mjs';

const exec = promisify(execFile);
const docker = process.env.DOCKER_BIN ?? 'docker';
const context = process.env.WEPUU_TEST_DOCKER_CONTEXT;
const prefix = context ? ['--context', context] : [];
const authorizationImage = process.env.WEPUU_AUTHORIZATION_IMAGE;
const testImage = process.env.WEPUU_TEST_IMAGE;
const controlImage = process.env.WEPUU_CONTROL_IMAGE;
let postgresImage, postgresIdentity;
const nonce = randomBytes(6).toString('hex');
const names = { network: `wepuu-persistent-net-${nonce}`, postgres: `wepuu-persistent-pg-${nonce}`,
  data: `wepuu-persistent-data-${nonce}`, evidence: `wepuu-persistent-evidence-${nonce}` };
const directory = await mkdtemp(join(tmpdir(), 'wepuu-persistent-'));
await chmod(directory, 0o700);
if (process.platform === 'win32') {
  const user = (await exec('whoami', [], { windowsHide: true })).stdout.trim();
  assert(/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/.test(user));
  await exec('icacls', [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`,
    '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true });
}
const childEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'BUILDX_BUILDER', 'BUILDKIT_HOST',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete childEnv[key];
const call = async (args, options = {}) => (await exec(docker, [...prefix, ...args], {
  timeout: options.timeout ?? 20000, windowsHide: true, maxBuffer: 1000000,
  env: { ...childEnv, ...(options.env ?? {}) }
})).stdout;
const labels = ['--label', 'wepuu.phase=persistent-image-test', '--label', `wepuu.run=${nonce}`];
const mounted = ['--mount', `type=volume,source=${names.evidence},target=/evidence`, '--mount',
  `type=bind,source=${resolve('test/persistent-authorization')},target=/harness,readonly`];
const hardening = ['--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--tmpfs', '/private:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700'];
const containers = [];
const results = [];
let networkCreated = false, postgresCreated = false, evidenceCreated = false;
let result = { passed: false, productionAccessed: false, rawErrorSuppressed: true };
const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const startedUtc = new Date().toISOString(), started = performance.now(), diskSamples = [], artifactResults = [];
let stage = 'preflight', compiledIdentity, sourceRevision;
const deny = code => { throw Object.assign(Error('integration_gate_denied'), { code }); };
async function space(initial = false) {
  const fs = await statfs(process.cwd()), bytes = fs.bavail * fs.bsize;
  const observation = { stage, sampledUtc: new Date().toISOString(), freeBytes: bytes, minimumBytes: (initial ? 5 : 2) * 1024 ** 3 };
  diskSamples.push(observation); verifyDiskBudget(bytes, initial);
}
async function source() {
  const options = { cwd: process.cwd(), env: childEnv, windowsHide: true, timeout: 10000, maxBuffer: 100000 };
  const git = async args => (await exec('git', args, options)).stdout.trim();
  const head = await git(['rev-parse', 'HEAD']);
  if (head !== process.env.WEPUU_TEST_SOURCE_REVISION) deny('SOURCE_REVISION_MISMATCH');
  if (await git(['status', '--porcelain', '--untracked-files=normal'])) deny('SOURCE_NOT_CLEAN');
  for (const revision of new Set(Object.values(integrationOptions(process.env).revisions))) {
    if (await git(['diff', '--name-only', revision, head, '--', 'apps', 'packages', 'package.json', 'pnpm-lock.yaml',
      'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json', 'tsconfig.json', 'deploy/Authorization.Containerfile',
      'deploy/Control.Containerfile', 'test/persistent-authorization'])) deny('SOURCE_INPUT_CHANGED');
  }
  return head;
}
async function scenario(step) {
  stage = step; await space();
  const name = `wepuu-persistent-${step}-${nonce}`;
  containers.push(name);
  await save(step + '-attempt.json', { startedUtc: new Date().toISOString(), attempts: 1 });
  if (step === 'database') assert(testImage, 'TEST_IMAGE_REQUIRED');
  const item = await collectScenarioResult(step, () => call(['run', '--pull=never', '--name', name, ...labels,
    '--network', ['offline', 'unit'].includes(step) ? 'none' : `container:${names.postgres}`,
    '--log-driver', 'none', ...hardening, ...mounted,
    ...(['database', 'legacy', 'unit'].includes(step) ? ['--user', '1000:1000', '--env', 'WEPUU_TEST_LEGACY_CONSOLE'] : []),
    ['database', 'legacy', 'unit'].includes(step) ? testImage : step === 'control' ? controlImage : authorizationImage,
    'node', step === 'offline' ? '/harness/offline.mjs' : step === 'unit' ? '/harness/r68/unit.mjs'
      : ['database', 'legacy'].includes(step) ? '/harness/database-tests.mjs' : '/harness/driver.mjs',
    ...(['offline', 'database', 'unit'].includes(step) ? [] : [step])],
  { timeout: step === 'offline' ? 60000 : step === 'startup' ? 120000 : 300000 }));
  results.push(item);
  await save(step + '-result.json', item);
  assert.equal(item.passed, true, 'IMAGE_SCENARIO_FAILED');
  const metadata = JSON.parse(await call(['inspect', name]))[0];
  assert.equal(metadata.State.Running, false);
  assert.equal(metadata.State.ExitCode, 0);
  return item;
}
try {
  stage = 'postgres_pin';
  let postgresSpec;
  try { postgresSpec = JSON.parse(await readFile(new URL('../test/persistent-authorization/postgres-pin.json', import.meta.url), 'utf8')); }
  catch { deny('POSTGRES_METADATA_INVALID'); }
  postgresImage = postgresPlan(postgresSpec).reference;
  stage = 'preflight';
  const options = integrationOptions(process.env);
  await space(true); sourceRevision = await source();
  verifyIntegrationContext(JSON.parse(await call(['context', 'inspect', context])), context);
  for (const role of ['authorization', 'control', 'test']) {
    const id = options.images[role];
    artifactResults.push(verifyIntegrationImage(JSON.parse(await call(['image', 'inspect', id])), id, role, options.revisions[role]));
  }
  stage = 'postgres_inspect';
  postgresIdentity = await inspectPostgresImage(postgresSpec, postgresDockerExecutor(docker, prefix, childEnv));
  stage = 'compiled_identity';
  const probes = [];
  for (const role of ['authorization', 'control', 'test']) {
    const probeName = `wepuu-persistent-identity-${role}-${nonce}`; containers.push(probeName);
    probes.push(JSON.parse(await call(['run', '--name', probeName, ...labels, '--pull=never', '--network', 'none', '--user', '1000:1000',
      '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--entrypoint', 'node', options.images[role], '-e', compiledIdentityCode])));
  }
  compiledIdentity = verifyCompiledIdentity(probes);
  await save('preflight.json', { sourceRevision, artifacts: artifactResults, postgresIdentity, compiledIdentity, diskSamples });
  stage = 'evidence_volume';
  await call(['volume', 'create', ...labels, names.evidence]); evidenceCreated = true;
  await call(['run', '--rm', '--pull=never', '--network', 'none', '--user', '0:0',
    '--mount', `type=volume,source=${names.evidence},target=/evidence`, '--entrypoint', 'sh', authorizationImage,
    '-ec', 'chown 1000:1000 /evidence && chmod 0700 /evidence']);
  await scenario('offline');
  await scenario('unit');
  stage = 'database_setup'; await space();
  await call(['network', 'create', '--internal', ...labels, names.network]); networkCreated = true;
  await call(['volume', 'create', ...labels, names.data]);
  const password = randomBytes(32).toString('hex');
  const envFile = join(directory, 'postgres.private.env');
  await writeFile(envFile, `POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=postgres\n`, { flag: 'wx', mode: 0o600 });
  const seed = JSON.stringify({ host: '127.0.0.1', port: 5432, user: 'postgres', password, database: 'postgres' });
  await call(['run', '--rm', '--pull=never', '--network', 'none', '--env', 'WEPUU_TEST_SEED',
    '--mount', `type=volume,source=${names.evidence},target=/evidence`, authorizationImage, 'node', '-e',
    "require('node:fs').writeFileSync('/evidence/postgres.private.json',process.env.WEPUU_TEST_SEED,{flag:'wx',mode:0o600})"],
  { env: { WEPUU_TEST_SEED: seed } });
  await call(['run', '-d', '--pull=never', '--name', names.postgres, ...labels, '--network', names.network,
    '--env-file', envFile, '--mount', `type=volume,source=${names.data},target=/var/lib/postgresql/data`,
    '--log-driver', 'none', postgresImage]); postgresCreated = true;
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try { await call(['exec', names.postgres, 'pg_isready', '-U', 'postgres'], { timeout: 3000 }); ready = true; break; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  assert(ready, 'POSTGRES_READINESS');
  const network = JSON.parse(await call(['network', 'inspect', names.network]))[0];
  const pg = JSON.parse(await call(['inspect', names.postgres]))[0];
  assert(network.Internal);
  assert.equal(Object.keys(pg.HostConfig.PortBindings ?? {}).length, 0);
  await scenario('database');
  if (process.env.WEPUU_TEST_LEGACY_CONSOLE === 'allow-isolated') await scenario('legacy');
  await scenario('startup');
  await scenario('control');
  await scenario('matrix');
  await scenario('transition');
  stage = 'postflight'; await space(); await source();
  verifyIntegrationContext(JSON.parse(await call(['context', 'inspect', context])), context);
  for (const role of ['authorization', 'control', 'test'])
    verifyIntegrationImage(JSON.parse(await call(['image', 'inspect', options.images[role]])), options.images[role], role, options.revisions[role]);
  result = { passed: true, imageId: authorizationImage, results, productionAccessed: false, realEmailSent: false,
    mcpCalled: false, internalNetwork: true, hostPortsPublished: false };
} catch (error) {
  result = { passed: false, results, failedStage: stage, category: integrationFailure(error),
    ...(typeof error?.code === 'string' && error.code.startsWith('POSTGRES_') ? { postgres: safePostgresFailure(error) } : {}),
    rawErrorSuppressed: true, productionAccessed: false };
} finally {
  const cleanup = [];
  for (const name of [...containers, ...(postgresCreated ? [names.postgres] : [])]) {
    try {
      const metadata = JSON.parse(await call(['inspect', name]))[0];
      assert.equal(metadata.Config.Labels['wepuu.run'], nonce);
      if (metadata.State.Running) await call(['stop', '--time', '10', name]);
      const stopped = JSON.parse(await call(['inspect', name]))[0];
      verifyOwnedStopped(stopped, nonce);
      cleanup.push({ name, stopped: true });
    } catch { cleanup.push({ name, stopped: false }); result.passed = false; }
  }
  result.cleanup = cleanup;
  if (evidenceCreated) {
    try {
      const exported = await call(['run', '--rm', '--pull=never', '--network', 'none', '--no-healthcheck',
        '--mount', `type=volume,source=${names.evidence},target=/evidence,readonly`,
        '--mount', `type=bind,source=${resolve('test/persistent-authorization')},target=/harness,readonly`, authorizationImage, 'node', '-e',
        "import('/harness/r10/export-evidence.mjs').catch(()=>{console.log('{}');process.exitCode=1})",
        // export helper is available through the same reviewed read-only mount
        ]);
      const files = JSON.parse(exported);
      for (const [path, value] of Object.entries(files)) {
        assert(/^[A-Za-z0-9_./-]+$/u.test(path) && !path.includes('..') && !path.includes('private'));
        const target = join(directory, 'safe', path);
        await mkdir(resolve(target, '..'), { recursive: true });
        await writeFile(target, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      }
    } catch { result.passed = false; result.safeEvidenceExport = 'NOT_CONFIRMED'; }
  }
  result.evidenceDirectory = directory;
  result.resourcesRetained = { ...names, networkCreated };
  result.sourceRevision = sourceRevision;
  result.artifacts = artifactResults;
  result.postgresIdentity = postgresIdentity;
  result.compiledIdentity = compiledIdentity;
  result.diskSamples = diskSamples;
  result.startedUtc = startedUtc; result.finishedUtc = new Date().toISOString(); result.elapsedMs = Math.round(performance.now() - started);
  result.automaticRetryPerformed = false; result.imageRebuilt = false; result.hostedCiTriggered = false;
  await save('result.json', result);
}
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
