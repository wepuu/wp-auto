import { Database, PostgresSigningKeyRepository } from './index.js';
import { localPkcs8KeyCustodyFromEnvironment } from '@wepuu/key-custody';

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} is required`);
  return value;
}

const databaseUrl = process.env['WEPUU_DATABASE_URL'];
if (databaseUrl === undefined) throw new Error('WEPUU_DATABASE_URL is required');
const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-signing-key-admin' });
try {
  const repository = new PostgresSigningKeyRepository(database);
  const command = process.argv[2];
  if (command === 'publish') {
    const slot = argument('slot');
    const custody = await localPkcs8KeyCustodyFromEnvironment(process.env, slot);
    const descriptor = await custody.describeSigningKey();
    await repository.publish({
      kid: descriptor.kid, custodyProvider: 'local-pkcs8', custodyReference: slot,
      publicJwk: descriptor.publicJwk
    });
    process.stdout.write(`${JSON.stringify({ changed: true, kid: descriptor.kid, status: 'published' })}\n`);
  } else if (command === 'activate') {
    const kid = argument('kid');
    process.stdout.write(`${JSON.stringify({ changed: await repository.activate(kid), kid, status: 'active' })}\n`);
  } else if (command === 'retire') {
    const kid = argument('kid');
    process.stdout.write(`${JSON.stringify({ changed: await repository.retire(kid), kid, status: 'revoked' })}\n`);
  } else {
    throw new Error('usage: keys:[publish|activate|retire] --slot SLOT | --kid KID');
  }
} finally {
  await database.close();
}
