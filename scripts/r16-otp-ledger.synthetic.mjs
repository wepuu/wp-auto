import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { expectedOtpLedger, verifyOtpLedger, verifyObservationSet, recordOtpLedger } from '../packages/database/test/otp-migration-evidence.mjs';
const run = 'r16-20261024', expected = await expectedOtpLedger();
const observation = (id, stage) => ({ run, stage, databaseSha256: id.repeat(64), migrations: structuredClone(expected), consoleTablesAbsent: true, passed: true });
const observations = () => ['a', 'b'].flatMap(id => ['before', 'after'].map(stage => observation(id, stage)));
const cases = [
  ['exact_fourteen_and_no_other_releases', async () => {
    assert.equal(expected.length, 14); assert(!expected.some(v => /^(014|016|017)_/u.test(v.name)));
    assert(verifyOtpLedger(expected, expected, false));
  }],
  ['business_assertions_unchanged', async () => {
    const source = await readFile(new URL('../packages/database/test/otp-send-budget.test.ts', import.meta.url), 'utf8');
    const original = (await promisify(execFile)('git', ['show', '207fd0b:packages/database/test/otp-send-budget.test.ts'], { windowsHide: true, timeout: 5000 })).stdout;
    const normalize = v => v.replaceAll('\r\n', '\n');
    const reverted = normalize(source).replace("import { recordOtpLedger } from './otp-migration-evidence.mjs';\n", '')
      .replaceAll("  await recordOtpLedger(pool, 'before');\n", '').replaceAll("  cleanup(() => recordOtpLedger(pool, 'after'));\n", '')
      .replace('p3dFixture(t, false)', 'p3dFixture(t, true)');
    assert.equal(reverted, normalize(original));
    const fixture = await readFile(new URL('../packages/database/test/p3d-fixture.ts', import.meta.url), 'utf8');
    const oldFixture = (await promisify(execFile)('git', ['show', '207fd0b:packages/database/test/p3d-fixture.ts'], { windowsHide: true, timeout: 5000 })).stdout;
    assert.equal(normalize(fixture), normalize(oldFixture));
  }],
  ['missing_hash_or_out_of_scope_migration_rejected', async () => {
    for (const rows of [[], expected.slice(1), [...expected, { name: '014_console_auth_boundary.sql', sha256: 'a'.repeat(64) }],
      expected.map((v, i) => i === 0 ? { ...v, sha256: '0'.repeat(64) } : v)])
      assert.throws(() => verifyOtpLedger(rows, expected, false), { code: 'OTP_LEDGER_DENIED' });
    assert.throws(() => verifyOtpLedger(expected, expected, true));
  }],
  ['two_distinct_fixtures_need_before_and_after', async () => {
    assert.equal(verifyObservationSet(observations(), expected, run).length, 4);
    for (const v of [observations().slice(1), [...observations(), observation('c', 'before')],
      observations().map(v => ({ ...v, run: 'other' })), observations().map(v => ({ ...v, stage: 'before' })),
      observations().map(v => ({ ...v, databaseSha256: 'a'.repeat(64) }))])
      assert.throws(() => verifyObservationSet(v, expected, run));
  }],
  ['actual_connection_identity_not_parent', async () => {
    const pool = { async query(sql) { return { rows: sql.includes('current_database')
      ? [{ name: 'postgres', console_objects: false }] : expected }; } };
    await assert.rejects(() => recordOtpLedger(pool, 'before', { expected: async () => expected, env: {} }), { code: 'OTP_LEDGER_DENIED' });
  }],
  ['private_evidence_save_failure_propagates', async () => {
    const pool = { async query(sql) { return { rows: sql.includes('current_database')
      ? [{ name: 'wepuu_p3d_' + 'a'.repeat(14), console_objects: false }] : expected }; } };
    let saves = 0;
    const options = { expected: async () => expected, env: { WEPUU_R16_EVIDENCE_ROOT: '/evidence/ledger', WEPUU_R16_RUN_ID: run },
      uid: 1000, inspect: async () => ({ isDirectory: () => true, isSymbolicLink: () => false, mode: 0o700, uid: 1000 }),
      save: async () => { saves++; throw Error('SECRET_SENTINEL'); } };
    await assert.rejects(() => recordOtpLedger(pool, 'before', options), /SECRET_SENTINEL/u); assert.equal(saves, 1);
  }]
];
const result = { phase: 'r16_otp_ledger_synthetic', passed: true, databaseAccessed: false, cases: [] };
for (const [name, check] of cases) {
  try { await check(); result.cases.push({ name, passed: true }); }
  catch { result.cases.push({ name, passed: false, category: 'SYNTHETIC_ASSERTION_FAILED' }); result.passed = false; break; }
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
