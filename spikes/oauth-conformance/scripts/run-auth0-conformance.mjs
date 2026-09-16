import { Auth0Adapter } from '../src/auth0-adapter.mjs';
import { assertTraceIsContentFree, makeConformanceCase } from '../src/adapter.mjs';

const required = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'CONFORMANCE_RESOURCE'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const adapter = new Auth0Adapter();
const cases = [];
const evidence = (entry) => {
  assertTraceIsContentFree(entry);
  return entry;
};
const add = (input) => cases.push(makeConformanceCase({ ...input, evidence: (input.evidence ?? []).map(evidence) }));

const metadata = await adapter.start();
try {
  if (process.env.AUTH0_CLEANUP_CLIENT_IDS) {
    if (!process.env.AUTH0_MGMT_TOKEN) throw new Error('AUTH0_MGMT_TOKEN is required for AUTH0_CLEANUP_CLIENT_IDS');
    for (const clientId of process.env.AUTH0_CLEANUP_CLIENT_IDS.split(',').map((value) => value.trim()).filter(Boolean)) {
      await adapter.deleteClient(clientId);
    }
    add({ id: 'P10', candidate: 'auth0@managed-tenant', expected: 'temporary clients removable', actual: { deleted: true }, status: 'pass', evidence: [{ method: 'DELETE', path: '/api/v2/clients/{opaque}', status: 204 }] });
  }
  const metadataChecks = {
    issuer: metadata.issuer === adapter.issuer,
    jwks: typeof metadata.jwks_uri === 'string',
    authorization: typeof metadata.authorization_endpoint === 'string',
    token: typeof metadata.token_endpoint === 'string',
    registration: typeof metadata.registration_endpoint === 'string',
    revocation: typeof metadata.revocation_endpoint === 'string',
    issuerResponse: metadata.authorization_response_iss_parameter_supported === true,
    pkceS256: metadata.code_challenge_methods_supported?.includes('S256') === true
  };
  add({ id: 'P03', candidate: 'auth0@managed-tenant', expected: 'coherent AS metadata and RFC 9207 issuer response', actual: metadataChecks, status: Object.values(metadataChecks).every(Boolean) ? 'pass' : 'fail', evidence: [{ method: 'GET', path: '/.well-known/openid-configuration', status: 200, selectedHeaders: ['issuer', 'jwks_uri', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'revocation_endpoint'] }] });

  const authorize = async (params) => {
    const url = new URL(metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({
      client_id: process.env.AUTH0_CLIENT_ID,
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1/callback',
      scope: 'openid offline_access mcp:read',
      code_challenge: 'A'.repeat(43),
      state: 'stable-state',
      prompt: 'login',
      ...params
    })) url.searchParams.set(key, value);
    const response = await fetch(url, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    return { response, location, path: location.split('?')[0], queryKeys: [...new URLSearchParams(location.split('?')[1] ?? '').keys()].sort() };
  };

  const exact = await authorize({ resource: process.env.CONFORMANCE_RESOURCE, code_challenge_method: 'S256' });
  add({ id: 'P06', candidate: 'auth0@managed-tenant', expected: 'exact resource accepted', actual: { status: exact.response.status, redirectPath: exact.path }, status: exact.response.status === 302 && exact.path === '/u/login' ? 'pass' : 'fail', evidence: [{ method: 'GET', path: '/authorize', status: exact.response.status, redirectPath: exact.path }] });

  const mismatch = await authorize({ resource: 'https://site-b.example.test/wp-json/wp-auto/mcp', code_challenge_method: 'S256' });
  add({ id: 'N03', candidate: 'auth0@managed-tenant', expected: 'mismatched resource rejected before login', actual: { status: mismatch.response.status, redirectPath: mismatch.path, queryKeys: mismatch.queryKeys }, status: mismatch.response.status === 302 && mismatch.path === 'http://127.0.0.1/callback' && mismatch.queryKeys.includes('error') ? 'pass' : 'fail', evidence: [{ method: 'GET', path: '/authorize', status: mismatch.response.status, redirectPath: mismatch.path, queryKeys: mismatch.queryKeys }] });

  const plain = await authorize({ resource: process.env.CONFORMANCE_RESOURCE, code_challenge_method: 'plain' });
  add({ id: 'N04', candidate: 'auth0@managed-tenant', expected: 'plain PKCE rejected', actual: { status: plain.response.status, redirectPath: plain.path, advertisedMethods: metadata.code_challenge_methods_supported }, status: plain.path === '/u/login' ? 'fail' : 'pass', evidence: [{ method: 'GET', path: '/authorize', status: plain.response.status, redirectPath: plain.path, advertisedPkceMethods: metadata.code_challenge_methods_supported }] });

  const redirectMutation = await authorize({ resource: process.env.CONFORMANCE_RESOURCE, redirect_uri: 'http://127.0.0.1/other', code_challenge_method: 'S256' });
  add({ id: 'N05', candidate: 'auth0@managed-tenant', expected: 'redirect URI mutation rejected', actual: { status: redirectMutation.response.status, redirectPath: redirectMutation.path, queryKeys: redirectMutation.queryKeys }, status: redirectMutation.queryKeys.includes('error') || [400, 401, 403].includes(redirectMutation.response.status) ? 'pass' : 'fail', evidence: [{ method: 'GET', path: '/authorize', status: redirectMutation.response.status, redirectPath: redirectMutation.path, queryKeys: redirectMutation.queryKeys }] });

  // DCR creates tenant state. Require an explicit management token so a run
  // cannot leave an orphan client behind; the probe is otherwise skipped.
  if (process.env.AUTH0_DCR_PROBE === '1') {
    if (!process.env.AUTH0_MGMT_TOKEN) throw new Error('AUTH0_MGMT_TOKEN is required when AUTH0_DCR_PROBE=1');
    const dcr = await adapter.registerClient({ client_name: 'wepuu-conformance-dcr-probe', redirect_uris: ['http://127.0.0.1/callback'], response_types: ['code'], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' });
    add({ id: 'P04', candidate: 'auth0@managed-tenant', expected: 'public DCR client', actual: { status: dcr.status, tokenEndpointAuthMethod: dcr.body?.token_endpoint_auth_method, responseKeys: Object.keys(dcr.body ?? {}).filter((key) => key !== 'client_secret').sort() }, status: dcr.status === 201 && dcr.body?.token_endpoint_auth_method === 'none' ? 'pass' : 'fail', evidence: [{ method: 'POST', path: '/oidc/register', status: dcr.status, responseKeys: Object.keys(dcr.body ?? {}).filter((key) => key !== 'client_secret').sort() }] });
  }
} finally {
  if (process.env.AUTH0_DCR_PROBE === '1') await adapter.cleanup();
  else await adapter.stop();
}

console.log(JSON.stringify({ candidate: 'auth0@managed-tenant', cases }, null, 2));
