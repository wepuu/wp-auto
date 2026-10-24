import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { stages, safeError, validateDiagnostic, saveDiagnostic, createDiagnostic, reconsentDiagnostic, reconcileDiagnostics, readDiagnostics } from '../packages/database/test/reconsent-diagnostic.mjs';
let checks = 0;
const check = fn => { fn(); checks++; };
const sentinel = 'SENSITIVE_SENTINEL_TOKEN_SQL_STACK';
const cfg = { run: 'r18-123' };
const make = (save = async () => {}) => createDiagnostic({ ...cfg, save, clock: () => 1 });
const advance = (d, end = stages.length - 1) => { for (let i = 1; i <= end; i++) d.checkpoint(stages[i]); };
for (let i = 0; i < stages.length; i++) {
  const written = [], d = make(async value => written.push(structuredClone(value)));
  const error = Object.assign(Error(sentinel), { code: i % 2 ? 'ERR_ASSERTION' : 'P0001', payload: sentinel, actual: sentinel, expected: sentinel });
  await assert.rejects(d.main(async () => { advance(d, i); throw error; }), e => e === error); checks++;
  await d.cleanup(async () => {});
  check(() => assert.equal(written[0].stage, stages[i]));
  check(() => assert.deepEqual(written[0].completedStages, stages.slice(0, i)));
  check(() => assert.equal(written[0].status, 'FAIL'));
  check(() => assert.equal(written[1].status, 'PASS'));
  check(() => assert.equal(written[0].ledgerStatus, 'NOT_CONFIRMED'));
  check(() => assert(!JSON.stringify(written).includes(sentinel)));
  const before = d.snapshot(); await assert.rejects(d.main(async () => {})); checks++;
  check(() => assert.deepEqual(d.snapshot(), before));
}
for (const [error, expected] of [
  [{ error: 'invalid_grant', error_description: sentinel }, 'OAUTH_INVALID_GRANT'],
  [{ code: '42P01', query: sentinel }, 'POSTGRES_ERROR'], [{ code: '42883' }, 'POSTGRES_ERROR'],
  [{ code: 'ETIMEDOUT' }, 'TIMEOUT'], [{ code: 'EACCES' }, 'ACCESS_DENIED'],
  [{ code: 'ERR_MODULE_NOT_FOUND' }, 'MODULE_LOAD_FAILED'], [{ code: sentinel, name: sentinel }, 'NOT_CONFIRMED'],
  [null, 'NOT_CONFIRMED'], [undefined, 'NOT_CONFIRMED'], ['secret primitive', 'NOT_CONFIRMED']
]) check(() => assert.equal(safeError(error).category, expected));
let getters = 0;
const dangerous = Object.defineProperties({}, { code: { get() { getters++; throw Error(sentinel); } }, cause: { get() { getters++; throw Error(sentinel); } } });
check(() => assert.equal(safeError(dangerous).category, 'NOT_CONFIRMED'));
check(() => assert.equal(getters, 0));
const nested = { code: 'ERR_TEST_FAILURE', cause: { code: '23505', cause: { secret: sentinel } } };
check(() => assert.deepEqual(safeError(nested), { category: 'NOT_CONFIRMED', cause: { category: 'POSTGRES_ERROR', sqlstate: '23505' } }));
const cycle = {}; cycle.cause = cycle;
check(() => assert.deepEqual(safeError(cycle), { category: 'NOT_CONFIRMED', cause: { category: 'NOT_CONFIRMED' } }));
const original = Error(sentinel), cleanupError = Object.assign(Error(sentinel), { code: '42501' });
const both = make();
await assert.rejects(both.main(async () => { throw original; }), e => e === original); checks++;
await assert.rejects(both.cleanup(async () => { throw cleanupError; }), e => e === cleanupError); checks++;
check(() => assert.equal(both.snapshot().main.stage, 'SETUP'));
check(() => assert.equal(both.snapshot().cleanup.error.sqlstate, '42501'));
check(() => assert(!JSON.stringify(both.snapshot()).includes(sentinel)));
const cleanupOnly = make(); await cleanupOnly.main(async () => { advance(cleanupOnly); });
await assert.rejects(cleanupOnly.cleanup(async () => { throw cleanupError; }), e => e === cleanupError); checks++;
check(() => assert.equal(cleanupOnly.snapshot().main.status, 'PASS'));
check(() => assert.equal(cleanupOnly.snapshot().cleanup.status, 'FAIL'));
check(() => assert.equal(reconcileDiagnostics(Object.values(cleanupOnly.snapshot()), cfg.run).primaryFailure, null));
check(() => assert.equal(reconcileDiagnostics(Object.values(cleanupOnly.snapshot()), cfg.run).cleanupFailure.error.sqlstate, '42501'));
const cleanupSave = make(async value => { if (value.channel === 'cleanup') throw Error(sentinel); });
await cleanupSave.main(async () => { advance(cleanupSave); });
await assert.rejects(cleanupSave.cleanup(async () => { throw cleanupError; }), e => e === cleanupError); checks++;
check(() => assert.equal(cleanupSave.snapshot().cleanup.evidenceSaveFailed, true));
check(() => assert.equal(reconcileDiagnostics(Object.values(cleanupSave.snapshot()), cfg.run).diagnosticCoverage, 'NOT_CONFIRMED'));
const success = make();
check(() => assert.throws(() => success.checkpoint('MIGRATION')));
check(() => assert.equal(typeof success.main, 'function'));
await assert.rejects(success.cleanup(async () => {})); checks++;
check(() => assert.equal(awaitableNoop(), true));
function awaitableNoop() { return reconsentDiagnostic({}).main(() => true); }
await success.main(async () => { advance(success); return 7; });
check(() => assert.equal(success.snapshot().main.status, 'PASS'));
await success.cleanup(async () => {});
const valid = success.snapshot().main;
for (const mutate of [v => v.secret = sentinel, v => v.status = 'UNKNOWN', v => v.stage = sentinel,
  v => v.completedStages.pop(), v => v.ledgerStatus = 'PASS', v => v.run = sentinel,
  v => v.error = { category: 'ASSERTION_FAILED', actual: sentinel }, v => v.evidenceSaveFailed = null,
  v => v.elapsedMs = NaN, v => delete v.file]) {
  const value = structuredClone(valid); mutate(value); check(() => assert.throws(() => validateDiagnostic(value)));
}
const failReport = both.snapshot().cleanup;
for (const error of [{ category: 'POSTGRES_ERROR', sqlstate: sentinel }, { category: 'NOT_CONFIRMED', sqlstate: 'P0001' },
  { category: 'NOT_CONFIRMED', cause: { category: 'NOT_CONFIRMED', cause: {} } }, { category: 'UNKNOWN' }]) {
  check(() => assert.throws(() => validateDiagnostic({ ...failReport, error })));
}
for (const env of [{ WEPUU_R18_RUN_ID: 'r18-123' }, { WEPUU_R18_DIAGNOSTIC_ROOT: '/evidence/r18' },
  { WEPUU_R18_RUN_ID: 'r18-123', WEPUU_R18_DIAGNOSTIC_ROOT: '/production' },
  { WEPUU_R18_RUN_ID: 'r17-123', WEPUU_R18_DIAGNOSTIC_ROOT: '/evidence/r18' }]) check(() => assert.throws(() => reconsentDiagnostic(env)));
