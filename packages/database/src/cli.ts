import { Database } from './index.js';

const command = process.argv[2];
if (command !== 'migrate' && command !== 'migrate-authorization') throw new Error('usage: database cli migrate|migrate-authorization');
const connectionString = process.env['WEPUU_DATABASE_URL'];
if (connectionString === undefined || connectionString.length === 0) throw new Error('WEPUU_DATABASE_URL is required');

const database = new Database({ connectionString, applicationName: 'wepuu-migrator',
  migrationProfile: command === 'migrate-authorization' ? 'authorization' : 'full' });
try {
  await database.migrate();
  process.stdout.write('migrations applied\n');
} finally {
  await database.close();
}
