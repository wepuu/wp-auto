import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];

export function validateMetadata(metadata, origin) {
  if (metadata === null || typeof metadata !== 'object') throw new Error('metadata_not_object');
  if (metadata.issuer !== origin) throw new Error('issuer_mismatch');
  const jwksUrl = new URL(metadata.jwks_uri);
  if (jwksUrl.origin !== origin || jwksUrl.protocol !== 'https:') throw new Error('jwks_origin_mismatch');
  for (const name of ['authorization_endpoint', 'token_endpoint']) {
    const endpoint = new URL(metadata[name]);
    if (endpoint.origin !== origin || endpoint.protocol !== 'https:') throw new Error(`${name}_origin_mismatch`);
  }
  return jwksUrl;
}

export function validateJwks(document) {
  if (!Array.isArray(document?.keys) || document.keys.length === 0) throw new Error('jwks_empty');
  for (const key of document.keys) {
    if (key.kty !== 'RSA' || key.alg !== 'RS256' || key.use !== 'sig') throw new Error('jwks_profile_mismatch');
    if (typeof key.kid !== 'string' || key.kid.length === 0) throw new Error('jwks_kid_missing');
    if (typeof key.n !== 'string' || typeof key.e !== 'string') throw new Error('jwks_public_members_missing');
    if (PRIVATE_JWK_MEMBERS.some((member) => Object.hasOwn(key, member))) throw new Error('jwks_private_member');
  }
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('origin_must_be_https_origin');
  }
  return url.origin;
}

async function request(url, expectedStatus = 200) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (response.status !== expectedStatus) throw new Error(`unexpected_status:${new URL(url).pathname}:${response.status}`);
  return response;
}

export async function runPublicProbe(originValue) {
  const origin = normalizeOrigin(originValue);
  const health = await (await request(`${origin}/health/ready`)).json();
  if (health?.status !== 'ready') throw new Error('readiness_not_ready');

  const oidc = await (await request(`${origin}/.well-known/openid-configuration`)).json();
  const oauth = await (await request(`${origin}/.well-known/oauth-authorization-server`)).json();
  const jwksUrl = validateMetadata(oidc, origin);
  validateMetadata(oauth, origin);
  validateJwks(await (await request(jwksUrl)).json());
  await request(`${origin}/internal/metrics`, 404);
  for (const path of ['/terms', '/privacy', '/support', '/status']) await request(`${origin}${path}`);

  process.stdout.write('PUBLIC_READINESS_PASS=True\n');
  process.stdout.write('PUBLIC_METADATA_PASS=True\n');
  process.stdout.write('PUBLIC_JWKS_RS256_ONLY=True\n');
  process.stdout.write('PUBLIC_METRICS_NOT_EXPOSED=True\n');
  process.stdout.write('PUBLIC_POLICY_PAGES_PASS=True\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublicProbe(process.argv[2] ?? process.env.WEPUU_PRODUCTION_ORIGIN ?? 'https://auth.wpauto.cc')
    .catch((error) => {
      process.stderr.write(`PUBLIC_PROBE_FAILED=${error instanceof Error ? error.message : 'unknown'}\n`);
      process.exitCode = 1;
    });
}
