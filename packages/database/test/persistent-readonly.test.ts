import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { Client } from 'pg';
import { recordFixtureLedger } from './r17-migration-evidence.mjs';
import { Database, PostgresPersistentReceiptStore, SecretArtifactCodec, RateLimitSubjectCodec,
  createOidcAdapterFactory } from '../src/index.js';

const target = process.env['WEPUU_TEST_DATABASE_URL'];
const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;
const token = () => randomBytes(32).toString('base64url');
async function fixture(t: TestContext) {
  assert(target);
  const url = new URL(target);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  const setup = new Client({ connectionString: target }); await setup.connect();
  const name = `wepuu_persistent_${randomBytes(7).toString('hex')}`;
  await setup.query(`CREATE DATABASE ${name}`); url.pathname = `/${name}`;
  const database = new Database({ connectionString: url.href, applicationName: 'persistent-regression', migrationProfile: 'authorization' });
  const admin = new Client({ connectionString: url.href }); await admin.connect();
  t.after(async () => { await recordFixtureLedger(admin, 'after', 'candidate'); await database.close(); await admin.end(); await setup.query(`DROP DATABASE ${name}`); await setup.end(); });
  await database.migrate(); await database.assertCandidateMigrationIntegrity();
  await recordFixtureLedger(admin, 'before', 'candidate');
  const binding = { subjectId: id('account'), tenantId: '11111111-1111-4111-8111-111111111111',
    siteId: id('site'), grantId: id('grant'), clientId: id('client'),
    resource: 'https://site.example.test/wp-json/wp-auto/mcp', scopes: ['mcp:read'] as const };
  await admin.query("INSERT INTO platform.accounts(id,status,identity_issuer,identity_subject_hash) VALUES($1,'active','https://identity.example.test',$2)", [binding.subjectId, 'f'.repeat(64)]);
  await admin.query("INSERT INTO platform.tenants(id,status) VALUES($1,'active')", [binding.tenantId]);
  await admin.query("INSERT INTO platform.tenant_memberships(tenant_id,account_id,role,status) VALUES($1,$2,'owner','active')", [binding.tenantId, binding.subjectId]);
  await admin.query("INSERT INTO oauth.clients(client_id,registration_mode,redirect_uris,metadata_digest,status) VALUES($1,'pre-registered','[\"http://127.0.0.1:49152/callback\"]','synthetic','active')", [binding.clientId]);
  const jwk = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' });
  await admin.query("INSERT INTO platform.sites(tenant_id,id,resource_uri,display_hostname,status,protocol_version,site_public_jwk,site_key_thumbprint) VALUES($1,$2,$3,'site.example.test','active','1',$4::jsonb,$5)", [binding.tenantId, binding.siteId, binding.resource, JSON.stringify(jwk), 'f'.repeat(64)]);
  await admin.query("INSERT INTO platform.grants(tenant_id,id,site_id,subject_id,client_id,scopes,consent_challenge_hash,consent_expires_at,status,consent_version) VALUES($1,$2,$3,$4,$5,ARRAY['mcp:read'],decode($6,'hex'),now()+interval '2 minutes','active','1')", [binding.tenantId, binding.grantId, binding.siteId, binding.subjectId, binding.clientId, 'f'.repeat(64)]);
  const codec = new SecretArtifactCodec([randomBytes(32)]), store = new PostgresPersistentReceiptStore(database, codec);
  const Adapter = createOidcAdapterFactory(database, codec, new RateLimitSubjectCodec(randomBytes(32)));
  const receipt = () => store.createConsent({ ...binding, id: id('receipt'), interactionUid: id('interaction'), explicitApproval: true });
  async function code() {
    const r = await receipt(), sessionId = id('session'), sessionUid = id('sessionuid'), raw = token(), now = Math.floor(Date.now() / 1000);
    await new Adapter('Session').upsert(sessionId, { kind: 'Session', uid: sessionUid,
      accountId: binding.subjectId, iat: now, exp: now + 600,
      authorizations: { [binding.clientId]: { grantId: binding.grantId } } }, 600);
    const payload = { kind: 'AuthorizationCode', accountId: binding.subjectId, clientId: binding.clientId,
      grantId: binding.grantId, resource: binding.resource, scope: 'mcp:read', sessionUid, iat: now, exp: now + 90 };
    const link = { receiptId: r.id, interactionUid: r.interactionUid, binding, sessionUid };
    await store.saveLinked('AuthorizationCode', raw, payload, 90, store.lookups().current(raw), link, undefined);
    return { r, sessionId, raw, payload, link, keys: store.lookups().candidates(raw) };
  }
  return { database, admin, store, codec, Adapter, binding, receipt, code };
}

