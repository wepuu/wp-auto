// R13: standalone local unit only. Importing this file never invokes Docker.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, mkdtemp, writeFile, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compiledIdentityCode, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
import { validateStructuredReport } from '../test/persistent-authorization/r10/report-schema.mjs';
import { offlineSkipFiles } from '../test/persistent-authorization/r10/profiles.mjs';
const IMAGE = 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c';
const REVISION = 'c404ed52228ce5492a85674547998d2f5d31772e';
const DIR = 'test/persistent-authorization/r10';
const HELPERS = ['evidence.mjs', 'export-evidence.mjs', 'fixed-node-test.mjs', 'profiles.mjs', 'report-schema.mjs', 'reported-process.mjs', 'reporter.mjs', 'unit-manifest.json', 'unit.mjs'];
export const overlayFiles = Object.freeze([...HELPERS.map(f => DIR + '/' + f),
  'test/persistent-authorization/database-tests.mjs', 'scripts/persistent-report-channel.test.mjs',
  'scripts/persistent-test-result.mjs', 'scripts/fixed-node-test.test.mjs',
  'scripts/persistent-pnpm-r1.legacy-probe.mjs', 'scripts/persistent-r10.test.mjs', 'scripts/persistent-nested-report.test.mjs']);
const PINNED = Object.freeze({
  'scripts/persistent-r10.test.mjs': '654d528e1eb1f1c11f3eebbee7b73d6d7dd2fac216cfe177086d4d1eed2ecc11',
  'scripts/persistent-nested-report.test.mjs': '9fb419c3f598301b94254c835107dcfe367f7616be471ac4a97d7d0547538f4e',
  [DIR + '/unit-manifest.json']: '50132d7047b6a90986b48a7a0a5d4681423af11ba015f78ca88da2d94692e827',
  [DIR + '/reporter.mjs']: '63d9ce88223fa41365116e7ffdc692a20b2b8e49e1eb8293f7179c5de81223cc',
  [DIR + '/report-schema.mjs']: '414e7b3fc37a995809e9b92a6d65799bf8065f38eef395aa0da6162227e772ca',
  [DIR + '/reported-process.mjs']: 'e9958598b30c06df3ca68c1b264b23a3b3e1805a1fa71df106716b5a69053824',
  [DIR + '/fixed-node-test.mjs']: '7d3eed6e61d4c91df9c18898dfe741b78f4250c27e4628ddcb3df2e2613863db',
  [DIR + '/profiles.mjs']: 'd531216b1454f787244813d05ecc0e1f75e354f57e2b4f2bc1cb06596a078f0c'
});
const deny = code => { throw Object.assign(Error('r13_gate_denied'), { code }); };
const CODES = new Set(['OVERLAY_MANIFEST_DRIFT', 'UNIT_ENVELOPE_NOT_CONFIRMED', 'UNIT_GATE_FAILED', 'OWNED_CONTAINER_NOT_CONFIRMED', 'UNIT_CONTAINER_FAILED', 'POSTCHECK_NOT_CONFIRMED', 'SOURCE_NOT_CLEAN', 'SOURCE_INPUT_CHANGED', 'FROZEN_INPUT_CHANGED', 'UNIT_MANIFEST_DRIFT', 'EVIDENCE_NOT_PRIVATE', 'EVIDENCE_SAVE_FAILED', 'PROBE_NOT_CONFIRMED', 'RUNTIME_NOT_CONFIRMED', 'LOCAL_CONTEXT_REQUIRED', 'IMAGE_ID_OR_PLATFORM_MISMATCH', 'IMAGE_REVISION_MISMATCH', 'DISK_BUDGET_NOT_MET']);
const failure = e => CODES.has(e?.code) ? e.code : e?.killed ? 'TRANSPORT_TIMEOUT' : 'LOCAL_GATE_NOT_CONFIRMED';
export function mountPlan(root, files = overlayFiles) {
  if (JSON.stringify(files) !== JSON.stringify(overlayFiles)) deny('OVERLAY_MANIFEST_DRIFT');
  return files.flatMap(f => [{ source: path.resolve(root, f), target: '/workspace/' + f, readonly: true },
    ...(f.startsWith(DIR + '/') ? [{ source: path.resolve(root, f), target: '/harness/r10/' + path.basename(f), readonly: true }] : [])]);
}
export function unitProjection(output, files) {
  try {
    const v = JSON.parse(output), report = v.report && validateStructuredReport(v.report, { files, phase: 'unit' });
    const out = projectEvidence('unit-tests.json', v);
    if (['manifest', 'fixed_runtime', 'unit_process'].includes(v.stage)) out.stage = v.stage;
    if (report) {
      out.skipSummary = [];
      for (const skip of report.skips) {
        const allowed = offlineSkipFiles.some(f => f === skip.file || f === path.posix.basename(skip.file));
        if (skip.allowed !== allowed) deny('UNIT_ENVELOPE_NOT_CONFIRMED');
        let row = out.skipSummary.find(s => s.file === skip.file);
        if (!row) { row = { file: skip.file, allowed, count: 0 }; out.skipSummary.push(row); }
        row.count++;
      }
    }
    out.passed = v.passed === true && out.category === 'PASS' && out.reportStatus === 'VALID'
      && report?.passed === true && report.fileCount === files.length && !report.skips.some(s => !s.allowed)
      && v.process?.completed === true && v.process.exitCode === 0 && v.process.signal === null
      && v.process.spawnFailed === false && v.process.timedOut === false && v.process.outputLimitExceeded === false;
    return out;
  } catch { deny('UNIT_ENVELOPE_NOT_CONFIRMED'); }
}
// The exact lifecycle is injected only for offline mocks; production uses Docker below.
export async function singleUnit(io, files, run) {
  const r = { unitAttempts: 0, passed: false }; let created = false;
  try {
    r.stage = 'unit_create'; await io.create(); created = true;
    r.stage = 'unit_start'; r.unitAttempts = 1;
    let execution;
    try { execution = await io.start(); }
    catch (e) { execution = { output: typeof e.stdout === 'string' ? e.stdout : '', failed: true }; }
    r.stage = 'unit_report'; r.unit = unitProjection(execution.output, files);
    r.passed = execution.failed !== true && r.unit.passed;
    if (!r.passed) r.failure = 'UNIT_GATE_FAILED';
  } catch (e) { r.passed = false; r.failure = failure(e); }
  finally {
    if (created) {
      try {
        let c = await io.inspect();
        if (c?.Config?.Labels?.['wepuu.run'] !== run) deny('OWNED_CONTAINER_NOT_CONFIRMED');
        if (c.State?.Running) { await io.stop(); c = await io.inspect(); }
        if (c?.Config?.Labels?.['wepuu.run'] !== run) deny('OWNED_CONTAINER_NOT_CONFIRMED');
        r.container = { stopped: c.State?.Running === false, exitCode: c.State?.ExitCode ?? null, oomKilled: c.State?.OOMKilled === true };
        if (!r.container.stopped || r.container.oomKilled || r.container.exitCode !== 0) { r.passed = false; r.containerGateFailure = 'UNIT_CONTAINER_FAILED'; }
      } catch (e) { r.passed = false; r.cleanupFailure = failure(e); }
    }
    try { r.postcheck = await io.postcheck(); if (r.postcheck?.passed !== true) deny('POSTCHECK_NOT_CONFIRMED'); }
    catch (e) { r.passed = false; r.postcheckFailure = failure(e); }
  }
  return r;
}
export async function saveResult(result, save) {
  try { await save(result); return { ...result, evidenceSaved: true }; }
  catch { return { ...result, passed: false, evidenceSaved: false, evidenceFailure: 'EVIDENCE_SAVE_FAILED' }; }
}
const hash = b => createHash('sha256').update(b).digest('hex');
async function hashes(files) {
  const out = {};
  for (const f of files) { const s = await lstat(f); if (!s.isFile() || s.isSymbolicLink()) deny('FROZEN_INPUT_CHANGED'); out[f] = hash(await readFile(f)); }
  return out;
}
export async function main() {
  const root = process.cwd(), run = 'r13-' + new Date().toISOString().replace(/[^0-9]/g, ''), name = 'wepuu-' + run;
  const docker = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
  const exec = promisify(execFile), invoke = (exe, args, timeout = 15000) => exec(exe, args, { cwd: root, timeout, maxBuffer: 2 * 1024 ** 2, windowsHide: true });
  const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
  const json = async args => JSON.parse((await d(args)).stdout);
  const disk = async initial => { const s = await statfs(root); return verifyDiskBudget(s.bavail * s.bsize, initial); };
  const result = { run, startedAt: new Date().toISOString(), unitAttempts: 0, passed: false,
    database: 'NOT_RUN', legacy014: 'NOT_RUN', ab: 'NOT_RUN', production: 'NOT_RUN' };
  let evidenceDirectory, probeCreated = false;
  const base = ['--pull=never', '--network', 'none', '--user', '1000:1000', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'];
  try {
    result.stage = 'source';
    if ((await invoke('git', ['status', '--porcelain'])).stdout !== '') deny('SOURCE_NOT_CLEAN');
    result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
    await invoke('git', ['merge-base', '--is-ancestor', 'a97ef69', 'HEAD']);
    if ((await invoke('git', ['diff', '--name-only', REVISION, '--', 'apps', 'packages', 'pnpm-lock.yaml', 'package.json', '.npmrc', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json'])).stdout !== '') deny('SOURCE_INPUT_CHANGED');
    assert.deepEqual((await readdir(DIR)).sort(), HELPERS.slice().sort());
    result.overlayHashes = await hashes(overlayFiles);
    for (const [f, sha] of Object.entries(PINNED)) if (result.overlayHashes[f] !== sha) deny('FROZEN_INPUT_CHANGED');
    result.coordinatorHashes = await hashes(['scripts/run-r13-unit.mjs', 'scripts/r13-unit-coordinator.synthetic.mjs']);
    const files = JSON.parse(await readFile(DIR + '/unit-manifest.json', 'utf8'));
    if (files.length !== 56 || new Set(files).size !== 56 || JSON.stringify(files) !== JSON.stringify([...files].sort())) deny('UNIT_MANIFEST_DRIFT');
    result.manifestFiles = files.length; result.diskBefore = await disk(true);
    result.stage = 'evidence_directory'; evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'wepuu-r13-unit-'));
    const who = (await invoke('whoami', [])).stdout.trim();
    await invoke('icacls.exe', [evidenceDirectory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
    if (!(await checkWindowsEvidenceAcl(evidenceDirectory, [])).verified) deny('EVIDENCE_NOT_PRIVATE');
    result.evidenceAclVerified = true;
    result.stage = 'image'; verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
    result.image = verifyIntegrationImage(await json(['image', 'inspect', IMAGE]), IMAGE, 'test', REVISION);
    result.stage = 'probe';
    const probeCode = compiledIdentityCode + `\nimport('/workspace/${DIR}/fixed-node-test.mjs').then(async m=>console.log(JSON.stringify({runtime:(await m.fixedNodeTestCommand()).identity}))).catch(()=>{process.exitCode=1;});`;
    await d(['create', '--name', name + '-probe', '--label', 'wepuu.run=' + run, ...base,
      '--mount', `type=bind,source=${path.resolve(DIR + '/fixed-node-test.mjs')},target=/workspace/${DIR}/fixed-node-test.mjs,readonly`, IMAGE, 'node', '-e', probeCode]);
    probeCreated = true;
    const lines = (await d(['start', '-a', name + '-probe'], 30000)).stdout.trim().split(/\r?\n/u);
    if (lines.length !== 2) deny('PROBE_NOT_CONFIRMED');
    result.compiled = JSON.parse(lines[0]); result.runtime = JSON.parse(lines[1]).runtime;
    if (result.compiled.hash !== 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373'
      || result.compiled.files !== 163 || result.compiled.version !== 'v24.22.1' || result.compiled.lts !== 'Krypton' || result.compiled.uid !== 1000) deny('PROBE_NOT_CONFIRMED');
    if (result.runtime?.version !== 'v24.22.1' || result.runtime.uid !== 1000 || result.runtime.tsxVersion !== '4.23.13'
      || result.runtime.entrySha256 !== '7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d') deny('RUNTIME_NOT_CONFIRMED');
    const probe = (await json(['inspect', name + '-probe']))[0];
    if (probe.Config?.Labels?.['wepuu.run'] !== run || probe.State.Running || probe.State.ExitCode !== 0 || probe.State.OOMKilled) deny('PROBE_NOT_CONFIRMED');
    result.probeStopped = true;
    const mounts = mountPlan(root).flatMap(m => ['--mount', `type=bind,source=${m.source},target=${m.target},readonly`]);
    await disk(false);
    if (JSON.stringify(await hashes(overlayFiles)) !== JSON.stringify(result.overlayHashes)) deny('FROZEN_INPUT_CHANGED');
    Object.assign(result, await singleUnit({
      create: () => d(['create', '--name', name, '--label', 'wepuu.run=' + run, ...base,
        '--tmpfs', '/evidence:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700', ...mounts, IMAGE, 'node', '/harness/r10/unit.mjs']),
      start: async () => ({ output: (await d(['start', '-a', name], 260000)).stdout, failed: false }),
      inspect: async () => (await json(['inspect', name]))[0], stop: () => d(['stop', '--time', '2', name]),
      postcheck: async () => {
        const unchanged = JSON.stringify(await hashes(overlayFiles)) === JSON.stringify(result.overlayHashes)
          && JSON.stringify(await hashes(Object.keys(result.coordinatorHashes))) === JSON.stringify(result.coordinatorHashes)
          && (await invoke('git', ['status', '--porcelain'])).stdout === '';
        return { passed: unchanged, inputsUnchanged: unchanged, disk: await disk(false) };
      }
    }, files, run));
  } catch (e) { result.passed = false; result.failure = failure(e); }
  finally {
    if (probeCreated) {
      try {
        let c = (await json(['inspect', name + '-probe']))[0];
        if (c.Config?.Labels?.['wepuu.run'] !== run) deny('OWNED_CONTAINER_NOT_CONFIRMED');
        if (c.State.Running) { await d(['stop', '--time', '2', name + '-probe']); c = (await json(['inspect', name + '-probe']))[0]; }
        if (c.State.Running) deny('OWNED_CONTAINER_NOT_CONFIRMED'); result.probeStopped = true;
      } catch (e) { result.passed = false; result.probeCleanupFailure = failure(e); }
    }
    result.finishedAt = new Date().toISOString();
    const final = await saveResult(result, async value => {
      if (!evidenceDirectory) deny('EVIDENCE_SAVE_FAILED');
      if (!(await checkWindowsEvidenceAcl(evidenceDirectory, [])).verified) deny('EVIDENCE_NOT_PRIVATE');
      await writeFile(path.join(evidenceDirectory, 'result.json'), JSON.stringify({ ...value, evidenceSaved: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    });
    console.log(JSON.stringify({ ...final, evidenceDirectory }, null, 2));
    if (!final.passed) process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
