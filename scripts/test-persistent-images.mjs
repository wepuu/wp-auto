import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, chmod, readdir, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const docker = process.env.DOCKER_BIN ?? 'docker';
const context = process.env.WEPUU_TEST_DOCKER_CONTEXT;
const prefix = context ? ['--context', context] : [];
const authorizationImage = process.env.WEPUU_AUTHORIZATION_IMAGE ?? 'wepuu-authorization:candidate';
const testImage = process.env.WEPUU_TEST_IMAGE;
const controlImage = process.env.WEPUU_CONTROL_IMAGE ?? 'wepuu-control:candidate';
const postgresImage = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
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
const call = async (args, options = {}) => (await exec(docker, [...prefix, ...args], {
  timeout: options.timeout ?? 20000, windowsHide: true, maxBuffer: 1000000,
  env: { ...process.env, ...(options.env ?? {}) }
})).stdout;
const labels = ['--label', 'wepuu.phase=persistent-image-test', '--label', `wepuu.run=${nonce}`];
const mounted = ['--mount', `type=volume,source=${names.evidence},target=/evidence`, '--mount',
  `type=bind,source=${resolve('test/persistent-authorization')},target=/harness,readonly`];
const hardening = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--tmpfs', '/private:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700'];
const containers = [];
const results = [];
let networkCreated = false, postgresCreated = false, evidenceCreated = false;
let result = { passed: false, productionAccessed: false, rawErrorSuppressed: true };
const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
async function scenario(step) {
  const name = `wepuu-persistent-${step}-${nonce}`;
  containers.push(name);
  await save(step + '-attempt.json', { startedUtc: new Date().toISOString(), attempts: 1 });
  if (step === 'database') assert(testImage, 'TEST_IMAGE_REQUIRED');
  const out = await call(['run', '--pull=never', '--name', name, ...labels,
    '--network', step === 'offline' ? 'none' : `container:${names.postgres}`,
    '--log-driver', 'none', ...hardening, ...mounted,
    ...(step === 'database' ? ['--user', '1000:1000', '--env', 'WEPUU_TEST_LEGACY_CONSOLE'] : []),
    step === 'database' ? testImage : step === 'control' ? controlImage : authorizationImage,
    'node', step === 'offline' ? '/harness/offline.mjs' : step === 'database' ? '/harness/database-tests.mjs' : '/harness/driver.mjs',
    ...(step === 'offline' || step === 'database' ? [] : [step])],
  { timeout: step === 'offline' ? 60000 : step === 'startup' ? 120000 : 300000 });
  const item = JSON.parse(out.trim().split(/\r?\n/u).at(-1));
  results.push({ step, ...item });
  assert.equal(item.passed, true, 'IMAGE_SCENARIO_FAILED');
  const metadata = JSON.parse(await call(['inspect', name]))[0];
  assert.equal(metadata.State.Running, false);
  assert.equal(metadata.State.ExitCode, 0);
  return item;
}
try {
  const current = context ?? (await call(['context', 'show'])).trim();
  const endpoint = JSON.parse(await call(['context', 'inspect', current]))[0].Endpoints.docker.Host;
  assert(endpoint.startsWith('unix://') || endpoint.startsWith('npipe://'), 'LOCAL_DOCKER_ONLY');
  const image = JSON.parse(await call(['image', 'inspect', authorizationImage]))[0];
  assert.equal(image.Config.User, 'node');
  assert.deepEqual(image.Config.Cmd, ['node', 'apps/authorization-service/dist/main.js']);
  assert.equal(image.Architecture, 'amd64');
  const control = JSON.parse(await call(['image', 'inspect', controlImage]))[0];
  assert.equal(control.Config.User, 'node');
  assert.deepEqual(control.Config.Cmd, ['node', 'apps/control-api/dist/main.js']);
  try { await call(['image', 'inspect', postgresImage]); }
  catch { await call(['pull', '--platform', 'linux/amd64', postgresImage], { timeout: 120000 }); }
  await call(['volume', 'create', ...labels, names.evidence]); evidenceCreated = true;
  await call(['run', '--rm', '--pull=never', '--network', 'none', '--user', '0:0',
    '--mount', `type=volume,source=${names.evidence},target=/evidence`, '--entrypoint', 'sh', authorizationImage,
    '-ec', 'chown 1000:1000 /evidence && chmod 0700 /evidence']);
  await scenario('offline');
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
  await scenario('startup');
  await scenario('control');
  await scenario('matrix');
  await scenario('transition');
  result = { passed: true, imageId: image.Id, results, productionAccessed: false, realEmailSent: false,
    mcpCalled: false, internalNetwork: true, hostPortsPublished: false };
} catch (error) {
  result = { passed: false, results, category: error.killed ? 'TIMEOUT' : 'IMAGE_TEST_STOPPED',
    rawErrorSuppressed: true, productionAccessed: false };
} finally {
  const cleanup = [];
  for (const name of [...containers, ...(postgresCreated ? [names.postgres] : [])]) {
    try {
      const metadata = JSON.parse(await call(['inspect', name]))[0];
      assert.equal(metadata.Config.Labels['wepuu.run'], nonce);
      if (metadata.State.Running) await call(['stop', '--time', '10', name]);
      const stopped = JSON.parse(await call(['inspect', name]))[0];
      assert.equal(stopped.State.Running, false);
      cleanup.push({ name, stopped: true });
    } catch { cleanup.push({ name, stopped: false }); result.passed = false; }
  }
  result.cleanup = cleanup;
  if (evidenceCreated) {
    try {
      const exported = await call(['run', '--rm', '--pull=never', '--network', 'none',
        '--mount', `type=volume,source=${names.evidence},target=/evidence,readonly`, authorizationImage, 'node', '-e',
        "const fs=require('node:fs');const out={};function walk(p,r=''){for(const e of fs.readdirSync(p,{withFileTypes:true})){const n=r?`${r}/${e.name}`:e.name;if(e.name.includes('private'))continue;if(e.isDirectory())walk(p+'/'+e.name,n);else if(e.isFile()&&n.endsWith('.json'))out[n]=JSON.parse(fs.readFileSync(p+'/'+e.name,'utf8'));}}walk('/evidence');console.log(JSON.stringify(out));"]);
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
  await save('result.json', result);
}
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
