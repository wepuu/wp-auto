import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectEvidence } from '../test/persistent-authorization/r10/evidence.mjs';
import { verifyAuthorizationArtifact } from './authorization-build-contract.mjs';
import { collect } from '../test/persistent-authorization/r10/reporter.mjs';
import { verifyDatabaseManifest, candidateDatabase, retainedDatabase, legacyDatabase } from '../test/persistent-authorization/r10/profiles.mjs';
const file = 'packages/database/test/persistent-readonly.test.ts';
const pass = { type: 'test:pass', data: { file: '/workspace/' + file, nesting: 0 } };
const cfg = { files: [file], phase: 'database', expectedTopLevel: { 'persistent-readonly.test.ts': 1 } };
test('R10 reports missing, skipped, extra, duplicate-count or failed required tests as failure', async () => {
  assert((await collect([pass], cfg)).passed);
  for (const events of [[], [pass, pass], [{ ...pass, data: { ...pass.data, skip: true } }],
    [{ ...pass, type: 'test:fail' }], [pass, { ...pass, data: { file: 'unknown' } }]]) {
    assert(!(await collect(events, cfg)).passed);
  }
});
test('R10 report suppresses raw exceptions, test names, output and assertion values', async () => {
  const result = await collect([{ type: 'test:stdout', data: { message: 'SECRET_SENTINEL' } },
    { type: 'test:fail', data: { ...pass.data, name: 'SECRET_SENTINEL', details: { error: {
      code: 'ERR_ASSERTION', message: 'SECRET_SENTINEL', actual: 'SECRET_SENTINEL' } } } }], cfg);
  assert(!result.passed); assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});
test('R10 closed database manifest separates Console014 from candidate and historical profiles', () => {
  const names = [...Object.keys(candidateDatabase), ...Object.keys(retainedDatabase), ...Object.keys(legacyDatabase)];
  verifyDatabaseManifest(names);
  assert.throws(() => verifyDatabaseManifest([...names, 'unknown.test.ts']));
  assert.throws(() => verifyDatabaseManifest(names.slice(1)));
  assert(!Object.hasOwn(candidateDatabase, 'console-auth.test.ts'));
});
test('R10 keeps immutable history and current017 replacement instead of weakening old assertions', async () => {
  const historical = await readFile(new URL('./multisite-r8-storage-boundary.characterization.mjs', import.meta.url), 'utf8');
  assert(historical.includes("INSERT INTO oauth.secret_artifacts"));
  const current = await readFile(new URL('./multisite-r9-offline.test.mjs', import.meta.url), 'utf8');
  assert(current.includes('oauth.issue_native_code')); assert(current.includes('parentless refresh'));
});
test('R10 actual reporter transport preserves required completion and rejects a killed child', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-r10-synthetic-')), file = join(directory, 'fixture.mjs');
  try {
    await writeFile(file, "import test from 'node:test';test('SECRET_SENTINEL',()=>{console.log('SECRET_SENTINEL')});");
    const env = { ...process.env, WEPUU_R10_REPORT_CONFIG: JSON.stringify({ files: [file.replaceAll('\\', '/')], phase: 'database' }) };
    delete env.NODE_TEST_CONTEXT;
    const output = await promisify(execFile)(process.execPath, ['--test', '--test-reporter', new URL('../test/persistent-authorization/r10/reporter.mjs', import.meta.url).href, file], { env, timeout: 10000 });
    assert(JSON.parse(output.stdout).passed); assert(!output.stdout.includes('SECRET_SENTINEL'));
    await assert.rejects(() => promisify(execFile)(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeout: 100 }), e => e.killed === true);
  } finally { await unlink(file); await rmdir(directory); }
});
test('R10 fixed evidence schema cannot export secrets even from an allowed filename', () => {
  const result = projectEvidence('unit-tests.json', { passed: false, secret: 'SECRET_SENTINEL', report: {
    passed: false, failures: [{ file: 'SECRET_SENTINEL', category: 'SECRET_SENTINEL', message: 'SECRET_SENTINEL' }], raw: 'SECRET_SENTINEL' } });
  assert(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  assert.throws(() => projectEvidence('credentials.private.json', { passed: true }));
});
test('R10 Control role requires its direct main and does not weaken Authorization verification', () => {
  const id = 'sha256:' + 'a'.repeat(64), revision = 'b'.repeat(40), tag = 'wepuu-r10-control:test';
  const f = { exitCode: 0, revision, tag, iid: id, metadata: { 'containerimage.config.digest': id, 'containerimage.digest': id },
    images: [{ Id: id, RepoTags: [tag], Os: 'linux', Architecture: 'amd64', Config: { User: 'node',
      Cmd: ['node', 'apps/control-api/dist/main.js'], Labels: { 'org.opencontainers.image.revision': revision } } }] };
  assert(verifyAuthorizationArtifact({ ...f, artifactRole: 'control' }).directMain);
  assert.throws(() => verifyAuthorizationArtifact(f));
  f.images[0].Config.Cmd = ['sh', '-c', 'migrate && start'];
  assert.throws(() => verifyAuthorizationArtifact({ ...f, artifactRole: 'control' }));
});
test('R10 build and integration remain offline, once-only, and stop before later stages on failure', async () => {
  const container = await readFile(new URL('../deploy/R10.Containerfile', import.meta.url), 'utf8');
  assert(!container.includes('RUN pnpm install')); assert(!container.includes('migrate'));
  const runner = await readFile(new URL('./test-persistent-images.mjs', import.meta.url), 'utf8');
  assert(runner.indexOf("await scenario('unit')") < runner.indexOf("stage = 'database_setup'"));
  assert(runner.indexOf("await scenario('database')") < runner.indexOf("await scenario('legacy')"));
  assert(runner.includes("assert.equal(item.passed, true, 'IMAGE_SCENARIO_FAILED')"));
  assert(!runner.includes("function walk(p,r='')"));
});
