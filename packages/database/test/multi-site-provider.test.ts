import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from 'pg';
import { CompactSign, exportJWK, generateKeyPair, importJWK, jwtVerify } from 'jose';
import { createAccountAuth, ACCOUNT_AUTH_DELIVERY_ID_HEADER, type AccountAuth } from '../../account-auth/src/index.js';
import { GrantService } from '@wepuu/pairing';
import { localPkcs8KeyCustodyFromEnvironment } from '@wepuu/key-custody';
import { startAuthorizationService, consentGrantUpdatePlan, type RunningAuthorizationService } from '../../../apps/authorization-service/src/server.js';
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

test('real Authorization HTTP reproduces same-client cross-resource Session Grant mismatch', {
  skip: databaseUrl === undefined, timeout: 120_000
}, async (t) => {
  assert.ok(databaseUrl);
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-multisite-'));
  const migrations = join(directory, 'migrations');
  const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await cp(source, migrations, { recursive: true, filter: (path) =>
    path === source || /^0(?:0[1-9]|1[0-3])_/u.test(path.slice(path.lastIndexOf('/') + 1).split('\\').at(-1) ?? '') });
  assert.equal((await readdir(migrations)).length, 13);
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const name = `wepuu_multisite_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const target = new URL(databaseUrl);
  target.pathname = `/${name}`;
  const database = new Database({ connectionString: target.href, applicationName: 'wepuu-multisite-test', migrationsDirectory: migrations });
  let running: RunningAuthorizationService | undefined;
  let accountAuth: AccountAuth | undefined;
  t.after(async () => {
    await running?.close();
    await accountAuth?.close();
    await database.close();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });
  await database.migrate();
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
    cookieKeys: [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')] }, environment);
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
  async function interaction(index: number): Promise<{ path: string; verifier: string; state: string }> {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: 'http://127.0.0.1:49152/callback',
      resource: resources[index] ?? '', scope: 'mcp:read', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), state });
    let response = await browser.request(`/auth?${params}`);
    for (let hop = 0; hop < 12; hop += 1) {
      const location = response.headers.get('location');
      if (location?.startsWith('/v1/consent/start#') === true) {
        await consentSite(index);
        const row = await pool.query<{ artifact_id: string }>(`SELECT artifact_id FROM oauth.provider_artifacts
          WHERE model='Interaction' AND payload->'params'->>'state'=$1`, [state]);
        assert.equal(row.rowCount, 1, 'one_interaction');
        return { path: `/interaction/${row.rows[0]?.artifact_id ?? ''}`, verifier, state };
      }
      assert.ok(location !== null, 'authorization_redirect_expected');
      response = await browser.request(location);
    }
    throw new Error('test_redirect_limit');
  }
  async function approve(path: string): Promise<Response> {
    const page = await browser.request(path);
    assert.equal(page.status, 200, 'consent_page');
    const csrf = /name="csrf" value="([^"]+)"/u.exec(await page.text())?.[1];
    assert.ok(csrf !== undefined, 'consent_csrf');
    return browser.request(path, new URLSearchParams({ csrf, decision: 'approve' }));
  }
  const first = await interaction(0);
  let response = await approve(first.path);
  for (let hop = 0; hop < 8; hop += 1) {
    const location = response.headers.get('location');
    assert.ok(location !== null, 'first_consent_redirect');
    const callback = new URL(location, issuer);
    if (callback.origin === 'http://127.0.0.1:49152') {
      assert.equal(callback.searchParams.get('iss') === issuer, true, 'callback_issuer');
      assert.equal(callback.searchParams.get('state') === first.state, true, 'callback_state');
      const exchange = await browser.request('/token', new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code',
        redirect_uri: 'http://127.0.0.1:49152/callback', resource: resources[0],
        code: callback.searchParams.get('code') ?? '', code_verifier: first.verifier }));
      const body = await exchange.json() as { access_token: string; error?: string };
      const category = ['invalid_grant', 'invalid_target', 'access_denied', 'invalid_request'].includes(body.error ?? '')
        ? body.error : 'unknown';
      assert.equal(exchange.status, 200, `first_exchange_${category}`);
      const verified = await jwtVerify(body.access_token, await importJWK(key.publicJwk, 'RS256'), {
        issuer, audience: resources[0], algorithms: ['RS256'] });
      assert.equal(verified.payload['grant_id'] === grants[0], true, 'first_grant_binding');
      assert.equal(verified.payload['site_id'] === sites[0], true, 'first_site_binding');
      break;
    }
    response = await browser.request(location);
  }
  const second = await interaction(1);
  const row = await pool.query<{ payload: { grantId?: string } }>(
    `SELECT payload FROM oauth.provider_artifacts WHERE model='Interaction' AND artifact_id=$1`, [second.path.split('/').at(-1)]);
  assert.equal(row.rows[0]?.payload.grantId === grants[0], true, 'provider_selected_previous_site_grant');
  assert.throws(() => consentGrantUpdatePlan({ providerGrantId: row.rows[0]?.payload.grantId,
    platformGrantId: grants[1], resource: resources[1], scopes: ['mcp:read'], promptDetails: {} }), /grant_binding_mismatch/u);
  const failed = await approve(second.path);
  assert.equal(failed.status, 503, 'second_consent_fails_before_resume');
  assert.equal((await failed.json() as { error: string }).error, 'temporarily_unavailable');
  const states = await pool.query<{ status: string }>('SELECT status FROM platform.grants ORDER BY id');
  assert.equal(states.rows.length === 2 && states.rows.every((r) => r.status === 'active'), true, 'business_grants_remain_active');
  const artifacts = await pool.query<{ artifact_id: string }>("SELECT artifact_id FROM oauth.provider_artifacts WHERE model='Grant'");
  assert.equal(artifacts.rows.length === 1 && artifacts.rows[0]?.artifact_id === grants[0], true, 'only_first_provider_grant_saved');
});
