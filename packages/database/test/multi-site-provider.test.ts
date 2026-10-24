import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from 'pg';
import { recordFixtureLedger } from './r17-migration-evidence.mjs';
import { CompactSign, exportJWK, generateKeyPair, importJWK, jwtVerify } from 'jose';
import { createAccountAuth, ACCOUNT_AUTH_DELIVERY_ID_HEADER, type AccountAuth } from '../../account-auth/src/index.js';
import { GrantService } from '@wepuu/pairing';
import { localPkcs8KeyCustodyFromEnvironment } from '@wepuu/key-custody';
import { startAuthorizationService, type RunningAuthorizationService } from '../../../apps/authorization-service/src/server.js';
import { Database, PostgresAccountAuthLinkStore, PostgresGrantRepository,
  PostgresOAuthClientRepository, PostgresSigningKeyRepository } from '../src/index.js';

const databaseUrl = process.env['WEPUU_TEST_DATABASE_URL'];
const issuer = 'https://auth.multisite.example.test';
const clientId = 'wepuu-e2e-lifecycle';
const resources = ['https://a.multisite.example.test/wp-json/wp-auto/mcp',
  'https://b.multisite.example.test/wp-json/wp-auto/mcp'] as const;
const sites = ['site_MULTISITE_A', 'site_MULTISITE_B'] as const;
const grants = ['grant_MULTISITE_A', 'grant_MULTISITE_B'] as const;

// Logical HTTPS browser jar over a trusted local proxy. Cookie values stay in
// memory, with independent path scoping and multiple Set-Cookie handling.
class Browser {
  readonly cookies = new Map<string, { name: string; value: string; path: string }>();
  constructor(readonly base: string) {}
  accept(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const parts = raw.split(';');
      const pair = parts[0] ?? '';
      const pos = pair.indexOf('=');
      const name = pair.slice(0, pos);
      const value = pair.slice(pos + 1);
      const path = parts.find((p) => p.trim().toLowerCase().startsWith('path='))?.trim().slice(5) ?? '/';
      const key = `${name}:${path}`;
      if (value === '' || parts.some((p) => p.trim().toLowerCase() === 'max-age=0')) this.cookies.delete(key);
      else this.cookies.set(key, { name, value, path });
    }
  }
  async request(path: string, form?: URLSearchParams): Promise<Response> {
    const url = new URL(path, issuer);
    assert.equal(url.origin === issuer, true, 'local_request_origin');
    const cookie = [...this.cookies.values()].filter((entry) =>
      url.pathname === entry.path || url.pathname.startsWith(entry.path.endsWith('/') ? entry.path : `${entry.path}/`))
      .map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const response = await fetch(`${this.base}${url.pathname}${url.search}`, {
      method: form === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: { host: new URL(issuer).host, 'x-forwarded-host': new URL(issuer).host,
        'x-forwarded-proto': 'https', cookie,
        ...(form === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded',
          ...(url.pathname.startsWith('/interaction/') ? { origin: issuer } : {}) }) },
      ...(form === undefined ? {} : { body: form }), signal: AbortSignal.timeout(10_000)
    });
    this.accept(response);
    return response;
  }
}

