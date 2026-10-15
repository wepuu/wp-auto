import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { P3D_BASELINE, P3D_MIGRATIONS } from '../packages/database/dist/p3d-migration.js';

const baselineImage = 'ghcr.io/wepuu/wp-auto-control@sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f';
const baselineMode = process.argv.includes('--baseline');
const image = baselineMode ? baselineImage : 'wepuu-control:candidate';
const directory = '.tmp/control-hotfix';
const run = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const metadata = JSON.parse(run(['image', 'inspect', image]))[0];
  assert.equal(metadata.Config.User, 'node');
  assert.deepEqual(metadata.Config.Entrypoint, ['docker-entrypoint.sh']);
  const inspection = `const fs=require('node:fs'),c=require('node:crypto');
    const files=JSON.parse(process.argv[1]);
    console.log(JSON.stringify(Object.fromEntries(files.map(f=>[f,c.createHash('sha256').update(fs.readFileSync('/workspace/'+f)).digest('hex')]))));`;
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', P3D_BASELINE, 'apps', 'packages'], { encoding: 'utf8' })
    .trim().split('\n').concat(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.json', 'tsconfig.base.json']);
  const required = baselineMode ? paths : Object.keys(P3D_MIGRATIONS).map((n) => `packages/database/migrations/${n}`);
  const hashes = JSON.parse(run(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', image, '-e', inspection, JSON.stringify(required)]));
  for (const path of required) {
    const expected = baselineMode ? hash(execFileSync('git', ['show', `${P3D_BASELINE}:${path}`])) : P3D_MIGRATIONS[path.split('/').at(-1)];
    assert.equal(hashes[path], expected, 'source_or_migration_identity');
  }
  await mkdir(directory, { recursive: true });
  if (baselineMode) {
    await writeFile(`${directory}/baseline.json`, JSON.stringify({ baseline: P3D_BASELINE, registryDigest: baselineImage,
      imageId: metadata.Id, sourceHashes: hashes }, null, 2));
  } else {
    assert.deepEqual(metadata.Config.Cmd, ['node', 'apps/control-api/dist/main.js']);
    const checks = JSON.parse(run(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', image, '-e', `const f=require('node:fs');
      console.log(JSON.stringify({migrations:f.readdirSync('packages/database/migrations').filter(x=>x.endsWith('.sql')).sort(),
      p4:['packages/database/dist/index.js','apps/control-api/dist/main.js','apps/control-api/dist/server.js'].some(p=>/PostgresConsole|ConsoleSession|consoleHandoff/.test(f.readFileSync(p,'utf8')))}));` ]));
    assert.deepEqual(checks.migrations, Object.keys(P3D_MIGRATIONS).sort());
    assert.equal(checks.p4, false);
    const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], process.env.GITHUB_SHA);
    assert.equal(metadata.Config.Labels['org.wepuu.source-tree'], sourceTree);
    const baselineEvidence = JSON.parse(await readFile(`${directory}/baseline.json`, 'utf8'));
    assert.equal(baselineEvidence.baseline, P3D_BASELINE);
    await writeFile(`${directory}/manifest.json`, JSON.stringify({ sourceCommit: process.env.GITHUB_SHA,
      sourceTree, baseline: P3D_BASELINE, baselineImage, imageId: metadata.Id, registryDigest: null,
      command: metadata.Config.Cmd, entrypoint: metadata.Config.Entrypoint, user: metadata.Config.User,
      migrationHashes: hashes }, null, 2));
    if (process.argv.includes('--archive')) {
      await copyFile('.tmp/phase-2-0-6-sbom.json', `${directory}/sbom.json`);
      await writeFile(`${directory}/image.tar.gz.sha256`, `${hash(await readFile(`${directory}/image.tar.gz`))}  image.tar.gz\n`);
    }
  }
  console.log(baselineMode ? 'CONTROL_BASELINE_SOURCE_VERIFIED=True' : 'CONTROL_HOTFIX_IMAGE_BOUNDARY_PASS=True');
} catch {
  console.error(baselineMode ? 'CONTROL_BASELINE_SOURCE_VERIFIED=False' : 'CONTROL_HOTFIX_IMAGE_BOUNDARY_PASS=False');
  process.exitCode = 1;
}
