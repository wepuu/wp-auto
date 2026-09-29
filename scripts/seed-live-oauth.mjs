import { createHash, generateKeyPairSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { AwsKmsKeyCustody } from '../packages/key-custody/dist/index.js';

const requireFromDatabase = createRequire(new URL('../packages/database/package.json', import.meta.url));
const { Pool } = requireFromDatabase('pg');

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const databaseUrl = required('WEPUU_DATABASE_URL');
const parsedDatabase = new URL(databaseUrl);
if (!['platform-db', '127.0.0.1', 'localhost'].includes(parsedDatabase.hostname)
  || !/\/wepuu_test$/u.test(parsedDatabase.pathname)) {
  throw new Error('disposable_database_required');
}

const region = required('AWS_REGION');
const keyDefinitions = [
  { keyId: required('WEPUU_KMS_KEY_ID'), kid: required('WEPUU_KMS_KID'), status: 'active' },
  { keyId: required('WEPUU_KMS_SECOND_KEY_ID'), kid: required('WEPUU_KMS_SECOND_KID'), status: 'retiring' }
];
if (keyDefinitions[0].keyId === keyDefinitions[1].keyId || keyDefinitions[0].kid === keyDefinitions[1].kid) {
  throw new Error('two_distinct_kms_keys_required');
}
const descriptors = [];
for (const definition of keyDefinitions) {
  descriptors.push(await new AwsKmsKeyCustody({
    region,
    keyId: definition.keyId,
    kid: definition.kid
  }).describeSigningKey());
}

const tenantId = '11111111-2222-4333-8444-555555555555';
const siteId = 'site_00000001';
const grantId = 'grant_00000001';
const clientId = 'client_00000001';
const resource = 'https://site.example.test/wp-json/wp-auto/mcp';
const { publicKey } = generateKeyPairSync('ed25519');
const siteJwk = publicKey.export({ format: 'jwk' });
const siteThumbprint = createHash('sha256').update(JSON.stringify(siteJwk), 'utf8').digest('base64url');

const database = new Pool({ connectionString: databaseUrl, application_name: 'wepuu-live-oauth-seed', max: 1 });
try {
  const client = await database.connect();
  try {
    const account = await client.query(
      `SELECT id FROM platform.accounts WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1`
    );
    const accountId = account.rows[0]?.id;
    if (typeof accountId !== 'string') throw new Error('authenticated_fixture_account_required');

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')
         ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL, updated_at = now()`,
        [tenantId]
      );
      await client.query(
        `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (tenant_id, account_id)
         DO UPDATE SET role = 'owner', status = 'active', revoked_at = NULL`,
        [tenantId, accountId]
      );
      await client.query(
        `UPDATE platform.sites SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE resource_uri = $1 AND NOT (tenant_id = $2 AND id = $3)
           AND status IN ('pending', 'active', 'suspended')`,
        [resource, tenantId, siteId]
      );
      await client.query(
        `INSERT INTO platform.sites
           (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
         VALUES ($1, $2, $3, 'site.example.test', 'active', '1', $4::jsonb, $5)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           resource_uri = EXCLUDED.resource_uri, display_hostname = EXCLUDED.display_hostname,
           status = 'active', site_public_jwk = EXCLUDED.site_public_jwk,
           site_key_thumbprint = EXCLUDED.site_key_thumbprint, revoked_at = NULL,
           deleted_at = NULL, updated_at = now()`,
        [tenantId, siteId, resource, JSON.stringify(siteJwk), siteThumbprint]
      );
      await client.query(
        `INSERT INTO oauth.clients
           (client_id, registration_mode, redirect_uris, metadata_digest, status)
         VALUES ($1, 'pre-registered', $2::jsonb, $3, 'active')
         ON CONFLICT (client_id) DO UPDATE SET redirect_uris = EXCLUDED.redirect_uris,
           metadata_digest = EXCLUDED.metadata_digest, status = 'active', updated_at = now()`,
        [clientId, JSON.stringify(['http://127.0.0.1/callback']), createHash('sha256').update(clientId).digest('hex')]
      );
      await client.query(
        `DELETE FROM platform.grants WHERE id = $1`,
        [grantId]
      );
      await client.query(
        `DELETE FROM platform.grants
         WHERE tenant_id = $1 AND site_id = $2 AND subject_id = $3
           AND client_id = $4`,
        [tenantId, siteId, accountId, clientId]
      );
      await client.query(
        `INSERT INTO platform.grants
           (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
            consent_expires_at, status, consent_version)
         VALUES ($1, $2, $3, $4, $5, ARRAY['mcp:read'], $6, now() + interval '10 minutes', 'active', '1')
         ON CONFLICT (tenant_id, id) DO UPDATE SET subject_id = EXCLUDED.subject_id,
           client_id = EXCLUDED.client_id, scopes = EXCLUDED.scopes, status = 'active',
           revoked_at = NULL, revocation_reason = NULL, updated_at = now()`,
        [tenantId, grantId, siteId, accountId, clientId, Buffer.alloc(32)]
      );
      await client.query('DELETE FROM oauth.signing_key_metadata');
      for (let index = 0; index < keyDefinitions.length; index += 1) {
        const definition = keyDefinitions[index];
        const descriptor = descriptors[index];
        await client.query(
          `INSERT INTO oauth.signing_key_metadata
             (kid, algorithm, custody_provider, custody_reference, public_jwk, status,
              publish_at, activate_at, retire_at)
           VALUES ($1, 'RS256', 'aws-kms', $2, $3::jsonb, $4,
             now() - interval '30 minutes', now() - interval '20 minutes',
             CASE WHEN $4 = 'retiring' THEN now() + interval '2 hours' ELSE NULL END)`,
          [definition.kid, definition.keyId, JSON.stringify(descriptor.publicJwk), definition.status]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
  process.stdout.write('LIVE_OAUTH_FIXTURE_SEEDED=True\n');
  const publicFixturePath = process.env.WEPUU_BEARER_PUBLIC_FIXTURE_PATH;
  if (publicFixturePath) {
    await writeFile(publicFixturePath, JSON.stringify({
      jwks: descriptors.map((descriptor) => descriptor.publicJwk),
      publicPem: descriptors[0].publicKey.export({ type: 'spki', format: 'pem' }).toString()
    }), { mode: 0o600 });
  }
  process.stdout.write('LIVE_OAUTH_CLIENT_ID=client_00000001\n');
  process.stdout.write('LIVE_OAUTH_RESOURCE=https://site.example.test/wp-json/wp-auto/mcp\n');
} finally {
  await database.end();
}
