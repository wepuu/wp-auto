import { Database, PostgresSecurityAuditSink } from '@wepuu/database';
import {
  buildControlApi,
  DenyAllAccountIdentityProvider,
  PostgresControlStore
} from './server.js';

const databaseUrl = process.env['WEPUU_DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error('WEPUU_DATABASE_URL is required');

const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-control-api' });
const app = buildControlApi({
  identityProvider: new DenyAllAccountIdentityProvider(),
  store: new PostgresControlStore(database),
  audit: new PostgresSecurityAuditSink(database),
  readiness: () => database.checkReady()
});

const port = Number(process.env['WEPUU_CONTROL_PORT'] ?? '3000');
const host = process.env['WEPUU_CONTROL_HOST'] ?? '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  await database.close();
  throw error;
}

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
