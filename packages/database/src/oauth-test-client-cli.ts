import { Database, PostgresOAuthClientRepository } from './index.js';

if (process.argv.length !== 3 || process.argv[2] !== 'provision-p3a-lifecycle') {
  throw new Error('usage: oauth test client cli provision-p3a-lifecycle');
}
const connectionString = process.env['WEPUU_DATABASE_URL'];
if (connectionString === undefined || connectionString.length === 0) {
  throw new Error('WEPUU_DATABASE_URL is required');
}

const database = new Database({
  connectionString,
  applicationName: 'wepuu-oauth-test-client-admin'
});
try {
  const result = await new PostgresOAuthClientRepository(database).provisionP3aLifecycleTestClient();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await database.close();
}
