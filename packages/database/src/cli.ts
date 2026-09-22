import { Database } from './index.js';

if (process.argv[2] !== 'migrate') throw new Error('usage: database cli migrate');
const connectionString = process.env['WEPUU_DATABASE_URL'];
if (connectionString === undefined || connectionString.length === 0) throw new Error('WEPUU_DATABASE_URL is required');

const database = new Database({ connectionString, applicationName: 'wepuu-migrator' });
try {
  await database.migrate();
  process.stdout.write('migrations applied\n');
} finally {
  await database.close();
}
