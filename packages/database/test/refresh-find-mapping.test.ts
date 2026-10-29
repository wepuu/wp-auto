import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { PoolClient } from 'pg';
import { Database, PostgresOidcAdapter, SecretArtifactCodec } from '../src/index.js';

const sentinel = 'SENSITIVE_SYNTHETIC_RT_SENTINEL';
const denied = (): Error & { code: string } => Object.assign(new Error('artifact_link_missing'), { code: 'P0001' });

function fixture(t: TestContext, input: {
  model?: string; error?: unknown; errorAt?: string; rollbackError?: Error;
  missing?: boolean; consumed?: boolean; secondKey?: boolean;
} = {}) {
  const database = new Database({ connectionString: 'postgresql://unused.invalid/synthetic', applicationName: 'r39-find-unit' });
  const statements: string[] = []; let released = false, selects = 0;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql === 'ROLLBACK' && input.rollbackError !== undefined) throw input.rollbackError;
      if (sql.startsWith(input.errorAt ?? 'SELECT oauth.artifact_classify') && Object.hasOwn(input, 'error')) throw input.error;
      if (sql.startsWith('SELECT payload, consumed_at')) {
        selects++;
        return { rows: input.missing === true || input.secondKey === true && selects === 1 ? [] : [{
          payload: { grantId: 'grant_SYNTHETIC', jti: 'not_returned' }, consumed_at: input.consumed === true ? new Date(12000) : null
        }] };
      }
      if (sql.startsWith('SELECT payload FROM oauth.provider_artifacts')) return { rows: [{ payload: { uid: 'session_SYNTHETIC' } }] };
      return { rows: [] };
    },
    release() { released = true; }
  };
  t.mock.method(database.poolForMigrationsAndTests, 'connect', async () => client as unknown as PoolClient);
  t.after(async () => { await database.close(); });
  const codec = new SecretArtifactCodec([Buffer.alloc(32, 7), Buffer.alloc(32, 8)]);
  const adapter = new PostgresOidcAdapter(input.model ?? 'RefreshToken', database, codec);
  return { run: () => adapter.find('synthetic_RT_0001'), statements, released: () => released };
}

function rolledBack(f: ReturnType<typeof fixture>) {
  assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released()); assert(!f.statements.includes('COMMIT'));
  assert(f.statements.every(sql => !/^(INSERT|UPDATE|DELETE)/u.test(sql)));
}

test('exact RT link denial becomes generic invalid_grant after actual transaction rollback', async t => {
  const original = Object.assign(denied(), { detail: sentinel }), f = fixture(t, { error: original });
  await assert.rejects(f.run(), (e: unknown) => {
    assert(e instanceof Error); assert.notEqual(e, original);
    const value = e as Error & { error: string; error_description: string; status: number; statusCode: number; expose: boolean };
    assert.equal(value.name, 'InvalidGrant'); assert.equal(value.message, 'invalid_grant');
    assert.equal(value.error, 'invalid_grant'); assert.equal(value.error_description, 'grant request is invalid');
    assert.equal(value.status, 400); assert.equal(value.statusCode, 400); assert.equal(value.expose, true);
    assert(!JSON.stringify(value).includes('artifact_link_missing')); assert(!JSON.stringify(value).includes(sentinel));
    return true;
  });
  rolledBack(f);
});

for (const [name, error] of [
  ['other P0001', Object.assign(new Error(sentinel), { code: 'P0001' })],
  ['permission', Object.assign(new Error('artifact_link_missing'), { code: '42501' })],
  ['connection', Object.assign(new Error(sentinel), { code: '08006' })],
  ['cancellation', Object.assign(new Error(sentinel), { code: '57014' })],
  ['timeout', Object.assign(new Error(sentinel), { code: 'ETIMEDOUT' })],
  ['unknown Error', new Error(sentinel)],
  ['missing SQLSTATE', new Error('artifact_link_missing')],
  ['non Error object', { code: 'P0001', message: 'artifact_link_missing' }],
  ['non object', sentinel]
] as const) {
  test(`RT find preserves ${name}`, async t => {
    const f = fixture(t, { error }); await assert.rejects(f.run(), (e: unknown) => e === error); rolledBack(f);
  });
}

for (const errorAt of ['BEGIN', 'SET LOCAL ROLE wepuu_auth', 'SELECT payload, consumed_at', 'COMMIT']) {
  test(`same link error from ${errorAt} is not a classification denial`, async t => {
    const original = denied(), f = fixture(t, { error: original, errorAt });
    await assert.rejects(f.run(), (e: unknown) => e === original);
    assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released());
  });
}

for (const model of ['AuthorizationCode', 'AccessToken', 'Session']) {
  test(`${model} does not use RT find mapping`, async t => {
    const original = denied(), f = fixture(t, { model, error: original,
      errorAt: model === 'AuthorizationCode' ? 'SELECT oauth.artifact_classify' : model === 'Session' ? 'SELECT payload FROM oauth.provider_artifacts' : 'SELECT payload, consumed_at' });
    await assert.rejects(f.run(), (e: unknown) => e === original); rolledBack(f);
  });
}

test('rollback failure wins over exact RT classification rejection', async t => {
  const rollbackError = new Error(sentinel), f = fixture(t, { error: denied(), rollbackError });
  await assert.rejects(f.run(), (e: unknown) => e === rollbackError); rolledBack(f);
});

test('normal RT find keeps payload and commits without writing', async t => {
  const f = fixture(t), value = await f.run(); assert.equal(value?.['grantId'], 'grant_SYNTHETIC'); assert.equal(value?.['jti'], 'synthetic_RT_0001');
  assert.equal(value?.['consumed'], undefined); assert.equal(f.statements.at(-1), 'COMMIT'); assert(f.released());
  assert.equal(f.statements.filter(sql => sql.startsWith('SELECT oauth.artifact_classify')).length, 1);
  assert(f.statements.every(sql => !/^(INSERT|UPDATE|DELETE)/u.test(sql)));
});

test('consumed RT representation remains unchanged', async t => {
  const f = fixture(t, { consumed: true }); assert.equal((await f.run())?.['consumed'], 12); assert.equal(f.statements.at(-1), 'COMMIT');
});

test('missing RT stays undefined without classification or writes', async t => {
  const f = fixture(t, { missing: true }); assert.equal(await f.run(), undefined); assert.equal(f.statements.at(-1), 'COMMIT');
  assert(!f.statements.some(sql => sql.startsWith('SELECT oauth.artifact_classify')));
});

test('second lookup key remains supported', async t => {
  const f = fixture(t, { secondKey: true }); assert.equal((await f.run())?.['jti'], 'synthetic_RT_0001');
  assert.equal(f.statements.filter(sql => sql.startsWith('SELECT payload, consumed_at')).length, 2); assert.equal(f.statements.at(-1), 'COMMIT');
});

test('normal Code classification remains unchanged', async t => {
  const f = fixture(t, { model: 'AuthorizationCode' }); assert.equal((await f.run())?.['jti'], 'synthetic_RT_0001');
  assert.equal(f.statements.filter(sql => sql.startsWith('SELECT oauth.artifact_classify')).length, 1); assert.equal(f.statements.at(-1), 'COMMIT');
});

test('normal Session bypasses secret artifact classification', async t => {
  const f = fixture(t, { model: 'Session' }); assert.equal((await f.run())?.['uid'], 'session_SYNTHETIC');
  assert(!f.statements.some(sql => sql.startsWith('SELECT oauth.artifact_classify'))); assert.equal(f.statements.at(-1), 'COMMIT');
});
