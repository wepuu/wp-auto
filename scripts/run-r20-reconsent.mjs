import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, mkdtemp, writeFile, statfs } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
import { saveResult } from './run-r13-unit.mjs';
import { projectTarget } from '../test/persistent-authorization/r19/target-schema.mjs';
import { fixtureScopes } from '../packages/database/test/r17-migration-evidence.mjs';
import { compiledIdentityCode, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget } from './persistent-image-contract.mjs';
const TEST = 'sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c';
const PG = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const REVISION = 'c404ed52228ce5492a85674547998d2f5d31772e';
const DIR = 'test/persistent-authorization/r10';
const helpers = ['fixed-node-test.mjs', 'reported-process.mjs', 'report-schema.mjs', 'reporter.mjs', 'profiles.mjs', 'evidence.mjs'];
const fixtures = ['p3d-fixture.ts', 'multi-site-provider.test.ts', 'persistent-readonly.test.ts', 'pairing-diagnostics.test.ts', 'otp-send-budget.test.ts', 'otp-migration-evidence.mjs', 'r17-migration-evidence.mjs'].map(f => 'packages/database/test/' + f);
const worker = 'test/persistent-authorization/r19/reconsent-target.mjs';
const schema = 'test/persistent-authorization/r19/target-schema.mjs';
const targetSources = ['grant-reconsent.test.ts', 'reconsent-diagnostic.mjs', 'r19-target-ledger.mjs', 'r17-migration-evidence.mjs', 'reconsent-native-fixture.mjs'].map(f => 'packages/database/test/' + f);
const mountSources = [...targetSources, ...helpers.map(f => DIR + '/' + f), worker, schema];
const sha = b => createHash('sha256').update(b).digest('hex');
const deny = code => { throw Object.assign(Error('R20_GATE_DENIED'), { code }); };
export async function main() {
  const exec = promisify(execFile), root = process.cwd();
  const docker = 'C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
  const invoke = (exe, args, timeout = 15000) => exec(exe, args, { cwd: root, timeout, maxBuffer: 2 * 1024 ** 2, windowsHide: true, shell: false });
  const d = (args, timeout) => invoke(docker, ['--context', 'desktop-linux', ...args], timeout);
  const json = async args => JSON.parse((await d(args)).stdout);
  const disk = async initial => { const s = await statfs(root); return verifyDiskBudget(s.bavail * s.bsize, initial); };
  const run = 'r20-' + new Date().toISOString().replace(/[^0-9]/g, '');
  const result = { run, startedAt: new Date().toISOString(), passed: false, targetAttempts: 0, fullDatabaseRegressionExecuted: false, legacyConsoleExecuted: false,
    productionAccessed: false, serviceStartupExecuted: false, abExecuted: false, rawOutputSuppressed: true, groups: [], retainedResources: [], cleanup: [] };
  const created = [];
  let directory, files;
  const hashes = async () => {
    const out = {}; for (const f of files) { const s = await lstat(f); if (!s.isFile() || s.isSymbolicLink()) deny('FROZEN_INPUT_CHANGED'); out[f] = sha(await readFile(f)); } return out;
  };
  const base = ['--pull=never', '--read-only', '--no-healthcheck', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--log-driver', 'none', '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m'];
  const create = async (name, phase, args) => { await d(['create', '--name', name, '--label', 'wepuu.phase=r20-reconsent', '--label', 'wepuu.run=' + run, '--label', 'wepuu.group=' + phase, ...args]); created.push(name); };
  const stop = async name => {
    let c = (await json(['inspect', name]))[0]; if (c.Config.Labels?.['wepuu.run'] !== run) deny('OWNERSHIP_NOT_CONFIRMED');
    if (c.State.Running) { await d(['stop', '--time', '10', name], 20000); c = (await json(['inspect', name]))[0]; }
    const row = { name, stopped: c.State.Running === false, exitCode: c.State.ExitCode, oomKilled: c.State.OOMKilled === true };
    if (!result.cleanup.some(v => v.name === name)) result.cleanup.push(row);
    if (!row.stopped || row.oomKilled || (row.exitCode !== 0 && !(name.endsWith('-tests') && row.exitCode === 1))) deny('OWNED_PROCESS_FAILED');
  };
  try {
    result.stage = 'source';
    if ((await invoke('git', ['status', '--porcelain'])).stdout !== '') deny('SOURCE_NOT_CLEAN');
    result.sourceHead = (await invoke('git', ['rev-parse', 'HEAD'])).stdout.trim();
    await invoke('git', ['merge-base', '--is-ancestor', '435e49e', 'HEAD']);
    const changed = (await invoke('git', ['diff', '--name-only', REVISION, '--', 'apps', 'packages', 'deploy', 'package.json', 'pnpm-lock.yaml', '.npmrc', 'pnpm-workspace.yaml'])).stdout.trim().split(/\r?\n/u).filter(Boolean);
    if (changed.some(f => ![...fixtures, ...targetSources].includes(f))) deny('APP_SOURCE_CHANGED');
    const sql = (await readdir('packages/database/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => 'packages/database/migrations/' + f);
    files = [...new Set([...Object.keys(fixtureScopes).map(f => 'packages/database/test/' + f), ...fixtures, ...targetSources, ...sql, ...helpers.map(f => DIR + '/' + f), worker, schema,
      'scripts/run-r20-reconsent.mjs', 'scripts/r20-reconsent.synthetic.mjs', 'scripts/local-evidence-acl.mjs', 'scripts/run-r13-unit.mjs', 'scripts/persistent-image-contract.mjs'])];
    result.inputHashes = await hashes(); result.diskBefore = await disk(true);
    result.stage = 'images'; verifyIntegrationContext(await json(['context', 'inspect', 'desktop-linux']), 'desktop-linux');
    result.testImage = verifyIntegrationImage(await json(['image', 'inspect', TEST]), TEST, 'test', REVISION);
    const pgImage = (await json(['image', 'inspect', PG]))[0];
    if (pgImage.Id !== PG.slice('postgres@'.length) || pgImage.Os !== 'linux' || pgImage.Architecture !== 'amd64'
      || !pgImage.Config.Env.includes('PG_MAJOR=16') || !pgImage.Config.Env.includes('PGDATA=/var/lib/postgresql/data')) deny('POSTGRES_IDENTITY_MISMATCH');
    result.postgresImage = { id: pgImage.Id, major: 16, platform: 'linux/amd64' };
    result.stage = 'evidence'; directory = await mkdtemp(path.join(tmpdir(), 'wepuu-r20-reconsent-'));
    const who = (await invoke('whoami', [])).stdout.trim();
    await invoke('icacls.exe', [directory, '/inheritance:r', '/grant:r', who + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
    if (!(await checkWindowsEvidenceAcl(directory, [])).verified) deny('EVIDENCE_NOT_PRIVATE'); result.evidenceAclVerified = true;
    result.stage = 'probe';
    const probe = 'wepuu-' + run + '-probe';
    const code = compiledIdentityCode + `\nimport('/harness/fixed-node-test.mjs').then(async m=>{await import('/workspace/packages/database/test/reconsent-diagnostic.mjs');await import('/workspace/packages/database/test/r19-target-ledger.mjs');await import('/workspace/packages/database/test/reconsent-native-fixture.mjs');await import('/workspace/test/persistent-authorization/r19/target-schema.mjs');console.log(JSON.stringify({runtime:(await m.fixedNodeTestCommand()).identity,diagnosticModulesLoaded:true}));}).catch(()=>{process.exitCode=1;});`;
    await create(probe, 'probe', [...base, '--network', 'none', '--user', '1000:1000', ...mountSources.flatMap(f => ['--mount', `type=bind,source=${path.resolve(f)},target=/workspace/${f},readonly`]), '--mount', `type=bind,source=${path.resolve(DIR + '/fixed-node-test.mjs')},target=/harness/fixed-node-test.mjs,readonly`, TEST, 'node', '-e', code]);
    const lines = (await d(['start', '-a', probe], 30000)).stdout.trim().split(/\r?\n/u); if (lines.length !== 2) deny('PROBE_NOT_CONFIRMED');
    result.compiled = JSON.parse(lines[0]); result.runtime = JSON.parse(lines[1]).runtime; result.diagnosticModulesLoaded = JSON.parse(lines[1]).diagnosticModulesLoaded === true;
    if (!result.diagnosticModulesLoaded || result.compiled.hash !== 'e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373' || result.compiled.files !== 163
      || result.compiled.version !== 'v24.22.1' || result.compiled.uid !== 1000 || result.runtime.tsxVersion !== '4.23.13'
      || result.runtime.entrySha256 !== '7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d') deny('PROBE_NOT_CONFIRMED');
    await stop(probe);
    for (const phase of ['target']) {
      result.stage = phase + '_preparation';
      if (JSON.stringify(await hashes()) !== JSON.stringify(result.inputHashes)) deny('FROZEN_INPUT_CHANGED'); await disk(false);
      const phaseRun = 'r19-' + run.slice(4) + '-' + phase, prefix = 'wepuu-' + run + '-' + phase;
      const names = { network: prefix + '-net', data: prefix + '-data', evidence: prefix + '-evidence', seed: prefix + '-seed', pg: prefix + '-pg', test: prefix + '-tests' };
      const labels = ['--label', 'wepuu.phase=r20-reconsent', '--label', 'wepuu.run=' + run, '--label', 'wepuu.group=' + phase];
      const cfg = { host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres', password: randomBytes(32).toString('hex'), run: phaseRun, diagnosticRun: 'r18-' + run.slice(4) };
      const seedPath = path.join(directory, phase + '.private.json'), envPath = path.join(directory, phase + '.private.env');
      await writeFile(seedPath, JSON.stringify(cfg), { flag: 'wx', mode: 0o600 });
      await writeFile(envPath, 'POSTGRES_USER=postgres\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=' + cfg.password + '\n', { flag: 'wx', mode: 0o600 });
      if (!(await checkWindowsEvidenceAcl(directory, [phase + '.private.json', phase + '.private.env'])).verified) deny('EVIDENCE_NOT_PRIVATE');
      await d(['network', 'create', '--internal', ...labels, names.network]); result.retainedResources.push({ type: 'network', name: names.network });
      for (const name of [names.data, names.evidence]) { await d(['volume', 'create', ...labels, name]); result.retainedResources.push({ type: 'volume', name }); }
      const seedCode = `const fs=require('node:fs');fs.chmodSync('/evidence',0o700);fs.mkdirSync('/evidence/ledger',{mode:0o700});fs.mkdirSync('/evidence/r18',{mode:0o700});fs.writeFileSync('/evidence/postgres.private.json',fs.readFileSync('/seed.json'),{flag:'wx',mode:0o600});for(const p of ['/evidence/ledger','/evidence/r18','/evidence/postgres.private.json','/evidence'])fs.chownSync(p,1000,1000);`;
      await create(names.seed, phase, [...base, '--network', 'none', '--user', '0:0', '--cap-add', 'CHOWN', '--mount', `type=volume,source=${names.evidence},target=/evidence`, '--mount', `type=bind,source=${seedPath},target=/seed.json,readonly`, TEST, 'node', '-e', seedCode]);
      await d(['start', '-a', names.seed]);
      await create(names.pg, phase, ['--pull=never', '--network', names.network, '--env-file', envPath, '--mount', `type=volume,source=${names.data},target=/var/lib/postgresql/data`, '--log-driver', 'none', '--security-opt', 'no-new-privileges', PG]);
      await d(['start', names.pg]); let ready = false;
      for (let i = 0; i < 30; i++) { try { await d(['exec', names.pg, 'pg_isready', '-U', 'postgres'], 3000); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
      if (!ready) deny('POSTGRES_NOT_READY');
      const network = (await json(['network', 'inspect', names.network]))[0], pg = (await json(['inspect', names.pg]))[0];
      if (network.Internal !== true || network.Labels?.['wepuu.run'] !== run || pg.Config.Labels?.['wepuu.group'] !== phase
        || Object.keys(pg.HostConfig.PortBindings ?? {}).length || pg.HostConfig.NetworkMode !== names.network) deny('NETWORK_BOUNDARY_MISMATCH');
      const mounts = [...new Set(mountSources)].flatMap(f => ['--mount', `type=bind,source=${path.resolve(f)},target=/workspace/${f},readonly`]);
      await create(names.test, phase, [...base, '--user', '1000:1000', '--env', 'WEPUU_R19_EXPECTED_RUN=' + phaseRun, '--network', 'container:' + names.pg, '--mount', `type=volume,source=${names.evidence},target=/evidence`, ...mounts,
        TEST, 'node', '/workspace/' + worker]);
      result.stage = phase + '_regression'; result.targetAttempts = 1;
      let output = '', transportFailed = false;
      result.transport = { group: phase, completed: false, timedOut: false, exitCode: null };
      try { output = (await d(['start', '-a', names.test], 330000)).stdout; result.transport.completed = true; result.transport.exitCode = 0; }
      catch (e) { transportFailed = true; output = typeof e.stdout === 'string' ? e.stdout : ''; result.transport.completed = Number.isSafeInteger(e.code); result.transport.timedOut = e.killed === true; result.transport.exitCode = Number.isSafeInteger(e.code) ? e.code : null; }
      const group = await projectTarget(JSON.parse(output.trim()), phaseRun);
      if (transportFailed) group.passed = false; result.groups.push(group);
      // Always stop this run's target resources; no second group exists.
      for (const name of [names.test, names.pg, names.seed]) { try { await stop(name); } catch { group.passed = false; } }
      if (!group.passed) deny(group.reproductionComplete ? 'TARGET_TEST_FAILED' : 'TARGET_DIAGNOSTIC_NOT_CONFIRMED');
    }
    result.stage = 'postcheck'; result.inputsUnchanged = JSON.stringify(await hashes()) === JSON.stringify(result.inputHashes)
      && (await invoke('git', ['status', '--porcelain'])).stdout === '';
    result.diskAfter = await disk(false); result.passed = result.inputsUnchanged;
  } catch (e) {
    result.passed = false;
    const codes = ['SOURCE_NOT_CLEAN', 'APP_SOURCE_CHANGED', 'FROZEN_INPUT_CHANGED', 'EVIDENCE_NOT_PRIVATE', 'POSTGRES_IDENTITY_MISMATCH', 'POSTGRES_NOT_READY', 'NETWORK_BOUNDARY_MISMATCH', 'PROBE_NOT_CONFIRMED', 'TARGET_RESULT_NOT_CONFIRMED', 'OWNERSHIP_NOT_CONFIRMED', 'OWNED_PROCESS_FAILED', 'TARGET_TEST_FAILED', 'TARGET_DIAGNOSTIC_NOT_CONFIRMED', 'DISK_BUDGET_NOT_MET', 'LOCAL_CONTEXT_REQUIRED'];
    result.failure = codes.includes(e?.code) ? e.code : e?.killed ? 'TRANSPORT_TIMEOUT' : 'LOCAL_GATE_NOT_CONFIRMED';
  } finally {
    for (const name of created.toReversed()) { try { await stop(name); } catch { result.passed = false; } }
    if (files && result.inputHashes) { try { result.inputsUnchanged = JSON.stringify(await hashes()) === JSON.stringify(result.inputHashes) && (await invoke('git', ['status', '--porcelain'])).stdout === ''; result.diskAfter = await disk(false); if (!result.inputsUnchanged) result.passed = false; } catch { result.passed = false; result.inputsUnchanged = false; } }
    result.diagnosticReproductionComplete = result.groups.length === 1 && result.groups[0].reproductionComplete && result.inputsUnchanged === true && created.every(name => result.cleanup.some(v => v.name === name && v.stopped && !v.oomKilled));
    result.finishedAt = new Date().toISOString();
    const final = await saveResult(result, async value => {
      if (!directory || !(await checkWindowsEvidenceAcl(directory, [])).verified) deny('EVIDENCE_NOT_PRIVATE');
      await writeFile(path.join(directory, 'result.json'), JSON.stringify({ ...value, evidenceSaved: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    });
    const published = structuredClone(final);
    for (const group of published.groups) group.observations = group.observations.map(v => ({ run: v.run, stage: v.stage,
      databaseSha256: v.databaseSha256, migrationCount: v.migrations.length, ledgerSha256: sha(JSON.stringify(v.migrations)), consoleObjects: v.consoleObjects, passed: v.passed }));
    console.log(JSON.stringify({ ...published, evidenceDirectory: directory }, null, 2)); if (!final.passed) process.exitCode = 1;
    return final;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();


