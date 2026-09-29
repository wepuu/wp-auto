import { createPrivateKey, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AwsKmsKeyCustody } from '../packages/key-custody/dist/index.js';

// pnpm intentionally does not hoist jose to the workspace root. Resolve the
// already-locked dependency from the package that owns the JOSE boundary.
const requireFromKeyCustody = createRequire(
  new URL('../packages/key-custody/package.json', import.meta.url)
);
const { SignJWT } = await import(pathToFileURL(requireFromKeyCustody.resolve('jose')).href);

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const region = required('AWS_REGION');
const outputPath = required('WEPUU_BEARER_FIXTURE_PATH');
const keys = [
  { keyId: required('WEPUU_KMS_KEY_ID'), kid: required('WEPUU_KMS_KID') },
  { keyId: required('WEPUU_KMS_SECOND_KEY_ID'), kid: required('WEPUU_KMS_SECOND_KID') }
];
if (keys[0].keyId === keys[1].keyId || keys[0].kid === keys[1].kid) {
  throw new Error('two_distinct_kms_keys_required');
}

const now = Math.floor(Date.now() / 1_000);
const claims = {
  tenant_id: '11111111-2222-4333-8444-555555555555',
  site_id: 'site_00000001',
  grant_id: 'grant_00000001',
  client_id: 'client_00000001',
  scope: 'mcp:read'
};
const tokens = [];
const jwks = [];
let publicPem = '';
for (const keyConfig of keys) {
  const custody = new AwsKmsKeyCustody({ region, ...keyConfig });
  const descriptor = await custody.describeSigningKey();
  jwks.push(descriptor.publicJwk);
  if (publicPem === '') publicPem = descriptor.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const loadStoreKey = createPrivateKey;
  const privateKey = loadStoreKey({ key: new URL(`aws-kms:key-id=${keyConfig.keyId};region=${region}`) });
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: keyConfig.kid })
    .setIssuer('https://platform.example.test')
    .setAudience('https://site.example.test/wp-json/wp-auto/mcp')
    .setSubject('subject_0000001')
    .setJti(randomBytes(24).toString('base64url'))
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  tokens.push(token);
}

await writeFile(outputPath, JSON.stringify({ jwks, publicPem, tokens }), { mode: 0o600 });
process.stdout.write('LIVE_BEARER_FIXTURE_CREATED=True\n');
