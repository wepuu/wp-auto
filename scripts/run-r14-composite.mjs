// Required host config rendering AND one readonly-container unit gate. No services.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, mkdtemp, mkdir, writeFile, statfs } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountPlan, overlayFiles, singleUnit, saveResult } from './run-r13-unit.mjs';
import { renderInvocation, renderProjection, compositeGate } from './wordpress-site-b-render-contract.mjs';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
import { compiledIdentityCode, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
const IMAGE = 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c';
const REVISION = 'c404ed52228ce5492a85674547998d2f5d31772e', DIR = 'test/persistent-authorization/r10';
const template = 'deploy/wpauto-vps/compose.wordpress-e2e-b.yaml';
const templateFiles = [template, 'deploy/wpauto-vps/compose.wordpress-e2e.yaml', 'deploy/wpauto-vps/nginx.test2.wpauto.cc.conf'];
const toolFiles = ['scripts/run-r14-composite.mjs', 'scripts/r14-composite.synthetic.mjs', 'scripts/wordpress-site-b-render-contract.mjs',
  'scripts/run-r13-unit.mjs', 'scripts/local-evidence-acl.mjs', 'scripts/persistent-image-contract.mjs'];
const inputFiles = [...overlayFiles, 'scripts/wordpress-site-b-template.test.mjs', ...templateFiles, ...toolFiles];
const sha = b => createHash('sha256').update(b).digest('hex');
const deny = code => { throw Object.assign(Error('r14_gate_denied'), { code }); };
const safeCodes = new Set(['SOURCE_NOT_CLEAN', 'SOURCE_INPUT_CHANGED', 'FROZEN_INPUT_CHANGED', 'EVIDENCE_NOT_PRIVATE', 'VERSION_NOT_CONFIRMED', 'UNIT_MANIFEST_DRIFT', 'PROBE_NOT_CONFIRMED', 'OWNED_PROBE_NOT_STOPPED', 'DISK_BUDGET_NOT_MET', 'LOCAL_CONTEXT_REQUIRED', 'IMAGE_REVISION_MISMATCH', 'IMAGE_ID_OR_PLATFORM_MISMATCH']);
const category = e => safeCodes.has(e?.code) ? e.code : e?.killed ? 'LOCAL_TRANSPORT_TIMEOUT' : 'LOCAL_GATE_NOT_CONFIRMED';
async function hashes(files) {
  const out = {};
  for (const f of files) { const s = await lstat(f); if (!s.isFile() || s.isSymbolicLink()) deny('FROZEN_INPUT_CHANGED'); out[f] = sha(await readFile(f)); }
  return out;
}
export async function main() {
  const root = process.cwd(), run = 'r14-' + new Date().toISOString().replace(/[^0-9]/g, ''), name = 'wepuu-' + run;
  const resources = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources';
  const docker = path.join(resources, 'bin', 'docker.exe'), plugin = path.join(resources, 'cli-plugins', 'docker-compose.exe');
  const exec = promisify(execFile), invoke = (exe, args, timeout = 15000, env) => exec(exe, args,
    { cwd: root, timeout, env, maxBuffer: 1024 ** 2, windowsHide: true, shell: false });
  const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
  const json = async args => JSON.parse((await d(args)).stdout);
  const disk = async initial => { const s = await statfs(root); return verifyDiskBudget(s.bavail * s.bsize, initial); };
  const result = { run, startedAt: new Date().toISOString(), passed: false, renderAttempts: 0, unitAttempts: 0,
    database: 'NOT_RUN', legacy014: 'NOT_RUN', ab: 'NOT_RUN', production: 'NOT_RUN', rawOutputSuppressed: true };
  let evidenceDirectory, probeCreated = false;
  const base = ['--pull=never', '--network', 'none', '--user', '1000:1000', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'];
  try {
    result.stage = 'source';
    if ((await invoke('git', ['status', '--porcelain'])).stdout !== '') deny('SOURCE_NOT_CLEAN');
    result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
    await invoke('git', ['merge-base', '--is-ancestor', '31c6ced', 'HEAD']);
    if ((await invoke('git', ['diff', '--name-only', REVISION, '--', 'apps', 'packages', 'deploy', 'pnpm-lock.yaml', 'package.json', '.npmrc', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json'])).stdout !== '') deny('SOURCE_INPUT_CHANGED');
    if ((await invoke('git', ['diff', '--name-only', '31c6ced', '--', 'test/persistent-authorization', 'scripts/run-r13-unit.mjs', 'scripts/persistent-r10.test.mjs', 'scripts/persistent-nested-report.test.mjs'])).stdout !== '') deny('FROZEN_INPUT_CHANGED');
    result.inputHashes = await hashes(inputFiles); result.binaryHashes = await hashes([docker, plugin]);
    const files = JSON.parse(await readFile(DIR + '/unit-manifest.json', 'utf8'));
    if (files.length !== 56 || new Set(files).size !== 56 || JSON.stringify(files) !== JSON.stringify([...files].sort())) deny('UNIT_MANIFEST_DRIFT');
    result.manifestFiles = files.length; result.diskBefore = await disk(true);
    result.stage = 'evidence'; evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'wepuu-r14-composite-'));
    const who = (await invoke('whoami', [])).stdout.trim();
    await invoke('icacls.exe', [evidenceDirectory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
    if (!(await checkWindowsEvidenceAcl(evidenceDirectory, [])).verified) deny('EVIDENCE_NOT_PRIVATE'); result.evidenceAclVerified = true;
    const configDir = path.join(evidenceDirectory, 'docker-config'), emptyEnv = path.join(evidenceDirectory, 'empty.env');
    await mkdir(configDir, { mode: 0o700 });
    await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ cliPluginsExtraDirs: [path.dirname(plugin)], auths: {} }), { flag: 'wx', mode: 0o600 });
    await writeFile(emptyEnv, '', { flag: 'wx', mode: 0o600 });
    const render = renderInvocation({ docker, configDir, emptyEnv, template: path.resolve(template), systemRoot: process.env.SystemRoot,
      temp: evidenceDirectory, pluginParent: path.dirname(docker), run });
    result.stage = 'versions';
    const dockerVersion = (await invoke(docker, ['--config', configDir, '--version'], 15000, render.env)).stdout.trim();
    const composeVersion = (await invoke(docker, ['--config', configDir, 'compose', 'version', '--short'], 15000, render.env)).stdout.trim();
    const version = dockerVersion.match(/Docker version ([0-9][A-Za-z0-9.+-]*)/u)?.[1];
    if (!version || !/^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(composeVersion)) deny('VERSION_NOT_CONFIRMED');
    result.versions = { docker: version, compose: composeVersion };
    result.stage = 'image'; verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
    result.image = verifyIntegrationImage(await json(['image', 'inspect', IMAGE]), IMAGE, 'test', REVISION);
    result.stage = 'probe';
    const code = compiledIdentityCode + `\nimport('/workspace/${DIR}/fixed-node-test.mjs').then(async m=>console.log(JSON.stringify({runtime:(await m.fixedNodeTestCommand()).identity}))).catch(()=>{process.exitCode=1;});`;
    await d(['create', '--name', name + '-probe', '--label', 'wepuu.run=' + run, ...base, '--mount',
      `type=bind,source=${path.resolve(DIR + '/fixed-node-test.mjs')},target=/workspace/${DIR}/fixed-node-test.mjs,readonly`, IMAGE, 'node', '-e', code]);
    probeCreated = true;
    const lines = (await d(['start', '-a', name + '-probe'], 30000)).stdout.trim().split(/\r?\n/u);
    if (lines.length !== 2) deny('PROBE_NOT_CONFIRMED');
    result.compiled = JSON.parse(lines[0]); result.runtime = JSON.parse(lines[1]).runtime;
    if (result.compiled.hash !== 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373' || result.compiled.files !== 163
      || result.compiled.version !== 'v24.22.1' || result.compiled.lts !== 'Krypton' || result.compiled.uid !== 1000
      || result.runtime?.version !== 'v24.22.1' || result.runtime.uid !== 1000 || result.runtime.tsxVersion !== '4.23.13'
      || result.runtime.entrySha256 !== '7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d') deny('PROBE_NOT_CONFIRMED');
    const c = (await json(['inspect', name + '-probe']))[0];
    if (c.Config?.Labels?.['wepuu.run'] !== run || c.State.Running || c.State.ExitCode !== 0 || c.State.OOMKilled) deny('PROBE_NOT_CONFIRMED');
    result.probeStopped = true;
    const unchanged = async () => JSON.stringify(await hashes(inputFiles)) === JSON.stringify(result.inputHashes)
      && JSON.stringify(await hashes([docker, plugin])) === JSON.stringify(result.binaryHashes)
      && (await invoke('git', ['status', '--porcelain'])).stdout === '';
    const postcheck = async () => ({ passed: await unchanged(), inputsUnchanged: await unchanged(), disk: await disk(false) });
    const mounts = [...mountPlan(root), { source: path.resolve('scripts/wordpress-site-b-template.test.mjs'), target: '/workspace/scripts/wordpress-site-b-template.test.mjs', readonly: true }]
      .flatMap(m => ['--mount', `type=bind,source=${m.source},target=${m.target},readonly`]);
    result.stage = 'composite';
    result.gates = await compositeGate({
      render: async () => {
        if (!(await unchanged())) deny('FROZEN_INPUT_CHANGED'); await disk(false); result.renderAttempts = 1;
        let process;
        try { process = { output: (await invoke(render.executable, render.args, 30000, render.env)).stdout, exitCode: 0, signal: null }; }
        catch (e) { process = { output: '', exitCode: typeof e.code === 'number' ? e.code : null, signal: e.signal ?? null,
          unavailable: e.code === 'ENOENT', outputLimitExceeded: e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          timedOut: e.killed === true && e.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }; }
        return renderProjection(process);
      },
      unit: async () => {
        if (!(await unchanged())) deny('FROZEN_INPUT_CHANGED'); await disk(false);
        const unit = await singleUnit({
          create: () => d(['create', '--name', name, '--label', 'wepuu.run=' + run, ...base, '--tmpfs', '/evidence:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700', ...mounts, IMAGE, 'node', '/harness/r10/unit.mjs']),
          start: async () => { result.unitAttempts = 1; return { output: (await d(['start', '-a', name], 260000)).stdout, failed: false }; },
          inspect: async () => (await json(['inspect', name]))[0], stop: () => d(['stop', '--time', '2', name]), postcheck
        }, files, run);
        return unit;
      }, postcheck
    });
    result.passed = result.gates.passed;
  } catch (e) { result.passed = false; result.failure = category(e); }
  finally {
    if (probeCreated) {
      try {
        let c = (await json(['inspect', name + '-probe']))[0];
        if (c.Config?.Labels?.['wepuu.run'] !== run) deny('OWNED_PROBE_NOT_STOPPED');
        if (c.State.Running) { await d(['stop', '--time', '2', name + '-probe']); c = (await json(['inspect', name + '-probe']))[0]; }
        if (c.State.Running) deny('OWNED_PROBE_NOT_STOPPED'); result.probeStopped = true;
      } catch (e) { result.passed = false; result.probeCleanupFailure = category(e); }
    }
    result.finishedAt = new Date().toISOString();
    const final = await saveResult(result, async value => {
      if (!evidenceDirectory || !(await checkWindowsEvidenceAcl(evidenceDirectory, [])).verified) deny('EVIDENCE_NOT_PRIVATE');
      await writeFile(path.join(evidenceDirectory, 'result.json'), JSON.stringify({ ...value, evidenceSaved: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    });
    console.log(JSON.stringify({ ...final, evidenceDirectory }, null, 2)); if (!final.passed) process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