const disabled = reconsentDiagnostic({});
check(() => assert.equal(disabled.main(() => 42), 42));
check(() => assert.equal(disabled.cleanup(() => 9), 9));
check(() => assert.throws(() => disabled.main(() => { throw original; }), e => e === original));
const missing = make(); await assert.rejects(missing.main(async () => {})); checks++;
check(() => assert.equal(missing.snapshot().main.status, 'FAIL'));
for (const primary of [false, true]) {
  const d = make(async () => { throw Error(sentinel); });
  await assert.rejects(d.main(async () => { if (primary) throw original; advance(d); }), e => primary ? e === original : e.code === 'R18_DIAGNOSTIC_SAVE_FAILED'); checks++;
  check(() => assert.equal(d.snapshot().main.evidenceSaveFailed, true));
  check(() => assert(!JSON.stringify(d.snapshot()).includes(sentinel)));
}
const concurrent = make(); await concurrent.main(async () => { advance(concurrent); });
let release; const cleanup = concurrent.cleanup(() => new Promise(resolve => { release = resolve; }));
await assert.rejects(concurrent.cleanup(async () => {})); checks++; release(); await cleanup;
const written = [];
const goodStat = { isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o40700 };
const io = { uid: 1000, inspect: async () => goodStat, write: async (...args) => { written.push(args); } };
await saveDiagnostic(valid, io);
check(() => assert.equal(written[0][0], '/evidence/r18/main.json'));
check(() => assert.deepEqual(written[0][2], { flag: 'wx', mode: 0o600 }));
for (const stat of [{ ...goodStat, mode: 0o40755 }, { ...goodStat, uid: 0 }, { ...goodStat, isSymbolicLink: () => true }, { ...goodStat, isDirectory: () => false }]) {
  await assert.rejects(saveDiagnostic(valid, { ...io, inspect: async () => stat })); checks++;
}
for (const method of ['inspect', 'write']) {
  await assert.rejects(saveDiagnostic(valid, { ...io, [method]: async () => { throw Object.assign(Error(sentinel), { code: 'EACCES' }); } })); checks++;
}
const pair = Object.values(both.snapshot());
const summary = reconcileDiagnostics(pair, cfg.run);
check(() => assert.equal(summary.primaryFailure.stage, 'SETUP'));
check(() => assert.equal(summary.cleanupFailure.error.sqlstate, '42501'));
check(() => assert.equal(summary.diagnosticCoverage, 'COMPLETE'));
check(() => assert.equal(summary.testVerdict, 'NOT_CONFIRMED'));
check(() => assert.equal(reconcileDiagnostics([], cfg.run).diagnosticCoverage, 'NOT_CONFIRMED'));
check(() => assert.equal(reconcileDiagnostics([pair[1]], cfg.run).primaryFailure, null));
for (const bad of [[pair[0], pair[0]], pair.map(v => ({ ...v, run: 'r18-999' })), [pair[0], pair[1], pair[1]]]) check(() => assert.throws(() => reconcileDiagnostics(bad, cfg.run)));
check(() => assert.equal(reconcileDiagnostics(Object.values(success.snapshot()), cfg.run).testVerdict, 'NOT_CONFIRMED'));
const fileStat = { isFile: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o100600, size: 4096 };
const readIo = { uid: 1000, inspect: async p => p.endsWith('.json') ? fileStat : goodStat,
  list: async () => ['main.json', 'cleanup.json'], read: async p => Buffer.from(JSON.stringify(pair.find(v => p.endsWith(v.channel + '.json')))) };
