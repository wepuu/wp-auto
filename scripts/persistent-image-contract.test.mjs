import assert from 'node:assert/strict';
import test from 'node:test';
import { integrationOptions, verifyIntegrationContext, verifyIntegrationImage, verifyDiskBudget, verifyCompiledIdentity,
  verifyOwnedStopped, integrationFailure } from './persistent-image-contract.mjs';
const id = 'sha256:' + 'a'.repeat(64), revision = 'b'.repeat(40);
const env = { WEPUU_TEST_DOCKER_CONTEXT: 'desktop-linux', WEPUU_AUTHORIZATION_IMAGE: id, WEPUU_CONTROL_IMAGE: id,
  WEPUU_TEST_IMAGE: id, WEPUU_AUTHORIZATION_REVISION: revision, WEPUU_CONTROL_REVISION: revision, WEPUU_TEST_REVISION: revision };
test('integration requires explicit immutable images, revisions and context', () => {
  assert.equal(integrationOptions(env).images.test, id);
  for (const key of Object.keys(env)) assert.throws(() => integrationOptions({ ...env, [key]: undefined }));
  assert.throws(() => integrationOptions({ ...env, WEPUU_TEST_IMAGE: 'wepuu-test:candidate' }));
  assert.throws(() => integrationOptions({ ...env, WEPUU_TEST_LEGACY_CONSOLE: 'yes' }));
});
test('only one exact local context is accepted', () => {
  verifyIntegrationContext([{ Name: 'desktop-linux', Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }], 'desktop-linux');
  for (const Host of ['tcp://localhost:2375', 'ssh://host', 'unix://remote/run/docker.sock'])
    assert.throws(() => verifyIntegrationContext([{ Name: 'desktop-linux', Endpoints: { docker: { Host } } }], 'desktop-linux'));
});
test('release metadata must retain exact identity, revision, user and direct main', () => {
  const image = { Id: id, Os: 'linux', Architecture: 'amd64', Config: { User: 'node', Cmd: ['node', 'apps/authorization-service/dist/main.js'],
    Labels: { 'org.opencontainers.image.revision': revision }, Entrypoint: ['docker-entrypoint.sh'] } };
  assert.equal(verifyIntegrationImage([image], id, 'authorization', revision).directMain, true);
  for (const change of [{ User: 'root' }, { Cmd: ['sh', '-c', 'migrate && node main'] }, { Entrypoint: ['unsafe'] }, { Labels: {} }])
    assert.throws(() => verifyIntegrationImage([{ ...image, Config: { ...image.Config, ...change } }], id, 'authorization', revision));
  assert.throws(() => verifyIntegrationImage([], id, 'authorization', revision));
  assert.equal(verifyIntegrationImage([{ ...image, Config: { ...image.Config, User: '', Cmd: ['pnpm', 'check'] } }], id, 'test', revision).defaultUser, 'root');
});
test('disk gates reject insufficient or invalid space without relaxing limits', () => {
  verifyDiskBudget(5 * 1024 ** 3, true); verifyDiskBudget(2 * 1024 ** 3);
  for (const bytes of [NaN, Infinity, -1, null, 5 * 1024 ** 3 - 1]) assert.throws(() => verifyDiskBudget(bytes, true));
});
test('all three isolated probes must match fixed Node, UID and compiled inputs', () => {
  const p = { version: 'v24.22.1', lts: 'Krypton', uid: 1000, hash: 'c'.repeat(64), files: 20 };
  assert.equal(verifyCompiledIdentity([p, p, p]).fileCount, 20);
  for (const change of [{ version: 'v26.11.1' }, { uid: 0 }, { hash: 'd'.repeat(64) }, { files: 21 }])
    assert.throws(() => verifyCompiledIdentity([p, p, { ...p, ...change }]));
  assert.throws(() => verifyCompiledIdentity([p, p]));
});
test('cleanup cannot accept running containers or another run owner', () => {
  const m = { Config: { Labels: { 'wepuu.run': 'abc' } }, State: { Running: false } };
  verifyOwnedStopped(m, 'abc'); assert.throws(() => verifyOwnedStopped(m, 'def'));
  assert.throws(() => verifyOwnedStopped({ ...m, State: { Running: true } }, 'abc'));
});
test('only fixed public failure codes are retained', () => {
  assert.equal(integrationFailure({ code: 'DISK_BUDGET_NOT_MET' }), 'DISK_BUDGET_NOT_MET');
  assert.equal(integrationFailure({ code: 'SECRET_SENTINEL', message: 'SECRET_SENTINEL' }), 'IMAGE_TEST_STOPPED');
  assert.equal(integrationFailure({ killed: true }), 'TIMEOUT');
});
