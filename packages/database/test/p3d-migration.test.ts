import assert from 'node:assert/strict';
import { cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import { applyP3d015, P3D_MIGRATIONS } from '../src/p3d-migration.js';
import { p3dDatabaseUrl, p3dFixture } from './p3d-fixture.js';

test('P3-D3 fixed migration accepts only 001-013 to 015, rejects tamper/history, serializes and rolls back', {
  skip: p3dDatabaseUrl === undefined, timeout: 60_000
}, async (t) => {
  const { pool, databaseUrl } = await p3dFixture(t, false, true);
  assert.equal((await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM public.wepuu_schema_migrations')).rows[0]?.n, 13);
  const root = await mkdtemp(join(tmpdir(), 'p3d-migration-tamper-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(resolve('packages/database/migrations'), root, { recursive: true });
  await writeFile(join(root, '014_unapproved.sql'), 'SELECT 1;');
  await assert.rejects(applyP3d015(pool, root), /p3d_migration_failed/);
  await rm(join(root, '014_unapproved.sql'));
  await writeFile(join(root, '015_email_otp_send_budget.sql'), 'SECRET_SQL_SENTINEL');
  await assert.rejects(applyP3d015(pool, root), /p3d_migration_failed/);
  await pool.query("UPDATE public.wepuu_schema_migrations SET sha256=repeat('0',64) WHERE name='013_email_otp_login.sql'");
  await assert.rejects(applyP3d015(pool), /p3d_migration_failed/);
  await pool.query("UPDATE public.wepuu_schema_migrations SET sha256=$1 WHERE name='013_email_otp_login.sql'", [P3D_MIGRATIONS['013_email_otp_login.sql']]);
  await pool.query("INSERT INTO public.wepuu_schema_migrations VALUES('014_console_auth_boundary.sql',repeat('0',64),now())");
  await assert.rejects(applyP3d015(pool), /p3d_migration_failed/);
  await pool.query("DELETE FROM public.wepuu_schema_migrations WHERE name='014_console_auth_boundary.sql'");
  const lock = new Client({ connectionString: databaseUrl });
  await lock.connect();
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT pg_advisory_xact_lock(20260916,202)');
    await assert.rejects(applyP3d015(pool), /p3d_migration_failed/);
  } finally { await lock.query('ROLLBACK'); await lock.end(); }
  await pool.query(`CREATE FUNCTION public.p3d_commit_error() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'SECRET_COMMIT_SENTINEL'; END; $$`);
  await pool.query(`CREATE CONSTRAINT TRIGGER p3d_commit_error AFTER INSERT ON public.wepuu_schema_migrations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.p3d_commit_error()`);
  await assert.rejects(applyP3d015(pool), /p3d_migration_failed/);
  assert.equal((await pool.query<{ t: string | null }>("SELECT to_regclass('auth.otp_send_reservations') AS t")).rows[0]?.t, null);
  await pool.query('DROP TRIGGER p3d_commit_error ON public.wepuu_schema_migrations');
  await pool.query('DROP FUNCTION public.p3d_commit_error()');
  const results = await Promise.all([applyP3d015(pool), applyP3d015(pool)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await applyP3d015(pool), false);
  const ledger = await pool.query<{ name: string; sha256: string }>('SELECT name,sha256 FROM public.wepuu_schema_migrations ORDER BY name');
  assert.deepEqual(Object.fromEntries(ledger.rows.map((r) => [r.name, r.sha256])), P3D_MIGRATIONS);
});
