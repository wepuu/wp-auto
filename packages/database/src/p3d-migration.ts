import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

// Fixed release manifest, not an arbitrary migration runner.
export const P3D_BASELINE = '6345055ce213a822e24469f14cd128b650316685';
export const P3D_MIGRATIONS: Readonly<Record<string, string>> = {
  '001_foundation.sql': '9053f812cbb2bafe1a3b4068cc8458110329bbe65bce8f8a932fbd8f4216d513',
  '002_pairing_and_grants.sql': 'cb490789b324ffc48f1aa2ee28c4be1f359128b6ec370f2881609f011321db2d',
  '003_account_login.sql': '1b111491e2496dd14010482f67eca8ab0e6b2841a8f4c2078cd72147bab37203',
  '004_grant_reconsent.sql': '5fb8d523916894711e9c0bbfdb1d2c292cf58bb5b75b61090a32e66efe171b20',
  '005_token_lifecycle.sql': 'a1ea478ea15875ff7b5585c886a6480d76db7bef1e94621876a6f891e23b6177',
  '006_oauth_client_id_constraint.sql': '5cfa878e4b8408e66746c5cc50687fd7404127764b34460bf428cfbbb49a0b0d',
  '007_deletion_lifecycle.sql': '24169eb85e00fcf26e53ad8a08955c319330e2348c0acbb7f7eb1024ff14b999',
  '008_account_workspaces.sql': '56662fd2b0a9e921bb8bba5e9a60ee2ac9a6728632824ae0eed0c1817457b32d',
  '009_local_signing_custody.sql': '38e11fc0e52050daa630dd2125ada0e0798de90d016b0ec6b56c8073563a7402',
  '010_better_auth_schema.sql': '22726362c945e743acf05b66cdeb8b98758fa21778bc30a688c731b9f7238369',
  '011_account_auth_links.sql': 'de833a37625641c7c4ba9a0028a929967957015bc2a8addcf1568101d35f87dd',
  '012_better_auth_identity_uniqueness.sql': '7b47198a50237e3b27b606249e9de4539d38a03e7caf93386bbd0ba8dcaa5544',
  '013_email_otp_login.sql': 'a91d41a20c8664c19545f32e339f834c791d6c409abc4f4cbc3d19a8ea115717',
  '015_email_otp_send_budget.sql': '35a2efb46872e3b195a9363e5a1f0dfce5b50346b30f431146a60e734c43d0ac'
};
const target = '015_email_otp_send_budget.sql';
const defaultDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Directory injection is only for isolated tamper tests; CLI accepts no path.
export async function applyP3d015(pool: Pool, directory = defaultDirectory): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock($1,$2)', [20260916, 202]);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    if (JSON.stringify(files) !== JSON.stringify(Object.keys(P3D_MIGRATIONS).sort())) throw new Error('boundary');
    let sql = '';
    for (const name of files) {
      const bytes = await readFile(resolve(directory, name));
      if (createHash('sha256').update(bytes).digest('hex') !== P3D_MIGRATIONS[name]) throw new Error('checksum');
      if (name === target) sql = bytes.toString('utf8');
    }
    const ledger = await client.query<{ name: string; sha256: string }>('SELECT name,sha256 FROM public.wepuu_schema_migrations ORDER BY name');
    const expected = Object.keys(P3D_MIGRATIONS).filter((name) => name !== target);
    const names = ledger.rows.map((row) => row.name);
    const already = names.includes(target);
    if (JSON.stringify(names) !== JSON.stringify(already ? Object.keys(P3D_MIGRATIONS).sort() : expected)) throw new Error('ledger');
    if (ledger.rows.some((row) => row.sha256 !== P3D_MIGRATIONS[row.name])) throw new Error('ledger_checksum');
    if (!already) {
      await client.query(sql);
      await client.query('INSERT INTO public.wepuu_schema_migrations(name,sha256) VALUES($1,$2)', [target, P3D_MIGRATIONS[target]]);
    }
    await client.query('COMMIT');
    return !already;
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error('p3d_migration_failed');
  } finally { client.release(); }
}
