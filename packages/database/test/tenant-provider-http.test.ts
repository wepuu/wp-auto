import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import test from 'node:test';
import { CompactSign, exportJWK, generateKeyPair, importJWK, jwtVerify } from 'jose';
import { createAccountAuth, ACCOUNT_AUTH_CLIENT_IP_HEADER, ACCOUNT_AUTH_DELIVERY_ID_HEADER } from '../../account-auth/src/index.js';
import { GrantService } from '@wepuu/pairing';
import { JoseOAuthConsentBootstrapVerifier, localPkcs8KeyCustodyFromEnvironment } from '@wepuu/key-custody';
import { buildControlApi, BetterAuthAccountIdentityProvider, PostgresControlStore } from '../../../apps/control-api/src/server.js';
import { startAuthorizationService } from '../../../apps/authorization-service/src/server.js';
import { PostgresAccountAuthLinkStore, PostgresAccountWorkspaceStore, PostgresGrantRepository,
  PostgresOAuthClientRepository, PostgresSecurityAuditSink, PostgresSigningKeyRepository, SiteRepository } from '../src/index.js';
import { p3dDatabaseUrl, p3dFixture } from './p3d-fixture.js';

const issuer = 'https://auth.tenant-p3d.example.test';
const clientId = 'wepuu-e2e-lifecycle';
const otherClient = 'wepuu-p3d-secondary';
const callback = 'http://127.0.0.1:49152/callback';
const resources = ['https://a.tenant-p3d.example.test/wp-json/wp-auto/mcp', 'https://b.tenant-p3d.example.test/wp-json/wp-auto/mcp'];
const sites = ['site_P3D_TENANT_A', 'site_P3D_TENANT_B'];
const grants = ['grant_P3D_TENANT_A', 'grant_P3D_TENANT_B'];

