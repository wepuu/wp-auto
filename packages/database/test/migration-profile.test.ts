import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { authorizationMigrationNames } from '../src/index.js';

test('Authorization migration profile preserves retained 014 source but never selects it', async () => {
  const files = await readdir(new URL('../migrations/', import.meta.url));
  assert(files.includes('014_console_auth_boundary.sql'));
  const names = authorizationMigrationNames(files);
  assert.equal(names.length, 16);
  assert(!names.some(name => name.startsWith('014')));
  assert.equal(names.at(-1), '017_authorization_artifact_classification.sql');
  assert.deepEqual(authorizationMigrationNames([...files].reverse()), names);
});

test('Authorization migration profile rejects missing, duplicate and unknown SQL releases', async () => {
  const files = await readdir(new URL('../migrations/', import.meta.url));
  for (const changed of [files.filter(name => !name.startsWith('016')),
    [...files, '016_duplicate.sql'], [...files, '018_unreviewed.sql'],
    [...files, '014_other.sql']]) {
    assert.throws(() => authorizationMigrationNames(changed), /candidate_migration_set_mismatch/u);
  }
});
