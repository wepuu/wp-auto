import { spawn } from 'node:child_process';
import process from 'node:process';
import { Database, DataLifecycleService } from '../packages/database/dist/index.js';

const databaseUrl = process.env['WEPUU_TEST_DATABASE_URL'];
if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) throw new Error('WEPUU_TEST_DATABASE_URL is required');

const tenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accountId = 'account_BACKUP01';
const siteId = 'site_BACKUP01';
const grantId = 'grant_BACKUP01';
const resource = 'https://backup.example.test/wp-json/wp-auto/mcp';
const restoreDatabase = 'wepuu_restore_206';

async function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`command_failed:${command}:${stderr.trim()}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(input ?? '');
  });
}

const container = process.env['WEPUU_POSTGRES_CONTAINER']
  ?? await run('docker', ['compose', '-f', 'compose.test.yaml', 'ps', '-q', 'postgres']);
if (!container) throw new Error('WEPUU_POSTGRES_CONTAINER is required when compose cannot identify postgres');

async function execInPostgres(args, input) {
  return run('docker', ['exec', '-i', container, ...args], input);
}

async function sql(database, statement) {
  return execInPostgres(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-At', '-c', statement]);
}

async function restoreDump(dumpPath) {
  await execInPostgres(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`]);
  await execInPostgres(['createdb', '-U', 'postgres', restoreDatabase]);
  await execInPostgres(['pg_restore', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', restoreDatabase, dumpPath]);
}

const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-backup-restore-test' });
const admin = database.poolForMigrationsAndTests;
const dumpPath = '/tmp/wepuu-phase-2-0-6-pre.dump';
const postDumpPath = '/tmp/wepuu-phase-2-0-6-post.dump';
const tombstoneSql = `DELETE FROM oauth.secret_artifacts WHERE tenant_id = '${tenantId}';
DELETE FROM oauth.provider_artifacts WHERE tenant_id = '${tenantId}';
DELETE FROM oauth.refresh_families WHERE tenant_id = '${tenantId}';
DELETE FROM oauth.revocation_outbox WHERE tenant_id = '${tenantId}';
DELETE FROM platform.pairing_attempts WHERE tenant_id = '${tenantId}';
DELETE FROM platform.idempotency_records WHERE tenant_id = '${tenantId}';
DELETE FROM platform.grants WHERE tenant_id = '${tenantId}';
DELETE FROM platform.sites WHERE tenant_id = '${tenantId}';
DELETE FROM audit.security_events WHERE tenant_id = '${tenantId}';
DELETE FROM platform.tenant_memberships WHERE tenant_id = '${tenantId}';
DELETE FROM platform.tenants WHERE id = '${tenantId}';`;

try {
  await database.migrate();
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $2)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`, [accountId, 'b'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`, [tenantId]
  );
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET status = 'active', role = 'owner'`, [tenantId, accountId]
  );
  await admin.query(
    `INSERT INTO platform.sites
      (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
     VALUES ($1, $2, $3, 'backup.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumb_backup_000000000000000000000000000000000000000000000000000000000000')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`, [tenantId, siteId, resource]
  );
  await admin.query(
    `INSERT INTO platform.grants
      (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
       consent_expires_at, status, consent_version)
     VALUES ($1, $2, $3, $4, 'client_BACKUP01', ARRAY['mcp:read'], decode(repeat('22', 32), 'hex'),
       now() + interval '5 minutes', 'active', '1')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`, [tenantId, grantId, siteId, accountId]
  );

  await execInPostgres(['pg_dump', '-Fc', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', 'wepuu_test', '-f', dumpPath]);
  const lifecycle = new DataLifecycleService({ database });
  const job = await lifecycle.begin({ kind: 'tenant', tenantId }, accountId);
  const waiting = await lifecycle.advance(job.jobId, new Date('2026-09-29T00:00:00.000Z'));
  if (waiting.status !== 'waiting') throw new Error('deletion_did_not_enter_safety_window');
  const complete = await lifecycle.advance(job.jobId, new Date('2026-09-29T00:07:00.000Z'));
  if (complete.status !== 'complete') throw new Error('deletion_did_not_complete');
  await execInPostgres(['pg_dump', '-Fc', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', 'wepuu_test', '-f', postDumpPath]);

  await restoreDump(dumpPath);
  const beforeReplay = await sql(restoreDatabase, `SELECT count(*) FROM platform.tenants WHERE id = '${tenantId}'`);
  if (beforeReplay !== '1') throw new Error('pre_deletion_backup_restore_failed');
  await execInPostgres(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', restoreDatabase], tombstoneSql);
  const afterReplay = await sql(restoreDatabase, `SELECT count(*) FROM platform.tenants WHERE id = '${tenantId}'`);
  if (afterReplay !== '0') throw new Error('tombstone_replay_failed');

  await restoreDump(postDumpPath);
  const afterPostRestore = await sql(restoreDatabase, `SELECT count(*) FROM platform.tenants WHERE id = '${tenantId}'`);
  if (afterPostRestore !== '0') throw new Error('post_deletion_backup_contains_deleted_tenant');
  process.stdout.write('BACKUP_RESTORE_PASS=True\n');
  process.stdout.write('DELETION_TOMBSTONE_REPLAY_PASS=True\n');
} finally {
  await execInPostgres(['psql', '-U', 'postgres', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`]).catch(() => undefined);
  await execInPostgres(['rm', '-f', dumpPath, postDumpPath]).catch(() => undefined);
  await admin.query('DELETE FROM platform.deletion_tombstones WHERE job_id IN (SELECT id FROM platform.deletion_jobs WHERE scope_id = $1)', [tenantId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.deletion_jobs WHERE scope_id = $1', [tenantId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.grants WHERE id = $1', [grantId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.sites WHERE tenant_id = $1 AND id = $2', [tenantId, siteId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.tenant_memberships WHERE tenant_id = $1', [tenantId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.accounts WHERE id = $1', [accountId]).catch(() => undefined);
  await admin.query('DELETE FROM platform.tenants WHERE id = $1', [tenantId]).catch(() => undefined);
  await database.close();
}
