import assert from 'node:assert/strict';
import test from 'node:test';
import { interactionResource, normalizeAuthorizationResources } from './server.js';

const resource = 'https://site.example.test/wp-json/wp-auto/mcp';

test('interaction resource accepts a string or bounded identical repetitions', () => {
  assert.equal(interactionResource({ resource }), resource);
  assert.equal(interactionResource({ resource: [resource, resource] }), resource);
  assert.equal(interactionResource({ resource: [resource, resource, resource, resource] }), resource);
});

test('interaction resource rejects ambiguity, invalid types and excessive repetitions', () => {
  assert.equal(interactionResource({}), undefined);
  assert.equal(interactionResource({ resource: [] }), undefined);
  assert.equal(interactionResource({ resource: [resource, 'https://other.example.test/mcp'] }), undefined);
  assert.equal(interactionResource({ resource: [resource, 1] }), undefined);
  assert.equal(interactionResource({ resource: Array(5).fill(resource) }), undefined);
});

test('authorization entrypoint folds only bounded identical resource parameters', () => {
  const duplicated = new URL(`https://platform.example.test/auth?resource=${encodeURIComponent(resource)}&resource=${encodeURIComponent(resource)}`);
  assert.equal(normalizeAuthorizationResources(duplicated), true);
  assert.deepEqual(duplicated.searchParams.getAll('resource'), [resource]);

  const distinct = new URL(`https://platform.example.test/auth?resource=${encodeURIComponent(resource)}&resource=${encodeURIComponent('https://other.example.test/mcp')}`);
  assert.equal(normalizeAuthorizationResources(distinct), false);
  const excessive = new URL('https://platform.example.test/auth');
  for (let index = 0; index < 5; index += 1) excessive.searchParams.append('resource', resource);
  assert.equal(normalizeAuthorizationResources(excessive), false);
  assert.equal(normalizeAuthorizationResources(new URL('https://platform.example.test/auth?resource=')), false);
});