test('persistent storage applies the explicit profile and enforces tenant isolation and exact approval', { skip: !target }, async t => {
  const f = await fixture(t), r = await f.receipt();
  const ledger = await f.admin.query<{ name: string }>('SELECT name FROM public.wepuu_schema_migrations ORDER BY name');
  assert.equal(ledger.rowCount, 16); assert(!ledger.rows.some(row => row.name.startsWith('014')));
  const own = await f.database.withTenant({ tenantId: f.binding.tenantId, accountId: f.binding.subjectId, correlationId: id('correlation') }, client => client.query('SELECT id FROM oauth.persistent_consents WHERE id=$1', [r.id]));
  assert.equal(own.rowCount, 1);
  const other = await f.database.withTenant({ tenantId: '22222222-2222-4222-8222-222222222222', accountId: f.binding.subjectId, correlationId: id('correlation') }, client => client.query('SELECT id FROM oauth.persistent_consents'));
  assert.equal(other.rowCount, 0);
  await assert.rejects(() => f.store.createConsent({ ...f.binding, id: id('receipt'), interactionUid: id('interaction'), explicitApproval: false }), /persistent_storage_denied/u);
  await assert.rejects(() => f.store.createConsent({ ...f.binding, subjectId: id('other'), id: id('receipt'), interactionUid: id('interaction'), explicitApproval: true }), /persistent_storage_denied/u);
});

test('authorization is bounded by 90 days and expired receipts remain stored but denied', { skip: !target }, async t => {
  const f = await fixture(t), r = await f.receipt();
  await assert.rejects(() => f.admin.query("UPDATE oauth.persistent_consents SET authorization_expires_at=approved_at+interval '90 days 1 second' WHERE id=$1", [r.id]), { code: '23514' });
  await f.admin.query("WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now) UPDATE oauth.persistent_consents SET approved_at=clock.now-interval '90 days'+interval '30 seconds',issue_expires_at=clock.now-interval '90 days'+interval '60 seconds',authorization_expires_at=clock.now+interval '30 seconds' FROM clock WHERE id=$1", [r.id]);
  const active = await f.admin.query<{ valid: boolean }>('SELECT oauth.persistent_receipt_valid(c,false) AS valid FROM oauth.persistent_consents c WHERE id=$1', [r.id]);
  assert.equal(active.rows[0]?.valid, true);
  await f.admin.query('UPDATE oauth.persistent_consents SET authorization_expires_at=clock_timestamp() WHERE id=$1', [r.id]);
  const expired = await f.admin.query<{ valid: boolean }>('SELECT oauth.persistent_receipt_valid(c,false) AS valid FROM oauth.persistent_consents c WHERE id=$1', [r.id]);
  assert.equal(expired.rows[0]?.valid, false);
  assert.equal((await f.admin.query('SELECT id FROM oauth.persistent_consents WHERE id=$1', [r.id])).rowCount, 1);
});

test('concurrent Code consumption has one winner and duplicate links leave no orphan Code', { skip: !target }, async t => {
  const f = await fixture(t), c = await f.code();
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => f.store.consumeCode(c.raw, c.keys)));
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const duplicate = token();
  await assert.rejects(() => f.store.saveLinked('AuthorizationCode', duplicate, c.payload, 90, f.store.lookups().current(duplicate), c.link, undefined));
  assert.equal(await new f.Adapter('AuthorizationCode').find(duplicate), undefined);
});

test('storage permission failure and lock timeout deny without consuming the Code', { skip: !target }, async t => {
  const f = await fixture(t), c = await f.code();
  await f.admin.query('REVOKE EXECUTE ON FUNCTION oauth.create_persistent_consent(text,text,uuid,text,text,text,text,text,boolean) FROM wepuu_auth');
  try { await assert.rejects(() => f.receipt(), /persistent_storage_denied/u); }
  finally { await f.admin.query('GRANT EXECUTE ON FUNCTION oauth.create_persistent_consent(text,text,uuid,text,text,text,text,text,boolean) TO wepuu_auth'); }
  await f.admin.query('BEGIN');
  try {
    await f.admin.query("SELECT 1 FROM oauth.provider_artifacts WHERE model='Session' AND artifact_id=$1 FOR UPDATE", [c.sessionId]);
    await assert.rejects(() => f.store.consumeCode(c.raw, c.keys), /persistent_storage_denied/u);
  } finally { await f.admin.query('ROLLBACK'); }
  const lookup = f.codec.current(c.raw);
  const state = await f.admin.query<{ consumed: boolean }>("SELECT consumed_at IS NOT NULL AS consumed FROM oauth.secret_artifacts WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=$2", [lookup.version, Buffer.from(lookup.digest)]);
  assert.equal(state.rows[0]?.consumed, false);
});

