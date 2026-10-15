import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { Database } from '../src/index.js';

export const p3dDatabaseUrl = process.env['WEPUU_TEST_DATABASE_URL'];
if (process.env['CI'] === 'true' && p3dDatabaseUrl === undefined) throw new Error('p3d_test_database_required');
if (p3dDatabaseUrl !== undefined && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(p3dDatabaseUrl).hostname)) {
  throw new Error('p3d_isolated_database_must_be_loopback');
}

export async function p3dFixture(t: TestContext, full = false, before015 = false) {
  assert.ok(p3dDatabaseUrl, 'isolated_database_required');
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-p3d-'));
  const migrations = join(directory, 'migrations');
  const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await cp(source, migrations, { recursive: true, filter: (path) => path === source
    || ((!before015 || !basename(path).startsWith('015_'))
      && (full || /^(?:00[1-9]|01[0-3]|015)_/u.test(basename(path)))) });
  const admin = new Client({ connectionString: p3dDatabaseUrl });
  await admin.connect();
  const name = `wepuu_p3d_${randomBytes(7).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const target = new URL(p3dDatabaseUrl);
  target.pathname = `/${name}`;
  const database = new Database({ connectionString: target.href, applicationName: 'wepuu-p3d-test', migrationsDirectory: migrations });
  const closers: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    for (const close of closers.reverse()) await close();
    await database.close();
    let closed = false;
    for (let i = 0; i < 30; i += 1) {
      const result = await admin.query<{ count: string }>('SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=$1', [name]);
      if (result.rows[0]?.count === '0') { closed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(closed, true, 'p3d_connections_closed');
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  });
  await database.migrate();
  return { database, directory, databaseUrl: target.href, pool: database.poolForMigrationsAndTests,
    cleanup: (close: () => Promise<unknown>) => { closers.push(close); } };
}
