// Closed manifests: adding a database test requires an explicit profile decision.
export const candidateDatabase = Object.freeze({
  'account-auth-link.test.ts': 1, 'account-login-transaction.test.ts': 2,
  'account-workspace.test.ts': 1, 'deletion-lifecycle.test.ts': 4,
  'grant-reconsent.test.ts': 1, 'local-signing-lifecycle.test.ts': 1,
  'migration-profile.test.ts': 2, 'multi-site-provider.test.ts': 1,
  'oauth-client-callback.test.ts': 3, 'persistent-readonly.test.ts': 6,
  'secret-artifact.test.ts': 3, 'tenant-isolation.test.ts': 2,
  'tenant-provider-http.test.ts': 1
});
export const retainedDatabase = Object.freeze({ 'otp-send-budget.test.ts': 2, 'pairing-diagnostics.test.ts': 1 });
export const legacyDatabase = Object.freeze({ 'console-auth.test.ts': 1 });
export const historicalCharacterizations = Object.freeze([
  { file: 'scripts/multisite-r8-storage-boundary.characterization.mjs',
    revision: '546dc51447ff99c9b592f286c6888be0913e1683', replacement: 'scripts/multisite-r9-offline.test.mjs' }
]);
export const offlineSkipFiles = Object.freeze([
  ...Object.keys(candidateDatabase), ...Object.keys(retainedDatabase), ...Object.keys(legacyDatabase),
  'packages/account-auth/test/account-auth-postgres.test.ts', 'apps/control-api/src/server.test.ts',
  'packages/pairing/test/php-interop.test.ts', 'scripts/local-evidence-acl.test.mjs',
  'scripts/multisite-r9-database.test.mjs', 'scripts/multisite-r7.test.mjs'
]);
export function verifyDatabaseManifest(files) {
  const expected = [...Object.keys(candidateDatabase), ...Object.keys(retainedDatabase), ...Object.keys(legacyDatabase)].sort();
  if (JSON.stringify([...files].sort()) !== JSON.stringify(expected)) throw Error('DATABASE_MANIFEST_DRIFT');
}