test('017 custom classification cannot downgrade after link loss or secret payload alteration', { skip: !target }, async t => {
  const f = await fixture(t), c = await f.code();
  assert.deepEqual(await f.store.classification('AuthorizationCode', c.keys), { version: 1, mode: 'PERSISTENT_READONLY' });
  const lookup = f.store.lookups().current(c.raw);
  const original = (await f.admin.query<{ payload: Record<string, unknown> }>("SELECT payload FROM oauth.secret_artifacts WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=$2",
    [f.codec.current(c.raw).version, Buffer.from(f.codec.current(c.raw).digest)])).rows[0]?.payload;
  assert(original);
  await assert.rejects(() => f.admin.query("UPDATE oauth.artifact_classifications SET mode='NATIVE_OFFLINE' WHERE artifact_lookup=$1", [lookup]));
  await f.admin.query("UPDATE oauth.secret_artifacts SET payload=jsonb_set(payload,'{scope}','\"mcp:read offline_access\"'::jsonb) WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=$2",
    [f.codec.current(c.raw).version, Buffer.from(f.codec.current(c.raw).digest)]);
  await assert.rejects(() => f.store.classification('AuthorizationCode', c.keys), /persistent_storage_denied/u);
  await f.admin.query("UPDATE oauth.secret_artifacts SET payload=$1::jsonb WHERE model='AuthorizationCode' AND lookup_version=$2 AND artifact_hash=$3",
    [JSON.stringify(original), f.codec.current(c.raw).version, Buffer.from(f.codec.current(c.raw).digest)]);
  assert.equal((await f.store.classification('AuthorizationCode', c.keys)).mode, 'PERSISTENT_READONLY');
  await f.admin.query("DELETE FROM oauth.persistent_links WHERE model='AuthorizationCode' AND artifact_lookup=$1", [lookup]);
  await assert.rejects(() => f.store.classification('AuthorizationCode', c.keys), /persistent_storage_denied/u);
  await assert.rejects(() => f.store.consumeCode(c.raw, c.keys), /persistent_storage_denied/u);
});

test('017 custom Code consumption fails closed for inactive binding authorities and expired receipt', { skip: !target }, async t => {
  const f = await fixture(t);
  const variants = [
    ["UPDATE platform.accounts SET status='suspended' WHERE id=$1", "UPDATE platform.accounts SET status='active' WHERE id=$1", f.binding.subjectId],
    ["UPDATE platform.tenants SET status='suspended' WHERE id=$1", "UPDATE platform.tenants SET status='active' WHERE id=$1", f.binding.tenantId],
    ["UPDATE platform.tenant_memberships SET status='revoked' WHERE account_id=$1", "UPDATE platform.tenant_memberships SET status='active' WHERE account_id=$1", f.binding.subjectId],
    ["UPDATE platform.sites SET status='suspended' WHERE id=$1", "UPDATE platform.sites SET status='active' WHERE id=$1", f.binding.siteId],
    ["UPDATE platform.grants SET status='revoked' WHERE id=$1", "UPDATE platform.grants SET status='active' WHERE id=$1", f.binding.grantId],
    ["UPDATE oauth.clients SET status='revoked' WHERE client_id=$1", "UPDATE oauth.clients SET status='active' WHERE client_id=$1", f.binding.clientId]
  ] as const;
  for (const [invalidate, restore, key] of variants) {
    const c = await f.code(); await f.admin.query(invalidate, [key]);
    try { await assert.rejects(() => f.store.consumeCode(c.raw, c.keys), /persistent_storage_denied/u); }
    finally { await f.admin.query(restore, [key]); }
    const k = f.codec.current(c.raw);
    assert.equal((await f.admin.query<{ consumed: boolean }>("SELECT consumed_at IS NOT NULL AS consumed FROM oauth.secret_artifacts WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=$2", [k.version, Buffer.from(k.digest)])).rows[0]?.consumed, false);
  }
  const c = await f.code();
  await f.admin.query("UPDATE oauth.persistent_consents SET authorization_expires_at=clock_timestamp() WHERE id=$1", [c.r.id]);
  await assert.rejects(() => f.store.consumeCode(c.raw, c.keys), /persistent_storage_denied/u);
});
