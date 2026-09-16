import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { importJWK, SignJWT } from 'jose';
import { createTestJwks, listenProvider, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_RESOURCE } from '../src/provider.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const fixturePath = resolve(root, 'php', '.runtime-fixture.json');
const image = process.env.WEPUU_PHP_IMAGE || 'wp-env-phase-1-7-desktop-smoke-38d4c1c9-wordpress:latest';
const phpDir = resolve(root, 'php');
const mount = `${phpDir.replaceAll('\\', '/') }:/work`;

function updateCookies(jar, response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const [pair] = value.split(';', 1);
    const [name, cookieValue] = pair.split('=', 2);
    if (name && cookieValue !== undefined) jar.set(name, cookieValue);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(url, options, jar, stage) {
  const headers = { connection: 'close', ...(options.headers ?? {}) };
  const cookies = cookieHeader(jar);
  if (cookies) headers.cookie = cookies;
  let response;
  try {
    response = await fetch(url, { ...options, headers, redirect: 'manual' });
  } catch (error) {
    throw new Error(`provider_request_failed:${stage}:${error.cause?.code ?? error.message}`);
  }
  updateCookies(jar, response);
  return response;
}

async function issueToken(instance) {
  const jar = new Map();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorization = new URL(`${instance.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: TEST_CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEST_REDIRECT_URI,
    scope: 'openid offline_access mcp:read',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: TEST_RESOURCE,
    state: 'php-interop'
  }).toString();
  let current = authorization.toString();
  let callback;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request(current, {}, jar, `interaction-${attempt}`);
    if (response.status < 300 || response.status >= 400) throw new Error(`provider_interaction_failed:${response.status}`);
    current = new URL(response.headers.get('location'), current).toString();
    if (new URL(current).pathname === '/callback') {
      callback = new URL(current);
      break;
    }
  }
  if (!callback?.searchParams.get('code')) throw new Error('provider_code_missing');
  const tokenResponse = await request(`${instance.issuer}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: TEST_CLIENT_ID,
      redirect_uri: TEST_REDIRECT_URI,
      code: callback.searchParams.get('code'),
      code_verifier: verifier,
      resource: TEST_RESOURCE
    })
  }, jar, 'token');
  if (!tokenResponse.ok) throw new Error(`provider_token_failed:${tokenResponse.status}`);
  return (await tokenResponse.json()).access_token;
}

function publicMaterial(privateJwk) {
  const publicKey = createPublicKey({ key: privateJwk, format: 'jwk' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    publicJwk: { ...publicJwk, kid: privateJwk.kid, alg: 'RS256', use: 'sig' }
  };
}

async function runFixture(fixture, expectedPass, label) {
  await writeFile(fixturePath, JSON.stringify(fixture));
  try {
    const result = await execFileAsync('docker', [
      'run', '--rm', '-v', mount, '-w', '/work', image, 'php', 'verify.php', `/work/${fixturePath.split('\\').pop()}`
    ], { cwd: root, windowsHide: true });
    if (!expectedPass) throw new Error(`php verifier accepted ${label}`);
    process.stdout.write(`${label}: ${result.stdout}`);
  } catch (error) {
    if (expectedPass || error.message.includes('accepted')) throw error;
    process.stdout.write(`${label}: rejected\n`);
  }
}

const oldJwks = createTestJwks('phase-2-0-1-old');
const reportProviderError = (error) => console.error(`provider error: ${error.name}: ${error.message}`);
const first = await listenProvider({ jwks: oldJwks, onError: reportProviderError });
const issuer = first.issuer;
const port = Number(new URL(issuer).port);
let oldToken;
try {
  oldToken = await issueToken(first);
} finally {
  await first.close();
}

const newJwks = createTestJwks('phase-2-0-1-new');
const overlapJwks = { keys: [...newJwks.keys, ...oldJwks.keys] };
const second = await listenProvider({ jwks: overlapJwks, port, issuer, onError: reportProviderError });
let newToken;
try {
  newToken = await issueToken(second);
} finally {
  await second.close();
}

const oldMaterial = publicMaterial(oldJwks.keys[0]);
const newMaterial = publicMaterial(newJwks.keys[0]);
const fixture = (token, material) => ({ token, public_key: material.publicPem, public_jwk: material.publicJwk, issuer, audience: TEST_RESOURCE });

try {
  await runFixture(fixture(oldToken, oldMaterial), true, 'provider token before rotation');
  await runFixture(fixture(newToken, newMaterial), true, 'provider token after rotation');

  const baseClaims = { sub: 'sub_opaque', site_id: 'site_opaque', grant_id: 'grant_opaque', scope: 'mcp:read' };
  const privateKey = await importJWK(newJwks.keys[0], 'RS256');
  const sign = (claims, header = { alg: 'RS256', kid: newJwks.keys[0].kid, typ: 'at+jwt' }) => new SignJWT({ ...baseClaims, ...claims })
    .setProtectedHeader(header).setIssuer(issuer).setAudience(claims.aud ?? TEST_RESOURCE).setIssuedAt().setNotBefore('0s').setExpirationTime(claims.exp ?? '5m').setJti(randomBytes(12).toString('hex')).sign(privateKey);

  await runFixture(fixture(await sign({ aud: [TEST_RESOURCE, 'https://other.example.test'] }), newMaterial), false, 'multiple audience');
  await runFixture(fixture(await sign({ exp: '0s' }), newMaterial), false, 'expired token');
  await runFixture(fixture(await sign({}, { alg: 'RS256', kid: 'unknown-kid', typ: 'at+jwt' }), newMaterial), false, 'unknown kid');
  const hmac = await new SignJWT(baseClaims).setProtectedHeader({ alg: 'HS256', kid: 'symmetric', typ: 'at+jwt' }).setIssuer(issuer).setAudience(TEST_RESOURCE).setIssuedAt().setExpirationTime('5m').setJti('hmac').sign(randomBytes(32));
  await runFixture(fixture(hmac, newMaterial), false, 'unknown algorithm');
} finally {
  await rm(fixturePath, { force: true });
}
