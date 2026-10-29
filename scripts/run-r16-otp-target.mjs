import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, mkdtemp, writeFile, statfs } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
import { saveResult } from './run-r13-unit.mjs';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
import { compiledIdentityCode, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
import { expectedOtpLedger, verifyObservationSet } from '../packages/database/test/otp-migration-evidence.mjs';
const TEST = 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c';
const PG = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const REVISION = 'c404ed52228ce5492a85674547998d2f5d31772e', DIR = 'test/persistent-authorization/r10';
const helpers = ['fixed-node-test.mjs', 'reported-process.mjs', 'report-schema.mjs', 'reporter.mjs', 'profiles.mjs', 'evidence.mjs'];
const targetFile = 'packages/database/test/otp-send-budget.test.ts', ledgerFile = 'packages/database/test/otp-migration-evidence.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const denied = code => { throw Object.assign(Error('r16_gate_denied'), { code }); };
const codes = new Set(['SOURCE_NOT_CLEAN', 'SOURCE_INPUT_CHANGED', 'FROZEN_INPUT_CHANGED', 'EVIDENCE_NOT_PRIVATE', 'POSTGRES_IDENTITY_MISMATCH', 'POSTGRES_NOT_READY', 'NETWORK_BOUNDARY_MISMATCH', 'PROBE_NOT_CONFIRMED', 'TARGET_REPORT_NOT_CONFIRMED', 'OWNED_RESOURCE_NOT_STOPPED', 'DISK_BUDGET_NOT_MET', 'LOCAL_CONTEXT_REQUIRED']);
const category = e => codes.has(e?.code) ? e.code : e?.killed ? 'TRANSPORT_TIMEOUT' : 'LOCAL_GATE_NOT_CONFIRMED';
async function hashes(files) {
  const out = {}; for (const f of files) { const s = await lstat(f); if (!s.isFile() || s.isSymbolicLink()) denied('FROZEN_INPUT_CHANGED'); out[f] = sha(await readFile(f)); } return out;
}
const exec = promisify(execFile), root = process.cwd();
const docker = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
const invoke = (exe, args, timeout = 15000) => exec(exe, args, { cwd: root, timeout, maxBuffer: 1024 ** 2, windowsHide: true, shell: false });
const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
const json = async args => JSON.parse((await d(args)).stdout);
const disk = async initial => { const s = await statfs(root); return verifyDiskBudget(s.bavail * s.bsize, initial); };
const run = 'r16-' + new Date().toISOString().replace(/[^0-9]/g, ''), prefix = 'wepuu-' + run;
const names = { network: prefix + '-net', data: prefix + '-data', evidence: prefix + '-evidence', pg: prefix + '-pg', seed: prefix + '-seed', probe: prefix + '-probe', test: prefix + '-otp' };
const labels = ['--label', 'wepuu.phase=r16-otp', '--label', 'wepuu.run=' + run];
const created = [], resources = [];
const result = { run, startedAt: new Date().toISOString(), passed: false, testAttempts: 0,
  fullDatabaseRegressionExecuted: false, legacyConsoleExecuted: false, abExecuted: false, productionAccessed: false, rawOutputSuppressed: true };
let directory;
const base = ['--pull=never', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m'];
async function create(name, args) { await d(['create', '--name', name, ...labels, ...args]); created.push(name); }
try {
  result.stage = 'source';
  if ((await invoke('git', ['status', '--porcelain'])).stdout !== '') denied('SOURCE_NOT_CLEAN');
  result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
  await invoke('git', ['merge-base', '--is-ancestor', '207fd0b', 'HEAD']);
  const appChanges = (await invoke('git', ['diff', '--name-only', REVISION, '--', 'apps', 'packages', 'deploy', 'package.json', 'pnpm-lock.yaml', '.npmrc', 'pnpm-workspace.yaml'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (appChanges.some(f => ![targetFile, ledgerFile].includes(f))) denied('SOURCE_INPUT_CHANGED');
  const sqlFiles = (await readdir('packages/database/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => 'packages/database/migrations/' + f);
  const files = [targetFile, ledgerFile, 'packages/database/test/p3d-fixture.ts', ...sqlFiles, ...helpers.map(f => DIR + '/' + f),
    'test/persistent-authorization/r16/otp-target.mjs', 'scripts/run-r16-otp-target.mjs', 'scripts/r16-otp-ledger.synthetic.mjs',
    'scripts/local-evidence-acl.mjs', 'scripts/run-r13-unit.mjs', 'scripts/persistent-image-contract.mjs'];
  result.inputHashes = await hashes(files); result.diskBefore = await disk(true);
  result.stage = 'images'; verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
  result.testImage = verifyIntegrationImage(await json(['image', 'inspect', TEST]), TEST, 'test', REVISION);
  const pgImage = (await json(['image', 'inspect', PG]))[0];
  if (pgImage.Id !== PG.slice('postgres@'.length) || pgImage.Os !== 'linux' || pgImage.Architecture !== 'amd64'
    || !pgImage.Config.Env.includes('PG_MAJOR=16') || !pgImage.Config.Env.includes('PGDATA=/var/lib/postgresql/data')) denied('POSTGRES_IDENTITY_MISMATCH');
  result.postgresImage = { id: pgImage.Id, major: 16, platform: 'linux/amd64' };
  result.stage = 'evidence'; directory = await mkdtemp(path.join(tmpdir(), 'wepuu-r16-otp-'));
  const who = (await invoke('whoami', [])).stdout.trim();
  await invoke('icacls.exe', [directory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
  if (!(await checkWindowsEvidenceAcl(directory, [])).verified) denied('EVIDENCE_NOT_PRIVATE'); result.evidenceAclVerified = true;
  const credential = { host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres', password: randomBytes(32).toString('hex'), run };
  const seedPath = path.join(directory, 'postgres.private.json'), envPath = path.join(directory, 'postgres.private.env');
  await writeFile(seedPath, JSON.stringify(credential), { flag: 'wx', mode: 0o600 });
  await writeFile(envPath, 'POSTGRES_USER=postgres\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=' + credential.password + '\n', { flag: 'wx', mode: 0o600 });
  if (!(await checkWindowsEvidenceAcl(directory, ['postgres.private.json', 'postgres.private.env'])).verified) denied('EVIDENCE_NOT_PRIVATE');
  result.stage = 'probe';
  const probeCode = compiledIdentityCode + `\nimport('/harness/r10/fixed-node-test.mjs').then(async m=>console.log(JSON.stringify({runtime:(await m.fixedNodeTestCommand()).identity}))).catch(()=>{process.exitCode=1;});`;
  await create(names.probe, [...base, '--network', 'none', '--user', '1000:1000', '--mount', `type=bind,source=${path.resolve(DIR + '/fixed-node-test.mjs')},target=/harness/r10/fixed-node-test.mjs,readonly`, TEST, 'node', '-e', probeCode]);
  const probeLines = (await d(['start', '-a', names.probe], 30000)).stdout.trim().split(/\r?\n/u);
  if (probeLines.length !== 2) denied('PROBE_NOT_CONFIRMED');
  result.compiled = JSON.parse(probeLines[0]); result.runtime = JSON.parse(probeLines[1]).runtime;
  if (result.compiled.hash !== 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373' || result.compiled.files !== 163
    || result.compiled.version !== 'v24.22.1' || result.compiled.uid !== 1000 || result.runtime.tsxVersion !== '4.23.13'
    || result.runtime.entrySha256 !== '7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d') denied('PROBE_NOT_CONFIRMED');
  result.stage = 'isolated_resources';
  await d(['network', 'create', '--internal', ...labels, names.network]); resources.push({ type: 'network', name: names.network });
  for (const name of [names.data, names.evidence]) { await d(['volume', 'create', ...labels, name]); resources.push({ type: 'volume', name }); }
  // Root is restricted to preparing this empty run-owned evidence volume; tests never run as root.
  const seedCode = `const fs=require('node:fs');fs.chmodSync('/evidence',0o700);fs.mkdirSync('/evidence/ledger',{mode:0o700});fs.writeFileSync('/evidence/postgres.private.json',fs.readFileSync('/seed.json'),{flag:'wx',mode:0o600});for(const p of ['/evidence/ledger','/evidence/postgres.private.json','/evidence'])fs.chownSync(p,1000,1000);`;
  await create(names.seed, [...base, '--network', 'none', '--user', '0:0', '--cap-add', 'CHOWN', '--mount', `type=volume,source=${names.evidence},target=/evidence`,
    '--mount', `type=bind,source=${seedPath},target=/seed.json,readonly`, TEST, 'node', '-e', seedCode]);
  await d(['start', '-a', names.seed]);
  await create(names.pg, ['--pull=never', '--network', names.network, '--env-file', envPath,
    '--mount', `type=volume,source=${names.data},target=/var/lib/postgresql/data`, '--log-driver', 'none', '--security-opt', 'no-new-privileges', PG]);
  await d(['start', names.pg]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { await d(['exec', names.pg, 'pg_isready', '-U', 'postgres'], 3000); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) denied('POSTGRES_NOT_READY');
  const network = (await json(['network', 'inspect', names.network]))[0], pg = (await json(['inspect', names.pg]))[0];
  if (network.Internal !== true || network.Labels?.['wepuu.run'] !== run || pg.Config.Labels?.['wepuu.run'] !== run
    || Object.keys(pg.HostConfig.PortBindings ?? {}).length !== 0 || pg.HostConfig.NetworkMode !== names.network) denied('NETWORK_BOUNDARY_MISMATCH');
  result.internalNetwork = true; result.hostPortsPublished = false;
  if (JSON.stringify(await hashes(files)) !== JSON.stringify(result.inputHashes)) denied('FROZEN_INPUT_CHANGED'); await disk(false);
  result.stage = 'otp_target';
  const mounts = helpers.flatMap(f => ['--mount', `type=bind,source=${path.resolve(DIR + '/' + f)},target=/harness/r10/${f},readonly`]);
  for (const [source, target] of [[targetFile, '/workspace/' + targetFile], [ledgerFile, '/workspace/' + ledgerFile],
    ['test/persistent-authorization/r16/otp-target.mjs', '/harness/r16/otp-target.mjs']])
    mounts.push('--mount', `type=bind,source=${path.resolve(source)},target=${target},readonly`);
  await create(names.test, [...base, '--user', '1000:1000', '--network', 'container:' + names.pg,
    '--mount', `type=volume,source=${names.evidence},target=/evidence`, ...mounts, TEST, 'node', '/harness/r16/otp-target.mjs']);
  result.testAttempts = 1; let output = '', failed = false;
  try { output = (await d(['start', '-a', names.test], 200000)).stdout; }
  catch (e) { failed = true; output = typeof e.stdout === 'string' ? e.stdout : ''; }
  const value = JSON.parse(output.trim());
  const target = { passed: value.passed === true && !failed, testAttempts: value.testAttempts === 1 ? 1 : 0,
    stage: ['credentials', 'connection', 'runtime', 'otp_test', 'actual_fixture_ledger'].includes(value.stage) ? value.stage : 'NOT_CONFIRMED' };
  if (['OTP_TARGET_NOT_CONFIRMED', 'OTP_TEST_FAILED', 'EVIDENCE_SAVE_FAILED'].includes(value.category)) target.category = value.category;
  if (value.test) { target.test = projectEvidence('database-tests.json', value.test);
    if (target.test.report && Number.isSafeInteger(value.test.report?.skipCount)) target.test.report.skipCount = value.test.report.skipCount; }
  result.target = target;
  try { target.observations = verifyObservationSet(value.observations ?? [], await expectedOtpLedger(), run); target.actualFixtureLedgerVerified = true; }
  catch { target.passed = false; target.actualFixtureLedgerVerified = false; }
  result.passed = target.passed && target.testAttempts === 1 && target.test?.passed === true
    && target.test.category === 'PASS' && target.test.reportStatus === 'VALID' && target.test.report?.skipCount === 0
    && target.test.report?.topLevelCountsMatch === true && target.actualFixtureLedgerVerified === true;
  result.stage = 'postcheck';
  result.inputsUnchanged = JSON.stringify(await hashes(files)) === JSON.stringify(result.inputHashes)
    && (await invoke('git', ['status', '--porcelain'])).stdout === '';
  result.diskAfter = await disk(false); if (!result.inputsUnchanged) result.passed = false;
} catch (e) { result.passed = false; result.failure = category(e); }
finally {
  result.cleanup = [];
  for (const name of created.toReversed()) {
    try {
      let c = (await json(['inspect', name]))[0];
      if (c.Config.Labels?.['wepuu.run'] !== run) denied('OWNED_RESOURCE_NOT_STOPPED');
      if (c.State.Running) { await d(['stop', '--time', '10', name], 20000); c = (await json(['inspect', name]))[0]; }
      const row = { name, stopped: c.State.Running === false, exitCode: c.State.ExitCode, oomKilled: c.State.OOMKilled === true };
      result.cleanup.push(row); if (!row.stopped || row.oomKilled || row.exitCode !== 0) result.passed = false;
    } catch { result.cleanup.push({ name, stopped: false }); result.passed = false; }
  }
  result.retainedResources = resources; result.finishedAt = new Date().toISOString();
  const final = await saveResult(result, async value => {
    if (!directory || !(await checkWindowsEvidenceAcl(directory, [])).verified) denied('EVIDENCE_NOT_PRIVATE');
    await writeFile(path.join(directory, 'result.json'), JSON.stringify({ ...value, evidenceSaved: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  });
  const published = structuredClone(final);
  if (published.target?.observations) published.target.observations = published.target.observations.map(v => ({ run: v.run,
    stage: v.stage, databaseSha256: v.databaseSha256, migrationCount: v.migrations.length,
    ledgerSha256: sha(JSON.stringify(v.migrations)), consoleTablesAbsent: v.consoleTablesAbsent, passed: v.passed }));
  console.log(JSON.stringify({ ...published, evidenceDirectory: directory }, null, 2)); if (!final.passed) process.exitCode = 1;
}