const loaded = await readDiagnostics(cfg.run, readIo);
check(() => assert.equal(loaded.readStatus, 'VALID'));
check(() => assert.equal(loaded.primaryFailure.stage, 'SETUP'));
for (const list of [[], ['cleanup.json'], ['secret.env'], ['main.json', 'main.json']]) {
  const r = await readDiagnostics(cfg.run, { ...readIo, list: async () => list });
  check(() => assert.equal(r.diagnosticCoverage, 'NOT_CONFIRMED'));
}
for (const override of [
  { read: async () => Buffer.from('{invalid') },
  { read: async () => Buffer.from(JSON.stringify({ ...pair[0], payload: sentinel })) },
  { read: async () => Buffer.alloc(16385) },
  { read: async () => { throw Object.assign(Error(sentinel), { code: 'EACCES' }); } },
  { list: async () => { throw Object.assign(Error(sentinel), { code: 'ENOENT' }); } },
  { inspect: async () => ({ ...goodStat, isSymbolicLink: () => true }) },
  { inspect: async p => p.endsWith('.json') ? { ...fileStat, size: 16385 } : goodStat }
]) {
  const r = await readDiagnostics(cfg.run, { ...readIo, ...override });
  check(() => assert.equal(r.diagnosticCoverage, 'NOT_CONFIRMED'));
  check(() => assert(!JSON.stringify(r).includes(sentinel)));
}
// Verify the actual fixture only gained instrumentation, not changed operations/assertions.
const file = 'packages/database/test/grant-reconsent.test.ts';
const source = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
let stripped = source.split('\n').filter(line => !line.includes("import { reconsentDiagnostic }")
  && !line.includes('const diagnostic = reconsentDiagnostic();') && !line.includes('return diagnostic.main(async () => {')
  && !line.includes('diagnostic.checkpoint(')).join('\n');
stripped = stripped.replace('t.after(() => diagnostic.cleanup(() => database.close()));', 't.after(() => database.close());')
  .replace('  });\n});\n', '});\n');
check(() => assert.equal(stripped, execFileSync('git', ['show', 'c23d97e:' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n')));
check(() => assert.deepEqual([...source.matchAll(/diagnostic\.checkpoint\('([A-Z0-9_]+)'\)/gu)].map(m => m[1]), stages.slice(1)));
const ordinaryRefreshCalls = [...source.matchAll(/await refresh\.upsert\(/gu)].length;
check(() => assert.equal(ordinaryRefreshCalls, 3));
const scanned = (await readdir('packages/database/test')).filter(f => f.endsWith('.test.ts'));
check(() => assert.equal(scanned.length, 16));
const positives = [];
for (const name of scanned) {
  const text = await readFile('packages/database/test/' + name, 'utf8');
  if (text.includes('new PostgresOidcAdapter(') && text.includes("'RefreshToken'") && /\.upsert\(/u.test(text)) positives.push(name);
}
check(() => assert.deepEqual(positives.sort(), ['grant-reconsent.test.ts', 'tenant-isolation.test.ts']));
console.log(JSON.stringify({ passed: true, checks, databaseStarted: false, containerStarted: false,
  productionAccessed: false, businessOperationsUnchanged: true, firstR17FailureConfirmed: false }));
