import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, open, statfs } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBuilder, verifyAuthorizationArtifact, verifyBuildProcess, verifyUnusedTag, publicBuildFailure } from './authorization-build-contract.mjs';
import { verifyDiskBudget, compiledIdentityCode, verifyCompiledIdentity } from './persistent-image-contract.mjs';
const docker = process.env.DOCKER_BIN, revision = process.env.WEPUU_R10_REVISION, context = 'desktop-linux';
const parents = {
  'wepuu-r9-test:eb5f5b573d95-3acf89695fd0': 'sha256:fafe5c617b708e2d7e83935bf6bdd9a0eeeb609ff055c80bf63dd3517e8bf4b4',
  'wepuu-r4br2-authorization:a3aaf70780ad-fdf45454dea0': 'sha256:26c094ab8280e5071bf42e072597ef364f04b57cec2817137d2ed15f874497d3',
  'wepuu-r4br1-control:248f9cc6616c': 'sha256:78b5456efa95efd4283b207c4da93dc2b0aea2cdabd453ac018ae5aae69df5f8'
};
const directory = await mkdtemp(join(tmpdir(), 'wepuu-r10-build-')), nonce = randomBytes(6).toString('hex');
const env = { ...process.env };
for (const k of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'BUILDX_BUILDER', 'BUILDKIT_HOST', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
const command = async (file, args, timeout = 20000) => (await promisify(execFile)(file, args, { env, windowsHide: true, timeout, maxBuffer: 1000000 })).stdout;
const call = args => command(docker, ['--context', context, ...args]);
const save = (n, v) => writeFile(join(directory, n), JSON.stringify(v, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const hash = b => createHash('sha256').update(b).digest('hex');
const startedUtc = new Date().toISOString(), started = performance.now(), artifacts = [], diskSamples = [], probes = [];
let stage = 'preflight', result;
async function disk(initial = false) { const d = await statfs(process.cwd()); const v = verifyDiskBudget(d.bavail * d.bsize, initial); diskSamples.push({ stage, ...v }); }
async function source() {
  assert.equal((await command('git', ['rev-parse', 'HEAD'])).trim(), revision);
  assert.equal((await command('git', ['status', '--porcelain'])).trim(), '');
}
async function parentGate() {
  for (const [tag, id] of Object.entries(parents)) assert.equal(JSON.parse(await call(['image', 'inspect', tag]))[0].Id, id);
}
try {
  assert(/^[a-f0-9]{40}$/u.test(revision ?? '')); assert(/^[A-Z]:[\\/]/iu.test(docker ?? ''));
  const user = (await command('whoami', [])).trim(); assert(/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user));
  await command('icacls', [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
  await disk(true); await source(); await parentGate();
  verifyBuilder({ contextName: context, builderName: context, contexts: JSON.parse(await call(['context', 'inspect', context])),
    builders: (await call(['buildx', 'ls', '--format', 'json'])).trim().split(/\r?\n/u).map(JSON.parse) });
  // Verify dependency inputs in retained runtime parents before reusing them.
  const inputCode = "const fs=require('node:fs'),c=require('node:crypto');console.log(JSON.stringify(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'].map(n=>[n,c.createHash('sha256').update(fs.readFileSync('/workspace/'+n)).digest('hex')])));";
  const expected = await Promise.all(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json', 'tsconfig.json'].map(async n => [n, hash(await readFile(n))]));
  for (const id of Object.values(parents)) assert.deepEqual(JSON.parse(await call(['run', '--rm', '--pull=never', '--network', 'none', '--user', '1000:1000', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node', id, '-e', inputCode])), expected);
  await save('attempt.json', { revision, parents, startedUtc, attemptsPerRole: 1, runtimeDependencyInputsMatch: true });
  for (const role of ['test', 'authorization', 'control']) {
    stage = 'build_' + role; await disk();
    const tag = `wepuu-r10-${role}:${revision.slice(0, 12)}-${nonce}`;
    verifyUnusedTag(await call(['image', 'ls', '--quiet', '--filter', 'reference=' + tag]));
    const iid = join(directory, role + '.iid'), metadata = join(directory, role + '.metadata.private.json');
    await save(role + '-attempt.json', { role, tag, startedUtc: new Date().toISOString(), attempts: 1 });
    const out = await open(join(directory, role + '.stdout.private.log'), 'wx', 0o600), err = await open(join(directory, role + '.stderr.private.log'), 'wx', 0o600);
    let outcome;
    try {
      outcome = await new Promise(resolve => {
        let timedOut = false, spawnFailed = false, lowDisk = false, hardStop;
        const child = spawn(docker, ['--context', context, 'buildx', 'build', '--builder', context, '--platform', 'linux/amd64',
          '--network', 'none', '--pull=false', '--load', '--target', role, '--iidfile', iid, '--metadata-file', metadata,
          '--build-arg', `WEPUU_SOURCE_REVISION=${revision}`, '--file', 'deploy/R10.Containerfile', '--tag', tag, '--progress', 'plain', '.'],
        { env, windowsHide: true, stdio: ['ignore', out.fd, err.fd] });
        const stop = () => { child.kill('SIGTERM'); hardStop ??= setTimeout(() => child.kill('SIGKILL'), 10000); };
        const timer = setTimeout(() => { timedOut = true; stop(); }, 600000);
        const monitor = setInterval(() => { statfs(process.cwd()).then(d => { try { verifyDiskBudget(d.bavail * d.bsize); } catch { lowDisk = true; stop(); } }).catch(() => { lowDisk = true; stop(); }); }, 3000);
        child.once('error', () => { spawnFailed = true; });
        child.once('close', (code, signal) => { clearTimeout(timer); clearInterval(monitor); clearTimeout(hardStop); resolve({ code, signal, timedOut, spawnFailed, lowDisk }); });
      });
    } finally { await out.close(); await err.close(); }
    await save(role + '-process.json', outcome); verifyBuildProcess(outcome); assert(!outcome.lowDisk);
    const artifact = verifyAuthorizationArtifact({ exitCode: outcome.code, revision, tag, artifactRole: role,
      iid: await readFile(iid, 'utf8'), metadata: JSON.parse(await readFile(metadata, 'utf8')), images: JSON.parse(await call(['image', 'inspect', tag])) });
    artifacts.push({ role, tag, ...artifact }); await save(role + '-artifact.json', artifacts.at(-1));
    stage = 'probe_' + role;
    probes.push(JSON.parse(await call(['run', '--rm', '--pull=never', '--network', 'none', '--user', '1000:1000', '--read-only',
      '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node', artifact.imageId, '-e', compiledIdentityCode])));
    await source(); await parentGate();
  }
  stage = 'compiled_identity'; const compiledIdentity = verifyCompiledIdentity(probes); await disk();
  result = { passed: true, artifacts, compiledIdentity };
} catch (error) { result = { passed: false, failedStage: stage, category: publicBuildFailure(error), artifacts, rawOutputSuppressed: true }; }
Object.assign(result, { revision, directory, startedUtc, finishedUtc: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
  diskSamples, automaticRetryPerformed: false, databaseStarted: false, registryPushed: false, productionAccessed: false });
await save('result.json', result); console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
