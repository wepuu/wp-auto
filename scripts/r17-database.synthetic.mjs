import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expectedLedger, verifyLedger, verifySet, recordFixtureLedger, fixtureScopes } from '../packages/database/test/r17-migration-evidence.mjs';
import { validateCredential, executeGroup } from '../test/persistent-authorization/r17/database-group.mjs';
import { projectGroup } from './run-r17-database.mjs';
import { candidateDatabase, retainedDatabase, legacyDatabase } from '../test/persistent-authorization/r10/profiles.mjs';
let checks = 0;
function check(fn) { fn(); checks++; }
const cfg = { host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres', password: 'a'.repeat(64), run: 'r17-123-candidate' };
check(() => assert.equal(validateCredential(cfg, false), cfg));
for (const v of [{ ...cfg, host: 'production.example' }, { ...cfg, run: 'r16-123' }, { ...cfg, password: 'SENSITIVE_SENTINEL' }]) check(() => assert.throws(() => validateCredential(v, false)));
for (const [profile, count] of [['candidate', 16], ['historical14', 14], ['historical13', 13], ['legacy', 17]]) {
  const rows = await expectedLedger(profile);
  check(() => assert.equal(rows.length, count));
  check(() => verifyLedger(rows, rows, profile === 'legacy', profile));
  check(() => assert.throws(() => verifyLedger(rows.slice(1), rows, profile === 'legacy', profile)));
  check(() => assert.throws(() => verifyLedger(rows, rows, profile !== 'legacy', profile)));
  const changed = structuredClone(rows); changed[0].sha256 = 'f'.repeat(64);
  check(() => assert.throws(() => verifyLedger(changed, rows, profile === 'legacy', profile)));
}
const file = 'otp-send-budget.test.ts', rows = await expectedLedger('historical14');
const values = ['a', 'b'].flatMap(id => ['before', 'after'].map(stage => ({ run: cfg.run, file, profile: 'historical14', stage, databaseSha256: id.repeat(64), migrations: rows, consoleObjects: false, passed: true })));
check(() => assert.equal(verifySet(values, rows, cfg.run, file).length, 4));
for (const bad of [values.slice(1), [...values, values[0]], values.map(v => ({ ...v, run: 'r16-123' })), values.map(v => ({ ...v, secret: 'SENSITIVE_SENTINEL' }))]) check(() => assert.throws(() => verifySet(bad, rows, cfg.run, file)));
for (const f of ['migration-profile.test.ts', 'secret-artifact.test.ts']) check(() => assert.equal(verifySet([], [], cfg.run, f).length, 0));
check(() => assert.equal(Object.keys(fixtureScopes).length, 16));
await recordFixtureLedger({ query() { throw Error('must not query without R17'); } }, 'before', 'candidate', {}); checks++;
for (const stage of ['load', 'construct', 'connect', 'query', 'save']) {
  let saved;
  class FakeClient {
    constructor() { if (stage === 'construct') throw Error('SENSITIVE_SENTINEL'); }
    async connect() { if (stage === 'connect') throw Error('SENSITIVE_SENTINEL'); }
    async query() { throw Object.assign(Error('SENSITIVE_SENTINEL'), { code: stage === 'query' ? 'ETIMEDOUT' : 'EACCES' }); }
    async end() {}
  }
  const result = await executeGroup(false, { load: async () => { if (stage === 'load') throw Error('SENSITIVE_SENTINEL'); return cfg; }, Client: FakeClient,
    save: async value => { if (stage === 'save') throw Error('SENSITIVE_SENTINEL'); saved = structuredClone(value); } });
  check(() => assert.equal(result.passed, false));
  check(() => assert(!JSON.stringify(result).includes('SENSITIVE_SENTINEL')));
  check(() => assert(stage === 'save' ? result.category === 'EVIDENCE_SAVE_FAILED' : saved?.passed === false));
}
// Strip only known instrumentation, then compare every original business byte.
for (const f of ['p3d-fixture.ts', 'multi-site-provider.test.ts', 'persistent-readonly.test.ts', 'pairing-diagnostics.test.ts']) {
  const name = 'packages/database/test/' + f;
  let current = (await readFile(name, 'utf8')).replaceAll('\r\n', '\n');
  const original = execFileSync('git', ['show', '0ad6bbb:' + name], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
  current = current.split('\n').filter(line => !line.includes("import { recordFixtureLedger }") && !line.includes('R17_FIXTURE_FULL_PROFILE_FORBIDDEN')
    && !(line.includes('await recordFixtureLedger(') && !line.includes('t.after(async () =>'))).join('\n');
  current = current.replace("await recordFixtureLedger(admin, 'after', 'candidate'); ", '');
  check(() => assert.equal(current, original));
}
const setupFailure = await projectGroup({ passed: false, stage: 'credentials', category: 'CREDENTIALS_NOT_CONFIRMED', reports: [], observations: [], secret: 'SENSITIVE_SENTINEL' }, cfg.run, false);
check(() => assert.equal(setupFailure.category, 'CREDENTIALS_NOT_CONFIRMED'));
check(() => assert.equal(setupFailure.credentialRunConfirmed, false));
check(() => assert(!JSON.stringify(setupFailure).includes('SENSITIVE_SENTINEL')));
for (const legacy of [false, true]) {
  const manifest = legacy ? legacyDatabase : { ...candidateDatabase, ...retainedDatabase }, run = 'r17-123-' + (legacy ? 'legacy' : 'candidate');
  const v = { run, passed: true, stage: 'complete', candidatePass: !legacy, retainedPass: !legacy, legacyResult: legacy ? 'PASS' : 'NOT_RUN', reports: [], observations: [] };
  let next = 0;
  for (const f of Object.keys(manifest)) {
    v.reports.push({ file: f, passed: true, migrationVerified: true, category: 'PASS', reportStatus: 'VALID', report: { passed: true, skipCount: 0, topLevelCountsMatch: true, missing: [], failures: [] } });
    const [profile, count, mode] = fixtureScopes[f];
    const migrations = profile === 'none' ? [] : await expectedLedger(profile);
    for (let i = 0; i < count; i++) {
      const databaseSha256 = (++next).toString(16).padStart(64, '0');
      for (const stage of mode === 'paired' ? ['before', 'after'] : ['post']) v.observations.push({ run, file: f, profile, stage, databaseSha256, migrations, consoleObjects: legacy, passed: true });
    }
  }
  check(() => assert.equal(v.reports.length, legacy ? 1 : 15));
  const safe = await projectGroup(v, run, legacy);
  check(() => assert.equal(safe.passed, true));
  for (const mutate of [x => x.reports.pop(), x => x.observations.pop(), x => x.reports.push(x.reports[0]), x => x.run = 'r16-123', x => x.reports[0].report.skipCount = 1, x => x.reports[0].migrationVerified = false]) {
    const bad = structuredClone(v); mutate(bad); await assert.rejects(() => projectGroup(bad, run, legacy)); checks++;
  }
}
const runner = await readFile('scripts/run-r17-database.mjs', 'utf8');
for (const f of ['otp-send-budget.test.ts', 'otp-migration-evidence.mjs', 'p3d-fixture.ts', 'r17-migration-evidence.mjs']) check(() => assert(runner.includes("'" + f + "'")));
check(() => assert(runner.indexOf("await stop(probe)") < runner.indexOf("for (const phase of ['candidate', 'legacy'])")));
check(() => assert(runner.includes("if (!group.passed) deny('DATABASE_GROUP_FAILED')")));
check(() => assert(!runner.includes('docker system prune') && !runner.includes('test-persistent-images.mjs')));
console.log(JSON.stringify({ passed: true, checks, productionAccessed: false, databaseStarted: false, businessAssertionsUnchanged: true }));
