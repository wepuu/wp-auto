import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { PoolClient } from 'pg';
import { Database, PostgresOidcAdapter, RateLimitSubjectCodec, SecretArtifactCodec } from '../src/index.js';

const sentinel = 'SENSITIVE_SYNTHETIC_SENTINEL';
const knownDenial = (): Error & { code: string } => Object.assign(new Error('persistent_grant_denied'), { code: 'P0001' });

function fixture(t: TestContext, input: {
  model?: string; error?: unknown; rollbackError?: Error; errorAt?: string;
  value?: string; rateCodec?: boolean; missingRefreshGrant?: boolean;
} = {}) {
  const database = new Database({ connectionString: 'postgresql://unused.invalid/synthetic', applicationName: 'mapping-unit' });
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql === 'ROLLBACK' && input.rollbackError !== undefined) throw input.rollbackError;
      const matches = input.errorAt === undefined ? sql.startsWith('SELECT oauth.consume_') : sql.startsWith(input.errorAt);
      if (matches && Object.hasOwn(input, 'error')) throw input.error;
      if (sql.startsWith('SELECT payload FROM oauth.secret_artifacts')) {
        return { rows: input.missingRefreshGrant === true ? [] : [{ payload: { grantId: 'grant_SYNTHETIC' } }] };
      }
      if (sql.startsWith('SELECT oauth.consume_other_artifact')) return { rows: [{ value: input.value !== 'missing' }] };
      if (sql.startsWith('SELECT oauth.consume_classified_artifact')) return { rows: [{ value: input.value ?? 'consumed' }] };
      return { rows: [], rowCount: sql.startsWith('UPDATE oauth.provider_artifacts') ? 1 : 0 };
    },
    release() { released = true; }
  };
  // Exercise the actual Database transaction and actual adapter, without sockets.
  t.mock.method(database.poolForMigrationsAndTests, 'connect', async () => client as unknown as PoolClient);
  t.after(async () => { await database.close(); });
  const codec = new SecretArtifactCodec([Buffer.alloc(32, 7)]);
  const rate = input.rateCodec === true ? new RateLimitSubjectCodec(Buffer.alloc(32, 8)) : undefined;
  const adapter = new PostgresOidcAdapter(input.model ?? 'AuthorizationCode', database, codec, rate);
  return { run: () => adapter.consume('synthetic_CODE_0001'), statements, released: () => released };
}

test('exact classified Code denial becomes generic invalid_grant after rollback', async t => {
  const original = knownDenial();
  const f = fixture(t, { error: original });
  await assert.rejects(f.run(), (error: unknown) => {
    assert(error instanceof Error);
    const value = error as Error & { error: string; status: number; statusCode: number; expose: boolean };
    assert.notEqual(value, original);
    assert.equal(value.name, 'InvalidGrant');
    assert.equal(value.error, 'invalid_grant');
    assert.equal(value.message, 'invalid_grant');
    assert.equal(value.status, 400); assert.equal(value.statusCode, 400); assert.equal(value.expose, true);
    assert(!JSON.stringify(value).includes('persistent_grant_denied'));
    assert(!JSON.stringify(value).includes(sentinel));
    assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released());
    return true;
  });
  assert(!f.statements.includes('COMMIT'));
});

for (const [name, error] of [
  ['other P0001', Object.assign(new Error(sentinel), { code: 'P0001' })],
  ['permission denial', Object.assign(new Error('persistent_grant_denied'), { code: '42501' })],
  ['connection failure', Object.assign(new Error(sentinel), { code: '08006' })],
  ['query cancellation', Object.assign(new Error(sentinel), { code: '57014' })],
  ['timeout', Object.assign(new Error(sentinel), { code: 'ETIMEDOUT' })],
  ['unknown Error', new Error(sentinel)],
  ['missing SQLSTATE', new Error('persistent_grant_denied')],
  ['non Error object', { code: 'P0001', message: 'persistent_grant_denied' }],
  ['non object', sentinel]
] as const) {
  test(`Code consume preserves ${name}`, async t => {
    const f = fixture(t, { error });
    await assert.rejects(f.run(), (actual: unknown) => actual === error);
    assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released()); assert(!f.statements.includes('COMMIT'));
  });
}

for (const model of ['RefreshToken', 'AccessToken', 'Session']) {
  test(`${model} cannot use the Code-only mapping`, async t => {
    const original = knownDenial();
    const f = fixture(t, { model, error: original, rateCodec: true,
      ...(model === 'Session' ? { errorAt: 'UPDATE oauth.provider_artifacts' } : {}) });
    await assert.rejects(f.run(), (actual: unknown) => actual === original);
    assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released());
  });
}

test('matching text from an earlier transaction operation is not converted', async t => {
  const original = knownDenial(); const f = fixture(t, { error: original, errorAt: 'SET LOCAL ROLE wepuu_auth' });
  await assert.rejects(f.run(), (actual: unknown) => actual === original);
});

test('rollback failure takes precedence over a mapped authorization denial', async t => {
  const rollbackError = new Error(sentinel); const f = fixture(t, { error: knownDenial(), rollbackError });
  await assert.rejects(f.run(), (actual: unknown) => actual === rollbackError);
  assert.equal(f.statements.at(-1), 'ROLLBACK'); assert(f.released());
});

test('normal classified Code consumption still commits', async t => {
  const f = fixture(t); await f.run(); assert.equal(f.statements.at(-1), 'COMMIT'); assert(f.released());
});

test('missing consumed artifact behavior remains unchanged', async t => {
  const f = fixture(t, { value: 'missing' }); await assert.rejects(f.run(), { message: 'oauth_artifact_already_consumed' });
  assert.equal(f.statements.at(-1), 'COMMIT');
});

test('existing Refresh replay classification remains invalid_grant', async t => {
  const f = fixture(t, { model: 'RefreshToken', rateCodec: true, value: 'replay' });
  await assert.rejects(f.run(), (e: unknown) => e instanceof Error && e.name === 'InvalidGrant');
  assert.equal(f.statements.at(-1), 'COMMIT');
});

test('existing Refresh rate-limit result is not converted', async t => {
  const f = fixture(t, { model: 'RefreshToken', rateCodec: true, value: 'rate_limited' });
  await assert.rejects(f.run(), { message: 'refresh_family_rate_limited' });
});
