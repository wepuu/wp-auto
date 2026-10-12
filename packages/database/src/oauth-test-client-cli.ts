import {
  Database,
  PostgresOAuthClientRepository,
  readP3b1CodexDesktopCallbackFile
} from './index.js';

const operation = process.argv[2];
const allowedOperations = [
  'provision-p3a-lifecycle',
  'suspend-p3a-lifecycle',
  'register-p3b1-codex-callback',
  'remove-p3b1-codex-callback'
] as const;
if (process.argv.length !== 3 || !allowedOperations.some((allowed) => allowed === operation)) {
  throw new Error('usage: oauth test client cli provision-p3a-lifecycle | suspend-p3a-lifecycle | register-p3b1-codex-callback | remove-p3b1-codex-callback');
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
  const repository = new PostgresOAuthClientRepository(database);
  let result;
  if (operation === 'provision-p3a-lifecycle') {
    result = await repository.provisionP3aLifecycleTestClient();
  } else if (operation === 'suspend-p3a-lifecycle') {
    result = await repository.suspendP3aLifecycleTestClient();
  } else {
    const callbackFile = process.env['WEPUU_CODEX_DESKTOP_CALLBACK_FILE'];
    if (callbackFile === undefined || callbackFile.length === 0) {
      throw new Error('WEPUU_CODEX_DESKTOP_CALLBACK_FILE is required');
    }
    const callbackUri = await readP3b1CodexDesktopCallbackFile(callbackFile);
    result = operation === 'register-p3b1-codex-callback'
      ? await repository.registerP3b1CodexDesktopCallback(callbackUri)
      : await repository.removeP3b1CodexDesktopCallback(callbackUri);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await database.close();
}
