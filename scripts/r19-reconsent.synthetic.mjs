import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
import { closeAfterLedger, recordTargetLedger, verifyTargetPair, readTargetLedgers } from '../packages/database/test/r19-target-ledger.mjs';
import { targetFile, validateCredential, projectTarget, projectDiagnostics } from '../test/persistent-authorization/r19/target-schema.mjs';
import { executeTarget } from '../test/persistent-authorization/r19/reconsent-target.mjs';
let checks = 0; const check = fn => { fn(); checks++; }, sentinel = 'SENSITIVE_SENTINEL_PASSWORD_TOKEN_SQL';
const cfg = { host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres', password: 'b'.repeat(64), run: 'r19-123-target', diagnosticRun: 'r18-123' };
const expected = await expectedLedger('candidate');
const obs = db => ['before', 'after'].map(stage => ({ run: cfg.run, stage, databaseSha256: db, migrations: expected, consoleObjects: false, passed: true }));
const diagnostics = { readStatus: 'VALID', run: cfg.diagnosticRun, diagnosticCoverage: 'COMPLETE', testVerdict: 'NOT_CONFIRMED', ledgerStatus: 'NOT_CONFIRMED',
  mainStatus: 'FAIL', cleanupStatus: 'PASS', primaryFailure: { stage: 'R0_ISSUE', error: { category: 'OAUTH_INVALID_GRANT' } }, cleanupFailure: null };
function rawTest(pass = false) {
  return { passed: pass, category: pass ? 'PASS' : 'TEST_FAILURE', reportStatus: 'VALID', rawOutputSuppressed: true,
    process: { completed: true, spawnFailed: false, timedOut: false, outputLimitExceeded: false, exitCode: pass ? 0 : 1, signal: null, outputBytes: 0 },
    report: { passed: pass, phase: 'database', total: 1, fileCount: 1, unmappedEventCount: 0, topLevelCountsMatch: true, unexpectedEvent: false, missing: [], skips: [],
      failures: pass ? [] : [{ file: targetFile, line: 1, category: 'ERR_TEST_FAILURE' }] } };
}
const makeIo = (fail = '') => {
  let calls = 0, saved, closeCount = 0, rawOptions;
  class Client {
    constructor() { if (fail === 'constructor') throw Error(sentinel); }
    async connect() { if (fail === 'connect') throw Error(sentinel); }
    async query() { if (fail === 'query') throw Object.assign(Error(sentinel), { code: 'ETIMEDOUT' }); return {}; }
    async end() { closeCount++; }
  }
  const io = { load: async () => { if (fail === 'load') throw Error(sentinel); return cfg; }, Client,
    runtime: async () => { if (fail === 'runtime') throw Error(sentinel); return { executable: 'never-executed', args: [] }; },
    test: async options => { calls++; rawOptions = options; return rawTest(fail === 'pass'); },
    diagnostics: async () => fail === 'missing-diagnostic' ? { readStatus: 'MISSING', diagnosticCoverage: 'NOT_CONFIRMED' }
      : fail === 'pass' ? { ...diagnostics, mainStatus: 'PASS', primaryFailure: null } : diagnostics,
    ledgers: async (_run, db) => ({ status: fail === 'missing-ledger' ? 'NOT_CONFIRMED' : 'COMPLETE', observations: fail === 'missing-ledger' ? [] : obs(db) }),
    save: async value => { if (fail === 'save') throw Error(sentinel); saved = structuredClone(value); } };
  return { io, state: () => ({ calls, saved, closeCount, rawOptions }) };
};
check(() => assert.equal(validateCredential(cfg), cfg));
for (const patch of [{ host: 'production.example' }, { diagnosticRun: 'r18-999' }, { run: 'r17-123-candidate' }, { password: sentinel }]) check(() => assert.throws(() => validateCredential({ ...cfg, ...patch })));
for (const failure of ['load', 'constructor', 'connect', 'query', 'runtime', 'missing-diagnostic', 'missing-ledger', 'save', '', 'pass']) {
  const mock = makeIo(failure), result = await executeTarget(mock.io), state = mock.state();
  const setupFailure = ['load', 'constructor', 'connect', 'query', 'runtime'].includes(failure);
  check(() => assert.equal(state.calls, setupFailure ? 0 : 1));
  check(() => assert.equal(result.testAttempts, setupFailure ? 0 : 1));
  check(() => assert.equal(result.passed, failure === 'pass'));
  check(() => assert(!JSON.stringify(result).includes(sentinel)));
  if (!setupFailure) {
    check(() => assert.deepEqual(state.rawOptions.config.files, [targetFile]));
    check(() => assert.equal(state.rawOptions.timeoutMs, 150000));
    check(() => assert.equal(state.rawOptions.config.expectedTopLevel['grant-reconsent.test.ts'], 1));
    check(() => assert.equal(state.rawOptions.env.WEPUU_R18_RUN_ID, cfg.diagnosticRun));
  }
  const safe = await projectTarget(result, cfg.run);
  check(() => assert.equal(safe.passed, failure === 'pass'));
  if (failure === '') {
    check(() => assert.equal(safe.reproductionComplete, true));
    check(() => assert.equal(safe.test.passed, false));
    check(() => assert.equal(safe.diagnostics.primaryFailure.stage, 'R0_ISSUE'));
  }
  if (['missing-diagnostic', 'missing-ledger'].includes(failure)) check(() => assert.equal(safe.reproductionComplete, false));
}
const timed = makeIo(); let clockCalls = 0; timed.io.clock = () => clockCalls++ === 0 ? 0 : 300000;
const timeout = await executeTarget(timed.io);
check(() => assert.equal(timeout.category, 'GROUP_TIMEOUT'));
check(() => assert.equal(timed.state().calls, 0));
const mock = makeIo(), result = await executeTarget(mock.io);
for (const mutation of [v => v.passed = true, v => v.run = 'r19-999-target', v => v.observations.pop(),
  v => v.diagnostics.primaryFailure.error.raw = sentinel, v => v.diagnostics.primaryFailure.stage = sentinel,
  v => v.observations[0].consoleObjects = true, v => v.observations[0].migrations = expected.slice(1)]) {
  const bad = structuredClone(result); mutation(bad); await assert.rejects(() => projectTarget(bad, cfg.run)); checks++;
}
for (const status of ['MISSING', 'ACCESS_DENIED', 'NOT_CONFIRMED']) check(() => assert.equal(projectDiagnostics({ readStatus: status, secret: sentinel }, cfg.diagnosticRun).diagnosticCoverage, 'NOT_CONFIRMED'));
const pair = obs('c'.repeat(64)); check(() => assert.equal(verifyTargetPair(pair, expected, cfg.run, 'c'.repeat(64)).length, 2));
for (const bad of [pair.slice(1), [...pair, pair[0]], [pair[0], pair[0]], pair.map(v => ({ ...v, run: 'r19-999-target' }))]) check(() => assert.throws(() => verifyTargetPair(bad, expected, cfg.run, 'c'.repeat(64))));
await recordTargetLedger({ query() { throw Error('NO_QUERY_WITHOUT_OPT_IN'); } }, 'before', {}); checks++;
let closed = 0; const primary = Error('ledger failure'), secondary = Error('close failure');
await assert.rejects(closeAfterLedger({}, async () => { closed++; throw secondary; }, async () => { throw primary; }), e => e === primary); checks++;
check(() => assert.equal(closed, 1));
await assert.rejects(closeAfterLedger({}, async () => { throw secondary; }, async () => {}), e => e === secondary); checks++;
const directory = { isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o40700 };
const file = { isFile: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o100600, size: 8192 };
const ledgerIo = { uid: 1000, inspect: async p => p.endsWith('.json') ? file : directory, list: async () => ['before.json', 'after.json'],
  read: async p => Buffer.from(JSON.stringify(pair.find(v => p.endsWith(v.stage + '.json')))) };
const completeLedger = await readTargetLedgers(cfg.run, 'c'.repeat(64), ledgerIo);
check(() => assert.equal(completeLedger.status, 'COMPLETE'));
for (const patch of [{ list: async () => ['before.json'] }, { list: async () => ['secret.env'] }, { read: async () => Buffer.alloc(16385) },
  { read: async () => Buffer.from('{invalid') }, { inspect: async () => ({ ...directory, isSymbolicLink: () => true }) },
  { inspect: async p => p.endsWith('.json') ? { ...file, uid: 0 } : directory }]) {
  const incomplete = await readTargetLedgers(cfg.run, 'c'.repeat(64), { ...ledgerIo, ...patch });
  check(() => assert.equal(incomplete.status, 'NOT_CONFIRMED'));
}
let source = (await readFile(targetFile, 'utf8')).replaceAll('\r\n', '\n');
source = source.split('\n').filter(l => !l.includes("import { recordTargetLedger, closeAfterLedger }") && !l.includes("await recordTargetLedger(")).join('\n');
source = source.replace('diagnostic.cleanup(() => closeAfterLedger(database.poolForMigrationsAndTests, () => database.close()))', 'diagnostic.cleanup(() => database.close())');
check(() => assert.equal(source, execFileSync('git', ['show', '5afc313:' + targetFile], { encoding: 'utf8' }).replaceAll('\r\n', '\n')));
check(() => assert.equal([...source.matchAll(/await refresh\.upsert\(/gu)].length, 3));
const runner = await readFile('scripts/run-r19-reconsent.mjs', 'utf8');
for (const text of ["for (const phase of ['target'])", "'grant-reconsent.test.ts'", "'reconsent-diagnostic.mjs'", "'r19-target-ledger.mjs'", "'--pull=never'", "'--internal'", "'1000:1000'", "diagnosticModulesLoaded", "'5afc313'"]) check(() => assert(runner.includes(text)));
check(() => assert(!runner.includes('test-persistent-images.mjs') && !runner.includes("['candidate', 'legacy']") && !runner.includes('docker system prune')));
console.log(JSON.stringify({ passed: true, checks, formalTestAttempts: 0, databaseStarted: false, productionAccessed: false, businessOperationsUnchanged: true }));
