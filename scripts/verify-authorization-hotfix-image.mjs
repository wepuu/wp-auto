import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const image = 'wepuu-authorization:candidate';
const directory = '.tmp/authorization-hotfix';
const command = ['sh', '-ec', 'node packages/database/dist/cli.js migrate && exec node apps/authorization-service/dist/main.js'];
const expected = ['001_foundation.sql', '002_pairing_and_grants.sql', '003_account_login.sql',
  '004_grant_reconsent.sql', '005_token_lifecycle.sql', '006_oauth_client_id_constraint.sql',
  '007_deletion_lifecycle.sql', '008_account_workspaces.sql', '009_local_signing_custody.sql',
  '010_better_auth_schema.sql', '011_account_auth_links.sql', '012_better_auth_identity_uniqueness.sql',
  '013_email_otp_login.sql'];
const baseline = '5fab3eadbf23ae72ffae6e984a24947a510f43ab';
try {
  const metadata = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }))[0];
  assert.deepEqual(metadata.Config.Cmd, command);
  assert.deepEqual(metadata.Config.Entrypoint, ['docker-entrypoint.sh']);
  assert.equal(metadata.Config.User, 'node');
  const inspection = `const fs=require('node:fs'),crypto=require('node:crypto');
    const dir='/workspace/packages/database/migrations';
    const files=fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort();
    const hashes=Object.fromEntries(files.map(x=>[x,crypto.createHash('sha256').update(fs.readFileSync(dir+'/'+x)).digest('hex')]));
    const database=fs.readFileSync('/workspace/packages/database/dist/index.js','utf8');
    const provider=fs.readFileSync('/workspace/packages/oauth-provider/dist/index.js','utf8');
    const server=fs.readFileSync('/workspace/apps/authorization-service/dist/server.js','utf8');
    console.log(JSON.stringify({files,hashes,p4Present:database.includes('PostgresConsole'),
      resourceLoader:provider.includes('createResourceGrantLoader'),wired:server.includes('resourceGrantResolver: authorizationGrants')}));`;
  // Explicit node entrypoint and no network: never run migration/default CMD.
  const manifest = JSON.parse(execFileSync('docker', ['run', '--rm', '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', image, '-e', inspection], { encoding: 'utf8' }));
  assert.deepEqual(manifest.files, expected);
  assert.equal(manifest.p4Present, false);
  assert.equal(manifest.resourceLoader, true);
  assert.equal(manifest.wired, true);
  for (const filename of expected) {
    const bytes = execFileSync('git', ['show', `${baseline}:packages/database/migrations/${filename}`]);
    assert.equal(manifest.hashes[filename], createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? ''), true);
  assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], process.env.GITHUB_SHA);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ sourceCommit: process.env.GITHUB_SHA,
    baseline, imageId: metadata.Id, registryDigest: null, command, entrypoint: metadata.Config.Entrypoint,
    user: metadata.Config.User, ...manifest }, null, 2));
  console.log('AUTHORIZATION_HOTFIX_IMAGE_BOUNDARY_PASS=True');
  console.log(`CANDIDATE_IMAGE_ID=${metadata.Id}`);
} catch {
  console.error('AUTHORIZATION_HOTFIX_IMAGE_BOUNDARY_PASS=False');
  process.exitCode = 1;
}

// Archive hash is added after docker save, without representing it as a registry digest.
if (process.argv.includes('--archive') && process.exitCode !== 1) {
  const archive = await readFile(join(directory, 'image.tar.gz'));
  const digest = createHash('sha256').update(archive).digest('hex');
  await writeFile(join(directory, 'image.tar.gz.sha256'), `${digest}  image.tar.gz\n`);
  console.log(`CANDIDATE_ARCHIVE_SHA256=${digest}`);
}
