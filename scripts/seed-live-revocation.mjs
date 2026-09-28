import { writeFile } from 'node:fs/promises';
// This fixture is launched from the workspace root without relying on a
// globally installed pnpm executable. Import the already-built workspace
// packages by path so Node does not require root-level pnpm package links.
import { Database } from '../packages/database/dist/index.js';
import { AwsKmsKeyCustody } from '../packages/key-custody/dist/index.js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const databaseUrl = required('WEPUU_DATABASE_URL');
const parsedDatabase = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedDatabase.hostname)
  || !/\/(?:wepuu_test|conformance)$/u.test(parsedDatabase.pathname)) {
  throw new Error('disposable_database_required');
}
const tenantId = required('WEPUU_FIXTURE_TENANT_ID');
const siteId = required('WEPUU_FIXTURE_SITE_ID');
const grantId = required('WEPUU_FIXTURE_GRANT_ID');
const resource = required('WEPUU_FIXTURE_RESOURCE');
const keyId = required('WEPUU_KMS_KEY_ID');
const kid = required('WEPUU_KMS_KID');
const region = required('AWS_REGION');
const publicPemPath = required('WEPUU_FIXTURE_PUBLIC_PEM_PATH');

const custody = new AwsKmsKeyCustody({ region, keyId, kid });
const descriptor = await custody.describeSigningKey();
const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-live-revocation-seed' });
try {
  await database.withAuthorizationService(async (client) => {
    await client.query('DELETE FROM oauth.revocation_outbox WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oauth.signing_key_metadata');
    await client.query(
      `INSERT INTO oauth.signing_key_metadata
        (kid, algorithm, custody_provider, custody_reference, public_jwk, status, publish_at, activate_at)
       VALUES ($1, 'RS256', 'aws-kms', $2, $3::jsonb, 'active', now() - interval '30 minutes', now() - interval '30 minutes')`,
      [kid, keyId, JSON.stringify(descriptor.publicJwk)]
    );
    await client.query(
      `INSERT INTO oauth.revocation_outbox
        (tenant_id, site_id, resource_uri, event_sequence, event_type, grant_id, reason)
       VALUES ($1, $2, $3, 1, 'grant', $4, 'platform_user_revoked')`,
      [tenantId, siteId, resource, grantId]
    );
  });
  await writeFile(publicPemPath, descriptor.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
  process.stdout.write('REVOCATION_FIXTURE_SEEDED=True\n');
} finally {
  await database.close();
}
