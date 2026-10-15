import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const baseline = 'ecacb7999004a6e74ebb5163ff337de4a12b5508';
const files = [
  'packages/account-auth/src/index.ts', 'packages/account-auth/src/otp-send-quota.ts',
  'packages/database/src/p3d-migration.ts', 'packages/database/src/p3d-migration-cli.ts',
  'apps/control-api/src/main.ts', 'apps/control-api/src/ui.ts',
  'package.json', 'pnpm-lock.yaml', 'deploy/Control.Containerfile',
  'deploy/wpauto-vps/p3d-control.override.yaml', 'deploy/wpauto-vps/p3d-otp-send-deny.conf'
];
const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('runtime diff is restricted to proof diagnostics and its HTTP regression', () => {
  const changed = git(['diff', '--name-only', baseline, '--', 'apps', 'packages',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc',
    'tsconfig.json', 'tsconfig.base.json', 'deploy/Control.Containerfile']).split('\n').filter(Boolean).sort();
  assert.deepEqual(changed, ['apps/control-api/src/server.test.ts', 'apps/control-api/src/server.ts', 'packages/pairing/src/index.ts']);
});

test('OTP runtime, custody, guard, dependencies and direct startup retain baseline bytes', async () => {
  for (const path of files) {
    const original = execFileSync('git', ['show', `${baseline}:${path}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal((await readFile(path)).equals(original), true, 'BASELINE_BYTES_UNCHANGED');
  }
});

test('migration source set is exactly baseline 001-013 plus 015 with unchanged bytes', async () => {
  const { readdir } = await import('node:fs/promises');
  const directory = 'packages/database/migrations';
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const originalNames = git(['ls-tree', '--name-only', `${baseline}:${directory}`]).split('\n').filter(name => name.endsWith('.sql')).sort();
  assert.equal(names.length, 14);
  assert.equal(names.some(name => name.startsWith('014_')), false);
  assert.deepEqual(names, originalNames);
  for (const name of names) {
    assert.equal((await readFile(`${directory}/${name}`)).equals(execFileSync('git', ['show', `${baseline}:${directory}/${name}`])), true, 'MIGRATION_BYTES_UNCHANGED');
  }
});
