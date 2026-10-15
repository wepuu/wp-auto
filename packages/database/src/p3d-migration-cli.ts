import { Pool } from 'pg';
import { applyP3d015 } from './p3d-migration.js';

if (process.argv.length !== 3 || process.argv[2] !== 'apply-p3d-015'
  || process.env['WEPUU_P3D_MIGRATION_APPROVED'] !== 'true'
  || !process.env['WEPUU_DATABASE_URL']) {
  process.stderr.write('P3D_MIGRATION=arguments_rejected\n');
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: process.env['WEPUU_DATABASE_URL'],
    application_name: 'wepuu-p3d-015', connectionTimeoutMillis: 5_000 });
  try {
    const changed = await applyP3d015(pool);
    process.stdout.write(`P3D_MIGRATION=${changed ? 'applied' : 'unchanged'}\n`);
  } catch {
    process.stderr.write('P3D_MIGRATION=failed\n');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
