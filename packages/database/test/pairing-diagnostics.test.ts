import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { recordFixtureLedger } from './r17-migration-evidence.mjs';
import {
  PairingDiagnosticError,
  PairingService,
  canonicalizeResource,
  type SiteVerificationClient
} from '@wepuu/pairing';
import { Database, PostgresPairingRepository } from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];

test('pairing persistence diagnostics fail before HTTPS and migrations 001-013 preserve failed attempts', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const sourceMigrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const migrations = mkdtempSync(join(tmpdir(), 'wepuu-migrations-001-013-'));
  for (const name of readdirSync(sourceMigrations).filter((value) => /^0(?:0[1-9]|1[0-3])_/u.test(value))) {
    cpSync(join(sourceMigrations, name), join(migrations, name));
  }
  t.after(() => rmSync(migrations, { recursive: true, force: true }));

  const databaseName = `wepuu_pairing_${process.pid}_${Date.now()}`.toLowerCase();
  const admin = new Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const targetUrl = new URL(connectionString);
  targetUrl.pathname = `/${databaseName}`;
  const database = new Database({ connectionString: targetUrl.href, applicationName: 'wepuu-pairing-diagnostics', migrationsDirectory: migrations });
  t.after(async () => {
    await recordFixtureLedger(database.poolForMigrationsAndTests, 'after', 'historical13');
    await database.close();
    await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await admin.end();
  });
  await database.migrate();
  await recordFixtureLedger(database.poolForMigrationsAndTests, 'before', 'historical13');
  const migrated = await database.poolForMigrationsAndTests.query<{ name: string }>(
    'SELECT name FROM public.wepuu_schema_migrations ORDER BY name'
  );
  assert.equal(migrated.rows.length, 13);
  assert.equal(migrated.rows.at(-1)?.name, '013_email_otp_login.sql');

  const tenantId = '91111111-1111-4111-8111-111111111111';
  const ownerId = 'account_PAIR_OWNER';
  const memberId = 'account_PAIR_MEMBER';
  await database.poolForMigrationsAndTests.query(
    "INSERT INTO platform.accounts (id, status) VALUES ($1, 'active'), ($2, 'active')", [ownerId, memberId]
  );
  await database.poolForMigrationsAndTests.query(
    "INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')", [tenantId]
  );
  await database.poolForMigrationsAndTests.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')`,
    [tenantId, ownerId, memberId]
  );
  let outboundCalls = 0;
  const verifier: SiteVerificationClient = {
    async verify() {
      outboundCalls += 1;
      throw new PairingDiagnosticError('response', 'http.401');
    }
  };
  const createService = (accountId: string): PairingService => new PairingService({
    repository: new PostgresPairingRepository(database, {
      tenantId, accountId, correlationId: `correlation_${accountId}`
    }),
    verifier,
    platformIssuer: 'https://auth.example.test',
    platformSigningKeyPem: '-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----\n',
    platformSigningKid: 'local-key-0001'
  });
  await assert.rejects(createService(memberId).begin({
    tenantId, attemptId: 'attempt_member_0001', accountId: memberId,
    correlationId: 'correlation_member_0001',
    resource: canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp'), verifier: 'v'.repeat(43)
  }), (error) => error instanceof PairingDiagnosticError && error.code === 'pairing.persistence_failed');
  assert.equal(outboundCalls, 0);

  const owner = createService(ownerId);
  await owner.begin({
    tenantId, attemptId: 'attempt_owner_0001', accountId: ownerId,
    correlationId: 'correlation_owner_0001',
    resource: canonicalizeResource('https://site.example.test/wp-json/wp-auto/mcp'), verifier: 'v'.repeat(43)
  });
  await assert.rejects(owner.verify({
    tenantId, attemptId: 'attempt_owner_0001', verifier: 'v'.repeat(43),
    siteId: 'site_owner_0001', idempotencyKey: 'idempotency_owner_0001'
  }), (error) => error instanceof PairingDiagnosticError && error.code === 'http.401');
  assert.equal(outboundCalls, 1);
  const state = await database.poolForMigrationsAndTests.query<{ status: string; failure_code: string }>(
    'SELECT status, failure_code FROM platform.pairing_attempts WHERE tenant_id = $1 AND id = $2',
    [tenantId, 'attempt_owner_0001']
  );
  assert.deepEqual(state.rows, [{ status: 'failed', failure_code: 'verification_failed' }]);
  assert.equal((await database.poolForMigrationsAndTests.query('SELECT 1 FROM platform.sites')).rowCount, 0);
  assert.equal((await database.poolForMigrationsAndTests.query('SELECT 1 FROM platform.grants')).rowCount, 0);
});
