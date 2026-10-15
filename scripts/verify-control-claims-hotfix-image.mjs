import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { P3D_MIGRATIONS } from '../packages/database/dist/p3d-migration.js';

export const BASELINE = 'ecacb7999004a6e74ebb5163ff337de4a12b5508';
export const BASELINE_TREE = '38bc13da5bf08b3d44f8d2ff4bba25961b2d9c9a';
export const BASELINE_IMAGE = 'ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe';
const BASELINE_CONFIG = 'sha256:5db506d0a488e24410796dbe9ec5577963dcca01121d2b46de46f95b3e1d235a';
const AUTHORIZATION_IMAGE = 'ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742';
const directory = '.tmp/control-claims-hotfix';
const image = 'wepuu-control:candidate';
const roots = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.json', 'tsconfig.base.json'];
const sourceAllowed = new Set(['packages/pairing/src/index.ts', 'apps/control-api/src/server.ts', 'apps/control-api/src/server.test.ts']);
const artifactAllowed = path => sourceAllowed.has(path)
  || /^(?:packages\/pairing\/dist\/index|apps\/control-api\/dist\/server)\.(?:js|js.map|d.ts|d.ts.map)$/.test(path)
  || /^apps\/control-api\/dist\/server\.test\.js(?:\.map)?$/.test(path);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function command(binary, args) {
  return execFileSync(binary, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
const docker = args => command('docker', args);
const git = args => command('git', args).trim();
const gitBytes = (revision, path) => execFileSync('git', ['show', `${revision}:${path}`], { maxBuffer: 8 * 1024 * 1024 });
let stage = 'source_allowlist';
function inspect(target) { return JSON.parse(docker(['image', 'inspect', target]))[0]; }
function common(metadata) {
  assert.equal(metadata.Config.User, 'node');
  assert.deepEqual(metadata.Config.Entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(metadata.Config.Cmd, ['node', 'apps/control-api/dist/main.js']);
}
function imageInventory(target) {
  return JSON.parse(docker(['run', '--rm', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--entrypoint=node', target, '-e', `
    const fs=require('node:fs'),c=require('node:crypto'),p=require('node:path');
    const out={};
    function walk(root){for(const e of fs.readdirSync(root,{withFileTypes:true})){
      if(e.name==='node_modules'||e.name==='.tsbuildinfo')continue;
      const name=p.posix.join(root,e.name);
      if(e.isDirectory())walk(name);
      else if(e.isFile())out[name]=c.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
      else throw Error('unexpected_source_link');
    }}
    walk('apps');walk('packages');
    for(const f of ${JSON.stringify(roots)})out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    console.log(JSON.stringify({files:out,
      migrations:fs.readdirSync('packages/database/migrations').filter(p=>p.endsWith('.sql')).sort(),
      fixturesPresent:fs.existsSync('tests/fixtures/p3e1a')||fs.existsSync('.tmp'),
      node:process.version}));
    `]));
}
function registryConfigDigest() {
  let manifest = JSON.parse(docker(['manifest', 'inspect', BASELINE_IMAGE]));
  if (manifest.manifests) {
    const linux = manifest.manifests.filter(item => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64');
    assert.equal(linux.length, 1);
    assert.match(linux[0].digest, /^sha256:[a-f0-9]{64}$/);
    manifest = JSON.parse(docker(['manifest', 'inspect', `${BASELINE_IMAGE.split('@')[0]}@${linux[0].digest}`]));
  }
  assert.equal(manifest.config.digest, BASELINE_CONFIG);
  return manifest.config.digest;
}

try {
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
  assert.equal(git(['rev-parse', `${BASELINE}^{tree}`]), BASELINE_TREE);
  assert.equal(git(['merge-base', BASELINE, 'HEAD']), BASELINE);
  const changes = git(['diff', '--name-only', BASELINE, 'HEAD', '--', 'apps', 'packages', ...roots, 'deploy/Control.Containerfile'])
    .split('\n').filter(Boolean);
  assert.ok(changes.every(path => sourceAllowed.has(path)), 'source_allowlist');
  const baselineMode = process.argv.includes('--baseline');
  if (baselineMode) {
    stage = 'baseline_metadata';
    const metadata = inspect(BASELINE_IMAGE);
    common(metadata);
    assert.equal(metadata.Config.Labels['org.wepuu.source-tree'], BASELINE_TREE);
    assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], '2b1474dd3b2d892df1f5d89e2fcafdde02884ff2');
    const configDigest = registryConfigDigest();
    stage = 'baseline_source_hashes';
    const inventory = imageInventory(BASELINE_IMAGE);
    const sourcePaths = git(['ls-tree', '-r', '--name-only', BASELINE, '--', 'apps', 'packages']).split('\n').concat(roots);
    for (const path of sourcePaths) assert.equal(inventory.files[path], hash(gitBytes(BASELINE, path)), 'baseline_source_identity');
    assert.deepEqual(inventory.migrations, Object.keys(P3D_MIGRATIONS).sort());
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/baseline.json`, JSON.stringify({ baseline: BASELINE, sourceTree: BASELINE_TREE,
      registryDigest: BASELINE_IMAGE, configDigest, dockerImageId: metadata.Id, inventory }, null, 2));
    console.log('E1B_PRODUCTION_BASELINE_SOURCE_VERIFIED=True');
  } else {
    stage = 'candidate_metadata';
    const baseline = JSON.parse(await readFile(`${directory}/baseline.json`, 'utf8'));
    assert.equal(baseline.baseline, BASELINE);
    assert.equal(baseline.configDigest, BASELINE_CONFIG);
    const metadata = inspect(image);
    common(metadata);
    assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], sourceCommit);
    assert.equal(metadata.Config.Labels['org.wepuu.source-tree'], sourceTree);
    const inventory = imageInventory(image);
    stage = 'candidate_file_boundary';
    assert.equal(inventory.fixturesPresent, false);
    assert.deepEqual(Object.keys(inventory.files).sort(), Object.keys(baseline.inventory.files).sort(), 'file_inventory');
    for (const [path, value] of Object.entries(inventory.files)) {
      if (!artifactAllowed(path)) {
        if (value !== baseline.inventory.files[path] && /^(?:apps|packages)\/[A-Za-z0-9_./-]+$/.test(path)) {
          console.error(`E1B_UNAPPROVED_FILE_DIFFERENCE=${path}`);
        }
        assert.equal(value, baseline.inventory.files[path], 'unchanged_runtime_file');
      }
    }
    for (const path of sourceAllowed) assert.equal(inventory.files[path], hash(gitBytes('HEAD', path)), 'backport_identity');
    assert.deepEqual(inventory.migrations, Object.keys(P3D_MIGRATIONS).sort());
    const migrationHashes = {};
    stage = 'migration_hashes';
    for (const [name, value] of Object.entries(P3D_MIGRATIONS)) {
      migrationHashes[name] = inventory.files[`packages/database/migrations/${name}`];
      assert.equal(migrationHashes[name], value, 'migration_identity');
    }
    const archiveMode = process.argv.includes('--archive');
    let archiveSha256 = null;
    if (archiveMode) {
      stage = 'archive_roundtrip';
      archiveSha256 = hash(await readFile(`${directory}/image.tar.gz`));
      await copyFile('.tmp/phase-2-0-6-sbom.json', `${directory}/sbom.json`);
      await writeFile(`${directory}/image.tar.gz.sha256`, `${archiveSha256}  image.tar.gz\n`);
      const before = metadata.Id;
      docker(['image', 'rm', image]);
      docker(['load', '--input', `${directory}/image.tar.gz`]);
      const restored = inspect(image);
      assert.equal(restored.Id, before, 'archive_roundtrip_identity');
      common(restored);
      assert.equal(restored.Config.Labels['org.wepuu.source-tree'], sourceTree);
      assert.deepEqual(imageInventory(image), inventory, 'archive_roundtrip_files');
    }
    await writeFile(`${directory}/manifest.json`, JSON.stringify({
      sourceCommit, sourceTree, workflowEventSha: process.env.GITHUB_SHA ?? null,
      baseline: BASELINE, baselineTree: BASELINE_TREE, baselineImage: BASELINE_IMAGE,
      baselineConfigDigest: BASELINE_CONFIG, authorizationImage: AUTHORIZATION_IMAGE,
      imageId: metadata.Id, registryDigest: null, archiveFormat: 'docker-save gzip', archiveSha256,
      command: metadata.Config.Cmd, entrypoint: metadata.Config.Entrypoint, user: metadata.Config.User,
      migrationHashes, lockfileSha256: inventory.files['pnpm-lock.yaml'],
      buildRecipeSha256: hash(gitBytes('HEAD', 'deploy/Control.Containerfile')),
      node: inventory.node, sourceChanges: changes, archiveRoundtripPass: archiveMode,
      fileHashes: inventory.files
    }, null, 2));
    console.log(archiveMode ? 'E1B_ARCHIVE_ROUNDTRIP_PASS=True' : 'E1B_CONTROL_IMAGE_BOUNDARY_PASS=True');
  }
} catch {
  console.error(`E1B_IMAGE_IDENTITY_GATE_FAILED stage=${stage}`);
  process.exitCode = 1;
}
