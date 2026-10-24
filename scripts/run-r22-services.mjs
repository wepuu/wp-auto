// R22 runs only the four approved service scenarios. Importing never starts Docker.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, mkdtemp, writeFile, mkdir, statfs } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
import { saveResult } from './run-r13-unit.mjs';
import { fixtures } from './run-r21-database.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
import { compiledIdentityCode, verifyCompiledIdentity, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
import { steps, lastResult, project, verifyScenario } from '../test/persistent-authorization/r22/report.mjs';
export const images = Object.freeze({
 authorization: 'sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f',
 control: 'sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c',
 test: 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c'
});
const PG = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const REV = 'c404ed52228ce5492a85674547998d2f5d31772e';
export const budgets = Object.freeze({ startup: 120000, control: 300000, matrix: 300000, transition: 300000 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const deny = code => { throw Object.assign(Error('R22_GATE_DENIED'), { code }); };
export function nextAllowed(step, results) { return steps.includes(step) && results.length === steps.indexOf(step) && results.every((v, i) => v.step === steps[i] && v.passed === true); }
export function ownedState(c, run, name, phase = 'r22-services') {
 if (!['r22-services','r23-control'].includes(phase) || c?.Name !== '/' + name || c.Config?.Labels?.['wepuu.run'] !== run || c.Config?.Labels?.['wepuu.phase'] !== phase) deny('OWNERSHIP_NOT_CONFIRMED');
 return { name, stopped: c.State?.Running === false, exitCode: c.State?.ExitCode, oomKilled: c.State?.OOMKilled === true };
}
export async function scenarioOnce(step, operate, ledger, options) {
 if (!steps.includes(step)) deny('SCENARIO_NOT_CONFIRMED');
 const began = performance.now(), result = { step, attempts: 1, passed: false, startedAt: new Date().toISOString(), rawOutputSuppressed: true };
 let text, failure;
 try { text = await operate(); } catch (e) { failure = e; text = e?.stdout; }
 const value = lastResult(text);
 result.transport = { completed: !failure || Number.isSafeInteger(failure?.code), timedOut: failure?.killed === true,
  exitCode: failure ? Number.isSafeInteger(failure.code) ? failure.code : null : 0 };
 if (value) result.evidence = project(value);
 try { result.evidence = verifyScenario(value, step, ledger, options); result.passed = !failure; } catch { /* keep the first safe report, never promote partial success */ }
 result.category = result.passed ? 'PASS' : failure?.killed ? 'TRANSPORT_TIMEOUT' : failure ? 'COMMAND_FAILED' : value ? 'SCENARIO_NOT_CONFIRMED' : 'REPORT_MISSING_OR_INVALID';
 result.finishedAt = new Date().toISOString(); result.elapsedMs = Math.round(performance.now() - began);
 return result;
}
async function tree(directory) { const out = []; for (const e of await readdir(directory, { withFileTypes: true })) { const p = directory + '/' + e.name; if (e.isSymbolicLink()) deny('FROZEN_INPUT_CHANGED'); if (e.isDirectory()) out.push(...await tree(p)); else if (e.isFile()) out.push(p); } return out.sort(); }
export async function main({ controlOnly = false } = {}) {
 const selectedSteps = controlOnly ? ['control'] : steps, phase = controlOnly ? 'r23-control' : 'r22-services';
 const root = process.cwd(), run = (controlOnly ? 'r23-' : 'r22-') + new Date().toISOString().replace(/[^0-9]/g, ''), exec = promisify(execFile);
 const env = { ...process.env }; for (const k of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'BUILDX_BUILDER', 'BUILDKIT_HOST', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'NODE_OPTIONS']) delete env[k];
 const invoke = (exe, args, timeout = 15000) => exec(exe, args, { cwd: root, env, windowsHide: true, shell: false, timeout, maxBuffer: 2 * 1024 ** 2 });
 const docker = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
 const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
 const json = async args => JSON.parse((await d(args)).stdout);
 const prefix = 'wepuu-' + run, names = { network: prefix + '-net', data: prefix + '-data', evidence: prefix + '-evidence', pg: prefix + '-pg', seed: prefix + '-seed' };
 const result = { run, passed: false, startedAt: new Date().toISOString(), stage: 'source', productionAccessed: false, realEmailSent: false, desktopOAuthPerformed: false,
  mcpCalled: false, imageRebuilt: false, automaticRetryPerformed: false, databaseRegressionExecuted: false, consoleRegressionExecuted: false, scenarios: [], cleanup: [], resources: [], rawOutputSuppressed: true };
 let directory, files; const created = [];
 const disk = async initial => { const s = await statfs(root), v = verifyDiskBudget(s.bavail * s.bsize, initial); (result.diskSamples ??= []).push({ stage: result.stage, sampledAt: new Date().toISOString(), ...v }); };
 const hashes = async () => { const out = {}; for (const f of files) { const s = await lstat(f); if (!s.isFile() || s.isSymbolicLink()) deny('FROZEN_INPUT_CHANGED'); out[f] = sha(await readFile(f)); } return out; };
 const labels = ['--label', 'wepuu.phase='+phase, '--label', 'wepuu.run=' + run];
 const base = ['--pull=never', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'];
 const create = async (name, args) => { await d(['create', '--name', name, ...labels, ...args]); created.push(name); };
 const stop = async name => {
  let c = (await json(['inspect', name]))[0]; ownedState(c, run, name, phase);
  if (c.State.Running) { await d(['stop', '--time', '10', name], 20000); c = (await json(['inspect', name]))[0]; }
  const row = ownedState(c, run, name, phase), old = result.cleanup.findIndex(v => v.name === name); if (old < 0) result.cleanup.push(row); else result.cleanup[old] = row;
  if (!row.stopped || row.oomKilled || row.exitCode !== 0) deny('OWNED_PROCESS_FAILED');
 };
 try {
  if ((await invoke('git', ['status', '--porcelain'])).stdout !== '') deny('SOURCE_NOT_CLEAN');
  result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
  await invoke('git', ['merge-base', '--is-ancestor', 'e165096', 'HEAD']);
  const changed = (await invoke('git', ['diff', '--name-only', REV, '--', 'apps', 'packages', 'deploy', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json', 'tsconfig.json'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (changed.some(f => !fixtures.includes(f))) deny('APP_SOURCE_CHANGED');
  // All R8 protocol assertions remain byte-for-byte at the R21 baseline.
  const r8Changed=(await invoke('git', ['diff', '--name-only', 'e165096', '--', 'test/persistent-authorization/r8'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (r8Changed.some(f => !controlOnly || f !== 'test/persistent-authorization/r8/control-service.mjs')) deny('PROTOCOL_ASSERTION_CHANGED');
  files = [...await tree('test/persistent-authorization'), ...fixtures, ...await tree('packages/database/migrations'),
   'scripts/run-r22-services.mjs', 'scripts/r22-services.synthetic.mjs', ...(controlOnly ? ['scripts/run-r23-control.mjs','scripts/r23-control.synthetic.mjs'] : []), 'scripts/local-evidence-acl.mjs', 'scripts/run-r13-unit.mjs', 'scripts/run-r21-database.mjs', 'scripts/persistent-image-contract.mjs'];
  result.inputHashes = await hashes(); await disk(true);
  result.stage = 'images'; verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
  result.images = []; for (const role of Object.keys(images)) result.images.push(verifyIntegrationImage(await json(['image', 'inspect', images[role]]), images[role], role, REV));
  const pg = (await json(['image', 'inspect', PG]))[0]; if (pg.Id !== PG.slice(9) || pg.Os !== 'linux' || pg.Architecture !== 'amd64' || !pg.Config.Env.includes('PG_MAJOR=16')) deny('POSTGRES_IDENTITY_MISMATCH');
  result.postgresImage = { id: pg.Id, major: 16, platform: 'linux/amd64' };
  result.stage = 'private_evidence'; directory = await mkdtemp(path.join(tmpdir(), controlOnly ? 'wepuu-r23-control-' : 'wepuu-r22-services-'));
  const who = (await invoke('whoami', [])).stdout.trim(); await invoke('icacls.exe', [directory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
  if (!(await checkWindowsEvidenceAcl(directory, [])).verified) deny('EVIDENCE_NOT_PRIVATE'); result.evidenceAclVerified = true;
  const probes = [];
  result.stage = 'compiled_identity';
  for (const role of Object.keys(images)) {
   const name = prefix + '-probe-' + role; await create(name, [...base, '--network', 'none', '--user', '1000:1000', images[role], 'node', '-e', compiledIdentityCode]);
   probes.push(JSON.parse((await d(['start', '-a', name], 30000)).stdout)); await stop(name);
  }
  result.compiled = verifyCompiledIdentity(probes);
  if (result.compiled.sha256 !== 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373' || result.compiled.fileCount !== 163) deny('COMPILED_INPUT_MISMATCH');
  if(controlOnly){
   result.stage='compiled_contract_probe';const name=prefix+'-contract-probe';
   await create(name,[...base,'--network','none','--user','1000:1000','--tmpfs','/private:rw,noexec,nosuid,size=8m,uid=1000,gid=1000,mode=0700','--mount',`type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`,images.control,'node','/harness/r23/contract-probe.mjs']);
   const p=JSON.parse((await d(['start','-a',name],30000)).stdout);await stop(name);
   result.contractProbe={passed:p.passed===true,actualProductionMockRejected:p.actualProductionMockRejected===true,actualMissingQuotaRejected:p.actualMissingQuotaRejected===true,actualInvalidQuotaRejected:p.actualInvalidQuotaRejected===true,constructorFetchCalls:p.constructorFetchCalls===0?0:null,protectedFilesVerified:p.protectedFilesVerified===true};
   if(!Object.entries(result.contractProbe).every(([k,v])=>k==='constructorFetchCalls'?v===0:v===true))deny('CONTRACT_PROBE_FAILED');
  }
  result.stage = 'isolation_setup'; await disk(false);
  const cfg = { host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres', password: randomBytes(32).toString('hex') };
  const seed = path.join(directory, 'postgres.private.json'), pgEnv = path.join(directory, 'postgres.private.env');
  await writeFile(seed, JSON.stringify(cfg), { flag: 'wx', mode: 0o600 }); await writeFile(pgEnv, 'POSTGRES_USER=postgres\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=' + cfg.password + '\n', { flag: 'wx', mode: 0o600 });
  if (!(await checkWindowsEvidenceAcl(directory, ['postgres.private.json', 'postgres.private.env'])).verified) deny('EVIDENCE_NOT_PRIVATE');
  await d(['network', 'create', '--internal', ...labels, names.network]); result.resources.push({ type: 'network', name: names.network });
  for (const name of [names.data, names.evidence]) { await d(['volume', 'create', ...labels, name]); result.resources.push({ type: 'volume', name }); }
  const mount = ['--mount', `type=volume,source=${names.evidence},target=/evidence`, '--mount', `type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`];
  const seedCode = "const fs=require('node:fs');fs.chmodSync('/evidence',0o700);fs.writeFileSync('/evidence/postgres.private.json',fs.readFileSync('/seed.json'),{flag:'wx',mode:0o600});for(const p of ['/evidence/postgres.private.json','/evidence'])fs.chownSync(p,1000,1000);";
  await create(names.seed, [...base, '--network', 'none', '--user', '0:0', '--cap-add', 'CHOWN', '--mount', `type=volume,source=${names.evidence},target=/evidence`, '--mount', `type=bind,source=${seed},target=/seed.json,readonly`, images.test, 'node', '-e', seedCode]);
  await d(['start', '-a', names.seed]); await stop(names.seed);
  await create(names.pg, ['--pull=never', '--network', names.network, '--env-file', pgEnv, '--mount', `type=volume,source=${names.data},target=/var/lib/postgresql/data`, '--log-driver', 'none', '--security-opt', 'no-new-privileges', PG]);
  await d(['start', names.pg]); let ready = false;
  for (let i = 0; i < 30; i++) { try { await d(['exec', names.pg, 'pg_isready', '-U', 'postgres'], 3000); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  if (!ready) deny('POSTGRES_NOT_READY');
  const network = (await json(['network', 'inspect', names.network]))[0], pgMeta = (await json(['inspect', names.pg]))[0];
  if (network.Internal !== true || network.Labels?.['wepuu.run'] !== run || Object.keys(pgMeta.HostConfig.PortBindings ?? {}).length || pgMeta.HostConfig.NetworkMode !== names.network) deny('NETWORK_BOUNDARY_MISMATCH');
  result.internalNetwork = true; result.hostPortsPublished = false;
  const ledger = await expectedLedger('candidate');
  for (const step of selectedSteps) {
   if (controlOnly ? result.scenarios.length!==0 || step!=='control' : !nextAllowed(step, result.scenarios)) deny('SCENARIO_ORDER_DENIED'); result.stage = step; await disk(false);
   if (JSON.stringify(await hashes()) !== JSON.stringify(result.inputHashes)) deny('FROZEN_INPUT_CHANGED');
   const name = prefix + '-' + step;
   await create(name, [...base, '--user', '1000:1000', '--network', 'container:' + names.pg, '--tmpfs', '/private:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700', ...mount,
    step === 'control' ? images.control : images.authorization, 'node', '/harness/driver.mjs', step]);
   const item = await scenarioOnce(step, async () => (await d(['start', '-a', name], budgets[step])).stdout, ledger, {controlEvidence:controlOnly}); result.scenarios.push(item);
   await writeFile(path.join(directory, step + '-result.json'), JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
   try { await stop(name); } catch { item.passed = false; }
   if (!item.passed) deny('SCENARIO_FAILED');
  }
  result.stage = 'postcheck'; await disk(false); result.passed = true;
 } catch (e) {
  const codes = new Set(['SOURCE_NOT_CLEAN', 'APP_SOURCE_CHANGED', 'PROTOCOL_ASSERTION_CHANGED', 'FROZEN_INPUT_CHANGED', 'EVIDENCE_NOT_PRIVATE', 'POSTGRES_IDENTITY_MISMATCH', 'POSTGRES_NOT_READY', 'NETWORK_BOUNDARY_MISMATCH', 'COMPILED_INPUT_MISMATCH', 'OWNERSHIP_NOT_CONFIRMED', 'OWNED_PROCESS_FAILED', 'SCENARIO_FAILED', 'SCENARIO_ORDER_DENIED', 'DISK_BUDGET_NOT_MET', 'LOCAL_CONTEXT_REQUIRED', 'IMAGE_ID_OR_PLATFORM_MISMATCH', 'IMAGE_REVISION_MISMATCH', 'IMAGE_ENTRYPOINT_MISMATCH', 'IMAGE_CMD_MISMATCH', 'IMAGE_USER_MISMATCH']);
  result.passed = false; result.failure = codes.has(e?.code) ? e.code : e?.killed ? 'TRANSPORT_TIMEOUT' : 'LOCAL_GATE_NOT_CONFIRMED';
 } finally {
  for (const name of created.toReversed()) { try { await stop(name); } catch { result.passed = false; } }
  try {
   if (result.resources.some(v => v.name === names.evidence)) {
    const exporter = prefix + '-export'; await create(exporter, [...base, '--user', '1000:1000', '--network', 'none', '--mount', `type=volume,source=${names.evidence},target=/evidence,readonly`, '--mount', `type=bind,source=${path.resolve('test/persistent-authorization')},target=/harness,readonly`, images.authorization, 'node', '/harness/r22/export.mjs']);
    const exported = JSON.parse((await d(['start', '-a', exporter], 30000)).stdout); await stop(exporter);
    for (const [name, value] of Object.entries(exported)) {
     if (!/^(?:(startup|control|matrix|transition)-[a-f0-9]{12}\/(driver-result|integration|transition|startup-service)\.json|r22-boundary-[a-f0-9]{12}\.json)$/u.test(name)) deny('UNSAFE_EVIDENCE_PATH');
     const target = path.join(directory, 'safe', name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    result.safeEvidenceCount = Object.keys(exported).length;
    result.safeEvidenceExported = result.scenarios.every(item => Object.keys(exported).some(k => k.startsWith(item.step + '-') && k.endsWith('/driver-result.json')));
    if (!result.safeEvidenceExported) result.passed = false;
   }
  } catch { result.passed = false; result.safeEvidenceExported = false; }
  if (files && result.inputHashes) { try { result.inputsUnchanged = JSON.stringify(await hashes()) === JSON.stringify(result.inputHashes) && (await invoke('git', ['status', '--porcelain'])).stdout === ''; await disk(false); if (!result.inputsUnchanged) result.passed = false; } catch { result.passed = false; result.inputsUnchanged = false; } }
  result.finishedAt = new Date().toISOString();
  const final = await saveResult(result, async value => {
   if (!directory || !(await checkWindowsEvidenceAcl(directory, [])).verified) deny('EVIDENCE_NOT_PRIVATE');
   await writeFile(path.join(directory, 'result.json'), JSON.stringify({ ...value, evidenceSaved: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  });
  console.log(JSON.stringify({ ...final, evidenceDirectory: directory }, null, 2)); if (!final.passed) process.exitCode = 1; return final;
 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