async function freePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address !== null && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('real Authorization HTTP binds same-client sequential and interleaved resources to separate Grants', {
  skip: databaseUrl === undefined, timeout: 120_000
}, async (t) => {
  assert.ok(databaseUrl);
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-multisite-'));
  const migrations = join(directory, 'migrations');
  const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await cp(source, migrations, { recursive: true, filter: (path) =>
    path === source || /^(?:00[1-9]|01[0-3]|015|016|017)_/u.test(path.slice(path.lastIndexOf('/') + 1).split('\\').at(-1) ?? '') });
  assert.equal((await readdir(migrations)).length, 16);
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const name = `wepuu_multisite_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const target = new URL(databaseUrl);
  target.pathname = `/${name}`;
  const database = new Database({ connectionString: target.href, applicationName: 'wepuu-multisite-test', migrationsDirectory: migrations });
  let running: RunningAuthorizationService | undefined = undefined;
  let accountAuth: AccountAuth | undefined = undefined;
  t.after(async () => {
    await running?.close();
    await accountAuth?.close();
    await recordFixtureLedger(database.poolForMigrationsAndTests, 'after', 'candidate');
    await database.close();
    // pg Pool.end can finish before PostgreSQL observes every socket close.
    // Never terminate live clients to conceal a test/teardown failure.
    let closed = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const connections = await admin.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=$1', [name]);
      if (connections.rows[0]?.count === '0') { closed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(closed, true, 'test_cleanup_connections_closed');
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });
  await database.migrate();
  await recordFixtureLedger(database.poolForMigrationsAndTests, 'before', 'candidate');
  const pool = database.poolForMigrationsAndTests;
  const rsa = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const passphrase = randomBytes(32).toString('base64url');
  const privateKeyFile = join(directory, 'key.pem');
  const passphraseFile = join(directory, 'passphrase');
  const keyring = join(directory, 'keyring.json');
  const authSecretsFile = join(directory, 'account-auth-keyring.json');
  await writeFile(privateKeyFile, rsa.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }), { mode: 0o600 });
  await writeFile(passphraseFile, passphrase, { mode: 0o600 });
  await writeFile(keyring, JSON.stringify({ keys: [{ slot: 'multisite', privateKeyFile, passphraseFile }] }), { mode: 0o600 });
  const secrets = [{ version: 1, value: randomBytes(48).toString('base64url') }];
  await writeFile(authSecretsFile, JSON.stringify({ secrets }), { mode: 0o600 });
  const environment = {
    WEPUU_DATABASE_URL: target.href, WEPUU_CONTROL_PUBLIC_ORIGIN: issuer,
    WEPUU_SIGNING_KEYRING_FILE: keyring, WEPUU_ACCOUNT_AUTH_SECRETS_FILE: authSecretsFile,
    WEPUU_OAUTH_ARTIFACT_KEYS_JSON: JSON.stringify([randomBytes(32).toString('base64url')]),
    WEPUU_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString('base64url')
  };
  const custody = await localPkcs8KeyCustodyFromEnvironment(environment, 'multisite');
  const key = await custody.describeSigningKey();
  const signing = new PostgresSigningKeyRepository(database);
  await signing.publish({ kid: key.kid, custodyReference: 'multisite', publicJwk: key.publicJwk,
    publishedAt: new Date(Date.now() - 21 * 60_000) });
  assert.equal(await signing.activate(key.kid), true);
  await new PostgresOAuthClientRepository(database).provisionP3aLifecycleTestClient();

  let otp = '';
  const auth = createAccountAuth({ databaseUrl: target.href, applicationName: 'wepuu-multisite-auth', publicOrigin: issuer,
    secrets, emailSender: { async send(message) { otp = message.otp; return 'accepted'; } } });
  accountAuth = auth;
  const headers = { origin: issuer, 'content-type': 'application/json', [ACCOUNT_AUTH_DELIVERY_ID_HEADER]: 'delivery_MULTISITE_0001' };
  const send = await auth.handle(new Request(`${issuer}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST', headers, body: JSON.stringify({ email: 'multisite@example.test', type: 'sign-in' })
  }));
  assert.equal(send.status, 200, 'mock_otp_send');
  assert.equal(otp.length, 6, 'mock_otp_delivered');
  const login = await auth.handle(new Request(`${issuer}/api/auth/sign-in/email-otp`, {
    method: 'POST', headers, body: JSON.stringify({ email: 'multisite@example.test', otp })
  }));
  assert.equal(login.status, 200, 'mock_otp_login');
  const sessionCookie = login.headers.getSetCookie().find((c) => c.startsWith('__Host-wepuu_session='));
  assert.ok(sessionCookie !== undefined, 'session_cookie_created');
  const session = await auth.getSession(new Headers({ cookie: sessionCookie.split(';')[0] ?? '' }));
  assert.ok(session !== undefined);
  const link = await new PostgresAccountAuthLinkStore(database).provision(session.userId);
  const tenantId = link.homeTenantId;
  const accountId = link.accountId;
  const siteKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const siteJwk = { ...await exportJWK(siteKeys.publicKey), kid: 'key_MULTISITE_01', alg: 'EdDSA', use: 'sig' };
  for (let i = 0; i < 2; i += 1) {
    await pool.query(`INSERT INTO platform.sites (tenant_id,id,resource_uri,display_hostname,status,protocol_version,site_public_jwk,site_key_thumbprint)
      VALUES ($1,$2,$3,$4,'active','1',$5::jsonb,$6)`,
    [tenantId, sites[i], resources[i], new URL(resources[i] ?? '').hostname, JSON.stringify(siteJwk), 't'.repeat(64)]);
  }
  const port = await freePort();
  const service = await startAuthorizationService({ issuer, databaseUrl: target.href, host: '127.0.0.1', port,
    cookieKeys: [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')],
    persistent: { mode: 'guard-only', clientId, resource: resources[0] } }, environment);
  running = service;
  const browser = new Browser(`http://127.0.0.1:${port}`);
  browser.accept(login);
  const business = new GrantService({ repository: new PostgresGrantRepository(database, {
    tenantId, accountId, correlationId: 'correlation_MULTISITE' }), signer: custody.consentRequestSigner(), platformIssuer: issuer });
  async function consentSite(index: number): Promise<void> {
    const resource = resources[index];
    const siteId = sites[index];
    const grantId = grants[index];
    assert.ok(resource && siteId && grantId);
    const begun = await business.begin({ tenantId, subjectId: accountId, siteId, grantId, clientId,
      scopes: ['mcp:read'], resource, consentVersion: '1', idempotencyKey: `idempotency_MULTISITE_BEGIN_${index}` });
    const now = Math.floor(Date.now() / 1_000);
    const proof = await new CompactSign(Buffer.from(JSON.stringify({ kind: 'consent', protocol_version: '1',
      iss: new URL(resource).hostname, platform_issuer: issuer, tenant_id: tenantId, site_id: siteId,
      grant_id: grantId, subject_id: accountId, client_id: clientId, aud: resource, resource,
      scope: ['mcp:read'], decision: 'approved', challenge: begun.challenge, iat: now, exp: now + 60 })))
      .setProtectedHeader({ alg: 'EdDSA', typ: 'wepuu-site-proof+jwt', kid: siteJwk.kid }).sign(siteKeys.privateKey);
    await business.complete({ tenantId, grantId, challenge: begun.challenge, proof, decision: 'approved',
      idempotencyKey: `idempotency_MULTISITE_APPROVE_${index}` });
  }
  async function interaction(index: number, jar = browser, scope = 'mcp:read'): Promise<{ path: string; verifier: string; state: string }> {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: 'http://127.0.0.1:49152/callback',
      resource: resources[index] ?? '', scope, prompt: 'consent', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), state });
    let path = `/auth?${params}`;
    let response = await jar.request(path);
    for (let hop = 0; hop < 12; hop += 1) {
      if (response.status === 200) return { path: new URL(path, issuer).pathname, verifier, state };
      const location = response.headers.get('location');
      if (location?.startsWith('/v1/consent/start#') === true) {
        await consentSite(index);
        const row = await pool.query<{ artifact_id: string }>(`SELECT artifact_id FROM oauth.provider_artifacts
          WHERE model='Interaction' AND payload->'params'->>'state'=$1`, [state]);
        assert.equal(row.rowCount, 1, 'one_interaction');
        return { path: `/interaction/${row.rows[0]?.artifact_id ?? ''}`, verifier, state };
      }
      assert.ok(location !== null, 'authorization_redirect_expected');
      path = location;
      response = await jar.request(location);
    }
    throw new Error('test_redirect_limit');
  }
  async function approve(path: string, jar = browser): Promise<Response> {
    const page = await jar.request(path);
    assert.equal(page.status, 200, 'consent_page');
    const csrf = /name="csrf" value="([^"]+)"/u.exec(await page.text())?.[1];
    assert.ok(csrf !== undefined, 'consent_csrf');
    return jar.request(path, new URLSearchParams({ csrf, decision: 'approve' }));
  }
  async function codeFor(input: Awaited<ReturnType<typeof interaction>>, jar = browser): Promise<string> {
    let response = await approve(input.path, jar);
    for (let hop = 0; hop < 8; hop += 1) {
      const location = response.headers.get('location');
      assert.ok(location !== null, 'consent_redirect');
      const callback = new URL(location, issuer);
      if (callback.origin === 'http://127.0.0.1:49152') {
        assert.equal(callback.searchParams.get('iss') === issuer, true, 'callback_issuer');
        assert.equal(callback.searchParams.get('state') === input.state, true, 'callback_state');
        const code = callback.searchParams.get('code');
        assert.ok(code !== null, 'authorization_code_present');
        return code;
      }
      response = await jar.request(location);
    }
    throw new Error('test_resume_limit');
  }
  async function exchange(input: Awaited<ReturnType<typeof interaction>>, code: string, index: number,
    jar = browser, targetResource = resources[index]): Promise<Response> {
    return jar.request('/token', new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code',
      redirect_uri: 'http://127.0.0.1:49152/callback', resource: targetResource ?? '', code, code_verifier: input.verifier }));
  }
  async function verifyToken(response: Response, index: number): Promise<{ access_token: string; refresh_token?: string }> {
    const body = await response.json() as { access_token: string; refresh_token?: string; error?: string };
    const category = ['invalid_grant', 'invalid_target', 'access_denied', 'invalid_request'].includes(body.error ?? '')
      ? body.error : 'unknown';
    assert.equal(response.status, 200, `exchange_${category}`);
    const verified = await jwtVerify(body.access_token, await importJWK(key.publicJwk, 'RS256'), {
      issuer, audience: resources[index], algorithms: ['RS256'] });
    assert.equal(verified.protectedHeader.typ, 'at+jwt');
    assert.equal(verified.protectedHeader.kid === key.kid, true, 'signing_key');
    assert.equal(verified.payload['grant_id'] === grants[index], true, 'grant_binding');
    assert.equal(verified.payload['site_id'] === sites[index], true, 'site_binding');
    assert.equal(verified.payload['tenant_id'] === tenantId, true, 'tenant_binding');
    assert.equal(verified.payload.sub === accountId, true, 'subject_binding');
    assert.equal(verified.payload['client_id'] === clientId, true, 'client_binding');
    assert.equal(verified.payload['scope'] === 'mcp:read', true, 'scope_binding');
    return body;
  }
  async function issue(index: number, jar = browser, scope = 'mcp:read') {
    const input = await interaction(index, jar, scope);
    return verifyToken(await exchange(input, await codeFor(input, jar), index, jar), index);
  }
  const before = await pool.query('SELECT id,status,updated_at FROM platform.grants ORDER BY id');
  assert.equal(before.rowCount, 0);
  await issue(0);
  const second = await interaction(1);
  const row = await pool.query<{ payload: { grantId?: string } }>(
    `SELECT payload FROM oauth.provider_artifacts WHERE model='Interaction' AND artifact_id=$1`, [second.path.split('/').at(-1)]);
  assert.equal(row.rows[0]?.payload.grantId === undefined, true, 'new_site_does_not_load_other_site_grant');
  await verifyToken(await exchange(second, await codeFor(second), 1), 1);
  const activeBaseline = await pool.query('SELECT id,status,updated_at,revocation_reason FROM platform.grants ORDER BY id');
  await issue(0); // A -> B -> A, both active business/Provider grants
  await issue(1); // same Site repeated Consent
  const separate = new Browser(browser.base);
  separate.accept(login);
  await issue(1, separate); // same Better Auth account, independent Provider Session
  await issue(0, separate);
  const pendingA = await interaction(0);
  const pendingB = await interaction(1);
  await verifyToken(await exchange(pendingB, await codeFor(pendingB), 1), 1);
  await verifyToken(await exchange(pendingA, await codeFor(pendingA), 0), 0);
  // Preserve Provider's session-bound Code rule: an already issued A Code
  // cannot survive a later B Session Grant selection by becoming a B Token.
  const delayedA = await interaction(0);
  const delayedCode = await codeFor(delayedA);
  await issue(1);
  const delayed = await exchange(delayedA, delayedCode, 0);
  assert.equal(delayed.status, 400, 'stale_session_bound_code_denied');
  assert.equal((await delayed.json() as { error: string }).error, 'invalid_grant');
  const wrong = await interaction(0);
  const wrongTarget = await exchange(wrong, await codeFor(wrong), 0, browser, resources[1]);
  assert.equal(wrongTarget.status, 400, 'cross_resource_exchange_denied');
  const wrongBody = await wrongTarget.json() as { error?: string; access_token?: string };
  assert.equal(wrongBody.access_token === undefined, true, 'no_cross_resource_token');
  assert.equal(['invalid_target', 'invalid_scope', 'access_denied'].includes(wrongBody.error ?? ''), true);
  assert.equal(JSON.stringify((await pool.query('SELECT id,status,updated_at,revocation_reason FROM platform.grants ORDER BY id')).rows)
    === JSON.stringify(activeBaseline.rows), true, 'reconsent_does_not_update_business_grants');
  const states = await pool.query<{ status: string }>('SELECT status FROM platform.grants ORDER BY id');
  assert.equal(states.rows.length === 2 && states.rows.every((r) => r.status === 'active'), true, 'business_grants_remain_active');
  const artifacts = await pool.query<{ artifact_id: string }>("SELECT artifact_id FROM oauth.provider_artifacts WHERE model='Grant'");
  assert.equal(artifacts.rows.length === 2 && grants.every((id) => artifacts.rows.some((r) => r.artifact_id === id)), true,
    'separate_provider_grants_saved');
  const stored = await pool.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM oauth.provider_artifacts WHERE model='Grant' AND artifact_id=$1", [grants[0]]);
  const originalPayload = stored.rows[0]?.payload;
  assert.ok(originalPayload !== undefined);
  for (const mutation of [
    { accountId: 'account_UNRELATED' }, { clientId: 'client_UNRELATED' },
    { resources: { [resources[1]]: 'mcp:read' } }, { resources: { [resources[0]]: 'mcp:content.write' } }
  ]) {
    // Adversarial corruption of test-owned Provider metadata only. Business
    // Grants were still established through signed GrantService Consent.
    await pool.query("UPDATE oauth.provider_artifacts SET payload=$2::jsonb WHERE model='Grant' AND artifact_id=$1",
      [grants[0], JSON.stringify({ ...originalPayload, ...mutation })]);
    try {
      const params = new URLSearchParams({ client_id: clientId, response_type: 'code',
        redirect_uri: 'http://127.0.0.1:49152/callback', resource: resources[0], scope: 'mcp:read',
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url') });
      const denied = await browser.request(`/auth?${params}`);
      assert.equal(denied.status >= 400, true, 'corrupt_provider_binding_denied');
    } finally {
      await pool.query("UPDATE oauth.provider_artifacts SET payload=$2::jsonb WHERE model='Grant' AND artifact_id=$1",
        [grants[0], JSON.stringify(originalPayload)]);
    }
  }
  const offlineA = await issue(0, browser, 'mcp:read offline_access');
  assert.equal(typeof offlineA.refresh_token === 'string', true, 'test_refresh_created');
  async function refresh(token: string, index: number) {
    return browser.request('/token', new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token',
      refresh_token: token, resource: resources[index] ?? '' }));
  }
  async function invalidGrant(response: Response) {
    assert.equal(response.status, 400, 'invalid_grant_status');
    const body = await response.json() as { error?: string; access_token?: string };
    assert.equal(body.error, 'invalid_grant');
    assert.equal(body.access_token === undefined, true, 'no_token_on_denial');
  }
  const rotatedA = await verifyToken(await refresh(offlineA.refresh_token ?? '', 0), 0);
  assert.equal(typeof rotatedA.refresh_token === 'string' && rotatedA.refresh_token !== offlineA.refresh_token, true, 'refresh_rotation');
  const offlineB = await issue(1, browser, 'mcp:read offline_access');
  assert.equal(typeof offlineB.refresh_token === 'string', true);
  const crossRefreshA = await issue(0, browser, 'mcp:read offline_access');
  const crossRefresh = await refresh(crossRefreshA.refresh_token ?? '', 1);
  assert.equal(crossRefresh.status, 400, 'cross_resource_refresh_denied');
  const crossRefreshBody = await crossRefresh.json() as { error?: string; access_token?: string };
  assert.equal(crossRefreshBody.access_token === undefined, true, 'no_refresh_resource_switch');
  assert.equal(['invalid_target', 'invalid_scope', 'access_denied'].includes(crossRefreshBody.error ?? ''), true);
  // Do not retry that refresh: Provider may consume it before a target denial.
  // Other A lineage must remain usable across B's explicit revocation below.
  const revoked = await browser.request('/token/revocation', new URLSearchParams({ client_id: clientId,
    token: offlineB.refresh_token ?? '', token_type_hint: 'refresh_token' }));
  assert.equal(revoked.status, 200, 'rfc7009_success');
  await invalidGrant(await refresh(offlineB.refresh_token ?? '', 1));
  const unaffectedA = await verifyToken(await refresh(rotatedA.refresh_token ?? '', 0), 0);
  await invalidGrant(await refresh(rotatedA.refresh_token ?? '', 0)); // explicit consumed-token replay
  await invalidGrant(await refresh(unaffectedA.refresh_token ?? '', 0));
  const reasons = await pool.query<{ id: string; status: string; revocation_reason: string }>(
    'SELECT id,status,revocation_reason FROM platform.grants ORDER BY id');
  assert.equal(reasons.rows.find((r) => r.id === grants[0])?.revocation_reason, 'refresh_replay');
  assert.equal(reasons.rows.find((r) => r.id === grants[1])?.revocation_reason, 'token_revoked');
  assert.equal(reasons.rows.every((r) => r.status === 'revoked'), true);
  const events = await pool.query<{ grant_id: string; reason: string }>('SELECT grant_id,reason FROM oauth.revocation_outbox');
  assert.equal(events.rowCount, 2, 'one_event_per_grant');
  assert.equal(events.rows.filter((r) => r.grant_id === grants[0] && r.reason === 'refresh_replay').length, 1);
  assert.equal(events.rows.filter((r) => r.grant_id === grants[1] && r.reason === 'token_revoked').length, 1);
});