class Browser {
  readonly cookies = new Map<string, { value: string; path: string; name: string }>();
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
      else this.cookies.set(key, { value, path, name });
    }
  }
  async request(path: string, form?: URLSearchParams): Promise<Response> {
    const url = new URL(path, issuer);
    assert.equal(url.origin === issuer, true, 'local_request_origin');
    const cookie = [...this.cookies.values()].filter((entry) => url.pathname === entry.path
      || url.pathname.startsWith(entry.path.endsWith('/') ? entry.path : `${entry.path}/`))
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
  cookie(): string {
    return [...this.cookies.values()].filter((c) => c.name === '__Host-wepuu_session')
      .map((entry) => `${entry.name}=${entry.value}`).join('; ');
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('P3-D real Control/Authorization HTTP and Provider reject cross-account Tenant Consent, Code and Session substitution', {
  skip: p3dDatabaseUrl === undefined, timeout: 120_000
}, async (t) => {
  const { database, databaseUrl, pool, directory, cleanup } = await p3dFixture(t, 'authorization');
  const rsa = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const passphrase = randomBytes(32).toString('base64url');
  const privateKeyFile = join(directory, 'key.pem');
  const passphraseFile = join(directory, 'passphrase');
  const keyring = join(directory, 'keyring.json');
  const authSecretsFile = join(directory, 'account-auth.json');
  await writeFile(privateKeyFile, rsa.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }), { mode: 0o600 });
  await writeFile(passphraseFile, passphrase, { mode: 0o600 });
  await writeFile(keyring, JSON.stringify({ keys: [{ slot: 'p3d', privateKeyFile, passphraseFile }] }), { mode: 0o600 });
  const secrets = [{ version: 1, value: randomBytes(48).toString('base64url') }];
  await writeFile(authSecretsFile, JSON.stringify({ secrets }), { mode: 0o600 });
  const environment = { WEPUU_DATABASE_URL: databaseUrl, WEPUU_CONTROL_PUBLIC_ORIGIN: issuer,
    WEPUU_SIGNING_KEYRING_FILE: keyring, WEPUU_ACCOUNT_AUTH_SECRETS_FILE: authSecretsFile,
    WEPUU_OAUTH_ARTIFACT_KEYS_JSON: JSON.stringify([randomBytes(32).toString('base64url')]),
    WEPUU_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString('base64url') };
  const custody = await localPkcs8KeyCustodyFromEnvironment(environment, 'p3d');
  const key = await custody.describeSigningKey();
  const signing = new PostgresSigningKeyRepository(database);
  await signing.publish({ kid: key.kid, custodyReference: 'p3d', publicJwk: key.publicJwk,
    publishedAt: new Date(Date.now() - 21 * 60_000) });
  assert.equal(await signing.activate(key.kid), true);
  await new PostgresOAuthClientRepository(database).provisionP3aLifecycleTestClient();
  await pool.query(`INSERT INTO oauth.clients (client_id,registration_mode,redirect_uris,metadata_digest,status)
    VALUES ($1,'pre-registered',$2::jsonb,$3,'active')`, [otherClient, JSON.stringify(['http://127.0.0.1/callback']),
    createHash('sha256').update(JSON.stringify({ clientId: otherClient, redirectUris: ['http://127.0.0.1/callback'] })).digest('hex')]);
  let currentOtp = '';
  const auth = createAccountAuth({ databaseUrl, applicationName: 'p3d-tenant-login', publicOrigin: issuer, secrets,
    otpSendProtection: { key: randomBytes(32) },
    emailSender: { async send(message) { currentOtp = message.otp; return 'accepted'; } } });
  cleanup(() => auth.close());
  const links = new PostgresAccountAuthLinkStore(database);
  const accounts: Array<{ accountId: string; homeTenantId: string }> = [];
  const logins: Response[] = [];
  for (let i = 0; i < 2; i++) {
    const email = `account${i}@tenant-p3d.example.test`;
    const headers = { origin: issuer, 'content-type': 'application/json',
      [ACCOUNT_AUTH_DELIVERY_ID_HEADER]: `delivery_P3D_TENANT_${i}`, [ACCOUNT_AUTH_CLIENT_IP_HEADER]: `192.0.2.${i + 10}` };
    assert.equal((await auth.handle(new Request(`${issuer}/api/auth/email-otp/send-verification-otp`, {
      method: 'POST', headers, body: JSON.stringify({ email, type: 'sign-in' }) }))).status, 200, 'mock_login_send');
    const login = await auth.handle(new Request(`${issuer}/api/auth/sign-in/email-otp`, {
      method: 'POST', headers, body: JSON.stringify({ email, otp: currentOtp }) }));
    assert.equal(login.status, 200, 'mock_login_verified');
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith('__Host-wepuu_session='));
    assert.ok(cookie);
    const session = await auth.getSession(new Headers({ cookie: cookie.split(';')[0] ?? '' }));
    assert.ok(session);
    accounts.push(await links.provision(session.userId));
    logins.push(login);
  }
  assert.equal(accounts[0]?.accountId !== accounts[1]?.accountId, true);
  assert.equal(accounts[0]?.homeTenantId !== accounts[1]?.homeTenantId, true);
  const siteKeys = await Promise.all([generateKeyPair('EdDSA', { crv: 'Ed25519' }), generateKeyPair('EdDSA', { crv: 'Ed25519' })]);
  const jwks = await Promise.all(siteKeys.map(async (pair, i) => ({ ...await exportJWK(pair.publicKey), kid: `key_P3D_SITE_${i}`, alg: 'EdDSA', use: 'sig' })));
  for (let i = 0; i < 2; i++) {
    await pool.query(`INSERT INTO platform.sites (tenant_id,id,resource_uri,display_hostname,status,protocol_version,site_public_jwk,site_key_thumbprint)
      VALUES ($1,$2,$3,$4,'active','1',$5::jsonb,$6)`,
    [accounts[i]?.homeTenantId, sites[i], resources[i], new URL(resources[i] ?? '').hostname, JSON.stringify(jwks[i]), 't'.repeat(64)]);
  }
  const port = await freePort();
  const running = await startAuthorizationService({ issuer, databaseUrl, host: '127.0.0.1', port,
    cookieKeys: [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')],
    persistent: { mode: 'guard-only', clientId, resource: resources[0] ?? '' } }, environment);
  cleanup(() => running.close());
  const browsers = logins.map((login) => { const jar = new Browser(`http://127.0.0.1:${port}`); jar.accept(login); return jar; });
  const begun = new Map<string, { challenge: string }>();
  const business = (context: { tenantId: string; accountId: string; correlationId: string }) => new GrantService({
    repository: new PostgresGrantRepository(database, context), signer: custody.consentRequestSigner(), platformIssuer: issuer });
  const control = buildControlApi({ publicOrigin: issuer,
    identityProvider: new BetterAuthAccountIdentityProvider({ auth, links }),
    store: new PostgresControlStore(database), audit: new PostgresSecurityAuditSink(database),
    workspace: new PostgresAccountWorkspaceStore(database), oauthIssuer: issuer,
    oauthConsentBootstrap: new JoseOAuthConsentBootstrapVerifier(key.publicKey, key.kid),
    grants: {
      async start(context, input) {
        const site = await database.withTenant(context, (client) => new SiteRepository().findActive(client, context.tenantId, input.siteId));
        if (site === undefined) throw new Error('test_site_access_denied');
        const grantId = grants[sites.indexOf(input.siteId)];
        assert.ok(grantId);
        const result = await business(context).begin({ tenantId: context.tenantId, subjectId: context.accountId, siteId: site.id,
          grantId, clientId: input.clientId, scopes: input.scopes, resource: site.resource, consentVersion: '1', idempotencyKey: input.idempotencyKey });
        begun.set(grantId, { challenge: result.challenge });
        return { grantId: result.grantId, consentUrl: `${new URL(site.resource).origin}/wp-admin/#request=${result.request}`, expiresAt: result.expiresAt };
      },
      async complete(context, input) { await business(context).complete({ tenantId: context.tenantId, ...input }); }
    }
  });
  cleanup(() => control.close());
  const controlAddress = await control.listen({ host: '127.0.0.1', port: 0 });
  async function controlRequest(index: number, path: string, body?: Record<string, unknown>): Promise<Response> {
    const response = await fetch(`${controlAddress}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: { host: new URL(issuer).host, origin: issuer, cookie: browsers[index]?.cookie() ?? '',
        'content-type': 'application/json', 'idempotency-key': `idempotency_P3D_${randomBytes(16).toString('hex')}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    return response;
  }
  for (let i = 0; i < 2; i++) {
    const own = await controlRequest(i, `/v1/tenants/${accounts[i]?.homeTenantId}`);
    assert.equal(own.status, 200, 'own_tenant_access');
    assert.equal((await controlRequest(i, `/v1/tenants/${accounts[1 - i]?.homeTenantId}`)).status, 404, 'foreign_tenant_denied');
    const ownGrant = await controlRequest(i, `/v1/tenants/${accounts[i]?.homeTenantId}/sites/${sites[i]}/grants`, { client_id: clientId, scopes: ['mcp:read'] });
    assert.equal(ownGrant.status, 201, 'own_grant_begin');
    assert.equal(((await ownGrant.json()) as { grant_id?: string }).grant_id === grants[i], true);
  }
  const completeProof = async (i: number) => {
    const now = Math.floor(Date.now() / 1000);
    const challenge = begun.get(grants[i] ?? '')?.challenge;
    assert.ok(challenge);
    const pair = siteKeys[i];
    assert.ok(pair);
    const proof = await new CompactSign(Buffer.from(JSON.stringify({ kind: 'consent', protocol_version: '1',
      iss: new URL(resources[i] ?? '').hostname, platform_issuer: issuer, tenant_id: accounts[i]?.homeTenantId,
      site_id: sites[i], grant_id: grants[i], subject_id: accounts[i]?.accountId, client_id: clientId,
      aud: resources[i], resource: resources[i], scope: ['mcp:read'], decision: 'approved', challenge, iat: now, exp: now + 60 })))
      .setProtectedHeader({ alg: 'EdDSA', typ: 'wepuu-site-proof+jwt', kid: jwks[i]?.kid }).sign(pair.privateKey);
    return { proof, challenge, decision: 'approved' };
  };
  const proofs = await Promise.all([completeProof(0), completeProof(1)]);
  for (let i = 0; i < 2; i++) {
    const other = 1 - i;
    assert.equal((await controlRequest(i, `/v1/tenants/${accounts[other]?.homeTenantId}/grants/${grants[other]}/complete`, proofs[other])).status, 400, 'foreign_consent_denied');
    for (const chosenClient of [clientId, otherClient]) {
      assert.equal((await controlRequest(i, `/v1/tenants/${accounts[other]?.homeTenantId}/sites/${sites[other]}/grants`,
        { client_id: chosenClient, scopes: ['mcp:read'] })).status, 400, 'foreign_grant_start_denied');
    }
    assert.equal((await controlRequest(i, `/v1/tenants/${accounts[i]?.homeTenantId}/sites/${sites[other]}/grants`,
      { client_id: clientId, scopes: ['mcp:read'] })).status, 400, 'site_substitution_denied');
    assert.equal((await controlRequest(i, `/v1/tenants/${accounts[i]?.homeTenantId}/grants/${grants[i]}/complete`, proofs[i])).status, 204, 'own_signed_consent');
  }

  async function interaction(actor: number, resourceIndex: number, selectedClient = clientId) {
    const jar = browsers[actor]; assert.ok(jar);
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({ client_id: selectedClient, response_type: 'code', redirect_uri: callback,
      resource: resources[resourceIndex] ?? '', scope: 'mcp:read', prompt: 'consent', state,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    let path = `/auth?${params}`;
    for (let i = 0; i < 12; i++) {
      const response = await jar.request(path);
      assert.equal(response.status < 500, true, 'unexpected_server_failure');
      if (response.status === 200) return { path, verifier, state, bootstrap: undefined };
      const location = response.headers.get('location'); assert.ok(location, 'authorization_redirect');
      const target = new URL(location, issuer);
      if (target.pathname === '/v1/consent/start') {
        const bootstrap = new URLSearchParams(target.hash.slice(1)).get('request'); assert.ok(bootstrap);
        return { path, verifier, state, bootstrap };
      }
      assert.equal(target.origin === issuer, true, 'no_unexpected_redirect');
      path = location;
    }
    throw new Error('test_redirect_limit');
  }
  async function code(actor: number) {
    const jar = browsers[actor]; assert.ok(jar);
    const request = await interaction(actor, actor);
    assert.equal(request.bootstrap, undefined, 'own_grant_resolved');
    const page = await jar.request(request.path);
    const csrf = /name="csrf" value="([^"]+)"/u.exec(await page.text())?.[1]; assert.ok(csrf);
    let response = await jar.request(request.path, new URLSearchParams({ csrf, decision: 'approve' }));
    for (let i = 0; i < 8; i++) {
      assert.equal(response.status < 500, true, 'consent_no_server_error');
      const location = response.headers.get('location'); assert.ok(location);
      const target = new URL(location, issuer);
      if (target.origin === new URL(callback).origin) {
        assert.equal(target.searchParams.get('iss') === issuer, true);
        assert.equal(target.searchParams.get('state') === request.state, true);
        const value = target.searchParams.get('code'); assert.ok(value);
        return { ...request, code: value };
      }
      response = await jar.request(location);
    }
    throw new Error('test_resume_limit');
  }
  const exchange = (actor: number, request: { code: string; verifier: string }, resourceIndex = actor, selectedClient = clientId) => {
    const jar = browsers[actor]; assert.ok(jar);
    return jar.request('/token', new URLSearchParams({ grant_type: 'authorization_code', client_id: selectedClient,
      code: request.code, code_verifier: request.verifier, redirect_uri: callback, resource: resources[resourceIndex] ?? '' }));
  };
  async function ownToken(i: number) {
    const response = await exchange(i, await code(i));
    const body = await response.json() as { access_token: string; refresh_token?: string; error?: string };
    const category = ['invalid_grant', 'invalid_request', 'invalid_target', 'invalid_scope', 'access_denied'].includes(body.error ?? '')
      ? body.error : 'unknown';
    assert.equal(response.status, 200, `own_code_exchange_${category}`);
    assert.equal(body.refresh_token, undefined);
    const verified = await jwtVerify(body.access_token, await importJWK(key.publicJwk, 'RS256'), { issuer, audience: resources[i], algorithms: ['RS256'] });
    const p = verified.payload;
    assert.equal(verified.protectedHeader.typ, 'at+jwt');
    assert.equal(verified.protectedHeader.kid === key.kid, true);
    assert.equal(p.sub === accounts[i]?.accountId && p['tenant_id'] === accounts[i]?.homeTenantId
      && p['site_id'] === sites[i] && p['grant_id'] === grants[i] && p['client_id'] === clientId
      && p.aud === resources[i] && p['scope'] === 'mcp:read', true, 'exact_own_token_binding');
  }
  await ownToken(0); await ownToken(1);
  const baseline = JSON.stringify((await pool.query('SELECT tenant_id,id,site_id,subject_id,client_id,status,scopes,updated_at FROM platform.grants ORDER BY id')).rows);
  for (let i = 0; i < 2; i++) {
    for (const selectedClient of [clientId, otherClient]) {
      const cross = await interaction(i, 1 - i, selectedClient);
      assert.ok(cross.bootstrap, 'foreign_resource_requires_unavailable_local_consent');
      const denied = await controlRequest(i, '/v1/oauth/consent/start', { request: cross.bootstrap });
      assert.equal(denied.status, 400, 'foreign_resource_bootstrap_denied');
      assert.equal(((await denied.json()) as { error?: string }).error, 'invalid_request');
    }
    const wrongResource = await exchange(i, await code(i), 1 - i);
    assert.equal(wrongResource.status, 400);
    const denied = await wrongResource.json() as { error?: string; access_token?: string };
    assert.equal(denied.access_token, undefined);
    assert.equal(['invalid_target', 'invalid_scope', 'access_denied', 'invalid_grant'].includes(denied.error ?? ''), true);
    const wrongPkce = await code(i);
    const pkce = await exchange(i, { ...wrongPkce, verifier: randomBytes(32).toString('base64url') });
    assert.equal(pkce.status, 400);
    const pkceBody = await pkce.json() as { error?: string; access_token?: string };
    assert.equal(pkceBody.error, 'invalid_grant'); assert.equal(pkceBody.access_token, undefined);
    const sessionRows = await pool.query<{ artifact_id: string }>("SELECT artifact_id FROM oauth.provider_artifacts WHERE model='Session' AND payload->>'accountId'=$1", [accounts[i]?.accountId]);
    assert.equal(sessionRows.rowCount, 1, 'one_provider_session_per_account');
    await pool.query(`UPDATE oauth.provider_artifacts SET payload=jsonb_set(payload,$2::text[],to_jsonb($3::text))
      WHERE model='Session' AND artifact_id=$1`, [sessionRows.rows[0]?.artifact_id, ['authorizations', clientId, 'grantId'], grants[1 - i]]);
    await ownToken(i); // Resource-bound loader ignores the foreign Session pointer.
    assert.equal(JSON.stringify((await pool.query('SELECT tenant_id,id,site_id,subject_id,client_id,status,scopes,updated_at FROM platform.grants ORDER BY id')).rows) === baseline, true, 'no_cross_tenant_or_duplicate_business_grant');
  }
  const artifacts = await pool.query<{ artifact_id: string; payload: { accountId?: string; clientId?: string } }>("SELECT artifact_id,payload FROM oauth.provider_artifacts WHERE model='Grant'");
  assert.equal(artifacts.rowCount, 2, 'two_exact_provider_grants');
  for (let i = 0; i < 2; i++) {
    const grant = artifacts.rows.find((r) => r.artifact_id === grants[i]);
    assert.equal(grant?.payload.accountId === accounts[i]?.accountId && grant?.payload.clientId === clientId, true);
  }
});
