// One-shot local unit gate. No service startup, network, database or image build.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, mkdtemp, writeFile, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compiledIdentityCode, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
const exec = promisify(execFile), root = process.cwd();
const docker = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
const image = 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c';
const revision = 'c404ed52228ce5492a85674547998d2f5d31772e';
const run = 'r11-' + new Date().toISOString().replace(/[^0-9]/g, '');
const name = 'wepuu-' + run;
const invoke = (exe, args, timeout = 15000) => exec(exe, args, { cwd: root, timeout, maxBuffer: 2 * 1024 ** 2, windowsHide: true });
const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
const json = async args => JSON.parse((await d(args)).stdout);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const dir = 'test/persistent-authorization/r10';
const names = ['evidence.mjs', 'export-evidence.mjs', 'fixed-node-test.mjs', 'profiles.mjs', 'report-schema.mjs', 'reported-process.mjs', 'reporter.mjs', 'unit-manifest.json', 'unit.mjs'];
const overlays = [...names.map(n => dir + '/' + n), 'test/persistent-authorization/database-tests.mjs',
  'scripts/persistent-report-channel.test.mjs', 'scripts/persistent-test-result.mjs',
  'scripts/fixed-node-test.test.mjs', 'scripts/persistent-pnpm-r1.legacy-probe.mjs'];
async function hashes() {
  const result = {};
  for (const file of overlays) {
    const meta = await lstat(file); assert(meta.isFile() && !meta.isSymbolicLink());
    result[file] = digest(await readFile(file));
  }
  return result;
}
async function disk(initial = false) {
  const s = await statfs(root); return verifyDiskBudget(s.bavail * s.bsize, initial);
}
let evidenceDirectory, created = false;
const result = { run, startedAt: new Date().toISOString(), unitAttempts: 0, database: 'NOT_RUN', legacy014: 'NOT_RUN', ab: 'NOT_RUN', production: 'NOT_RUN', passed: false };
try {
  assert.equal((await invoke('git', ['status', '--porcelain'])).stdout, '');
  result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
  assert.equal((await invoke('git', ['diff', '--name-only', revision, '--', 'apps', 'packages', 'pnpm-lock.yaml', 'package.json', '.npmrc', 'pnpm-workspace.yaml'])).stdout, '');
  assert.deepEqual((await readdir(dir)).sort(), names.slice().sort());
  result.overlayHashes = await hashes(); result.diskBefore = await disk(true);
  verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
  result.image = verifyIntegrationImage(await json(['image', 'inspect', image]), image, 'test', revision);
  const old = (await json(['inspect', 'wepuu-r11-launch-synthetic-20261024a']))[0];
  assert.equal(old.State.Running, false); assert.equal(old.State.ExitCode, 0);
  result.syntheticContainerStopped = true;
  const base = ['--pull=never', '--network', 'none', '--user', '1000:1000', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'];
  result.compiled = JSON.parse((await d(['run', '--rm', ...base, image, 'node', '-e', compiledIdentityCode], 30000)).stdout);
  assert.equal(result.compiled.hash, 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373');
  assert.equal(result.compiled.files, 163); assert.equal(result.compiled.version, 'v24.22.1'); assert.equal(result.compiled.uid, 1000);
  evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'wepuu-r11-unit-'));
  const who = (await invoke('whoami', [])).stdout.trim();
  await invoke('icacls.exe', [evidenceDirectory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
  const mounts = [];
  for (const file of overlays) {
    mounts.push('--mount', `type=bind,source=${path.resolve(file)},target=/workspace/${file},readonly`);
    if (file.startsWith(dir + '/')) mounts.push('--mount', `type=bind,source=${path.resolve(file)},target=/harness/r10/${path.basename(file)},readonly`);
  }
  await disk();
  await d(['create', '--name', name, '--label', 'wepuu.run=' + run, ...base, '--tmpfs', '/evidence:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700', ...mounts, image, 'node', '/harness/r10/unit.mjs']);
  created = true; result.unitAttempts = 1;
  let output, failed = false;
  try { output = (await d(['start', '-a', name], 260000)).stdout; }
  catch (e) { failed = true; output = typeof e.stdout === 'string' ? e.stdout : ''; }
  try {
    const value = JSON.parse(output.trim()); result.unit = projectEvidence('unit-tests.json', value);
    if (['manifest', 'fixed_runtime', 'unit_process'].includes(value.stage)) result.unit.stage = value.stage;
    result.passed = !failed && result.unit.passed;
  } catch { result.failure = 'UNIT_ENVELOPE_NOT_CONFIRMED'; }
} catch {
  result.passed = false; result.failure ??= 'LOCAL_GATE_NOT_CONFIRMED';
} finally {
  if (created) {
    try {
      let c = (await json(['inspect', name]))[0]; assert.equal(c.Config.Labels['wepuu.run'], run);
      if (c.State.Running) await d(['stop', '--time', '2', name]);
      c = (await json(['inspect', name]))[0];
      result.container = { stopped: !c.State.Running, exitCode: c.State.ExitCode, oomKilled: c.State.OOMKilled };
      if (c.State.Running || c.State.OOMKilled || c.State.ExitCode !== 0) result.passed = false;
    } catch { result.passed = false; result.cleanup = 'NOT_CONFIRMED'; }
  }
  try {
    result.inputsUnchanged = JSON.stringify(await hashes()) === JSON.stringify(result.overlayHashes)
      && (await invoke('git', ['status', '--porcelain'])).stdout === '';
    result.diskAfter = await disk(); if (!result.inputsUnchanged) result.passed = false;
  } catch { result.passed = false; result.postcheck = 'NOT_CONFIRMED'; }
  result.finishedAt = new Date().toISOString();
  if (evidenceDirectory) await writeFile(path.join(evidenceDirectory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...result, evidenceDirectory }, null, 2));
  if (!result.passed) process.exitCode = 1;
}
