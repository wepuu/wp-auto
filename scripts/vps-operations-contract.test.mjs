import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../deploy/wpauto-vps/', import.meta.url);

async function script(name) {
  return readFile(new URL(name, root), 'utf8');
}

test('health probe is content-free and bounded to wpauto services', async () => {
  const source = await script('check-health.sh');
  assert.match(source, /wpauto-postgres-1/);
  assert.match(source, /wpauto-control-1/);
  assert.match(source, /wpauto-authorization-1/);
  assert.match(source, /internal\/metrics/);
  assert.doesNotMatch(source, /docker system prune|docker image prune|docker volume prune/);
  assert.doesNotMatch(source, /Authorization:|Cookie:|tenant|site_id|grant_id/i);
});

test('backup job uses exact directories, protected files, and bounded retention', async () => {
  const source = await script('backup-database.sh');
  assert.match(source, /\/opt\/wpauto\/backups\/daily/);
  assert.match(source, /chmod 0600/);
  assert.match(source, /pg_restore -l/);
  assert.match(source, /-mtime \+7 -delete/);
  assert.match(source, /-mtime \+28 -delete/);
  assert.doesNotMatch(source, /\.env|signing_private_key|signing_passphrase/);
});

test('deployment accepts digest-pinned project images and rolls back on failed health', async () => {
  const source = await script('deploy-service.sh');
  assert.match(source, /wp-auto-control/);
  assert.match(source, /wp-auto-authorization/);
  assert.match(source, /digest=.*target#/);
  assert.match(source, /\[0-9a-f\]\{64\}/);
  assert.match(source, /health_rollback_applied/);
  assert.match(source, /--no-deps --wait/);
  assert.doesNotMatch(source, /docker system prune|docker compose down|rm -rf/);
});
