import assert from 'node:assert/strict';
import test from 'node:test';
import { createResourceGrantLoader, grantFailureDiagnostic, GrantDiagnosticError,
  type ResourceGrantLoader, type ResourceGrantResolver } from '../src/index.js';

const resource = 'https://site.example.test/wp-json/wp-auto/mcp';
const other = 'https://other.example.test/wp-json/wp-auto/mcp';
const binding = { subjectId: 'account_TEST_ONLY', clientId: 'client_TEST_ONLY', resource,
  scopes: ['mcp:read'], grantId: 'grant_TEST_ONLY' };
function context(overrides: Record<string, unknown> = {}): Parameters<ResourceGrantLoader>[0] {
  const grant = { jti: binding.grantId, accountId: binding.subjectId, clientId: binding.clientId,
    resources: { [resource]: 'mcp:read' }, getResourceScope: () => 'mcp:read',
    getOIDCScope: () => '', getOIDCClaims: () => [], ...overrides['grant'] as object };
  return { oidc: { account: { accountId: binding.subjectId }, client: { clientId: binding.clientId },
    params: { resource, scope: 'mcp:read', ...overrides['params'] as object },
    result: overrides['result'],
    session: { grantIdFor: () => { throw new Error('session_pointer_must_not_be_read'); } },
    provider: { Grant: { async find() { return overrides['missing'] === true ? undefined : grant; } } }
  } } as unknown as Parameters<ResourceGrantLoader>[0];
}
const active = { isActive: () => Promise.resolve(true) };
function resolver(override: object = {}): ResourceGrantResolver {
  return { resolveExact: () => Promise.resolve({ ...binding, ...override }) };
}
async function rejects(ctx: Parameters<ResourceGrantLoader>[0], category: string, query = resolver()) {
  await assert.rejects(async () => createResourceGrantLoader(query, active)(ctx), (error: unknown) =>
    error instanceof GrantDiagnosticError && error.category === category);
}

test('resource loader ignores the last Client Session Grant and does not create/persist grants', async () => {
  const loaded = await createResourceGrantLoader(resolver(), active)(context());
  assert.equal(loaded?.jti === binding.grantId, true);
  assert.equal(await createResourceGrantLoader({ resolveExact: () => Promise.resolve(undefined) }, active)(context()), undefined);
  assert.equal(await createResourceGrantLoader(resolver(), active)(context({ missing: true })), undefined);
  await rejects(context({ missing: true, result: { consent: { grantId: binding.grantId } } }), 'grant.provider_missing');
  await rejects(context({ result: { consent: { grantId: 'grant_OTHER_ONLY' } } }), 'grant.binding_mismatch');
});

test('authoritative binding and stored Provider Grant must match every resource boundary', async () => {
  for (const [field, value, category] of [
    ['subjectId', 'account_OTHER', 'grant.account_mismatch'], ['clientId', 'client_OTHER', 'grant.client_mismatch'],
    ['resource', other, 'grant.resource_mismatch'], ['scopes', ['mcp:read', 'mcp:content.write'], 'grant.scope_mismatch']
  ] as const) await rejects(context(), category, resolver({ [field]: value }));
  for (const [field, value, category] of [
    ['jti', 'grant_OTHER', 'grant.binding_mismatch'], ['accountId', 'account_OTHER', 'grant.account_mismatch'],
    ['clientId', 'client_OTHER', 'grant.client_mismatch'], ['resources', { [resource]: 'mcp:read', [other]: 'mcp:read' }, 'grant.resource_mismatch'],
    ['getResourceScope', () => 'mcp:content.write', 'grant.scope_mismatch'],
    ['getOIDCScope', () => 'email', 'grant.scope_mismatch'], ['getOIDCClaims', () => ['email'], 'grant.scope_mismatch'],
    ['rar', [], 'grant.scope_mismatch']
  ] as const) await rejects(context({ grant: { [field]: value } }), category);
  await rejects(context({ params: { resource: [resource, other] } }), 'grant.resource_mismatch');
  await rejects(context({ params: { resource: `${resource}?unexpected=1` } }), 'grant.resource_mismatch');
  await rejects(context({ params: { scope: 'mcp:read email' } }), 'grant.scope_mismatch');
  await rejects(context({ params: { scope: 'openid' } }), 'grant.scope_mismatch');
});

test('lookup failure and inactive account fail closed without leaking causes', async () => {
  const sentinel = 'secret-token-cookie-code-raw-grant-uid-test';
  await assert.rejects(async () => createResourceGrantLoader(resolver(), { isActive: () => Promise.resolve(false) })(context()),
    (error: unknown) => error instanceof GrantDiagnosticError && error.category === 'grant.account_mismatch');
  const failing: ResourceGrantResolver = { resolveExact: () => Promise.reject(new Error(sentinel)) };
  try { await createResourceGrantLoader(failing, active)(context()); assert.fail('expected_fixed_error'); }
  catch (error) {
    const record = grantFailureDiagnostic(error);
    assert.deepEqual(Object.keys(record).sort(), ['category', 'event', 'occurredAt', 'stage']);
    assert.equal(record.category, 'grant.lookup_failed');
    assert.equal(JSON.stringify(record).includes(sentinel), false);
  }
  const unknown = grantFailureDiagnostic(new Error(sentinel));
  assert.equal(unknown.category, 'unknown');
  assert.equal(JSON.stringify(unknown).includes(sentinel), false);
  for (const stage of ['binding', 'grant_load', 'consent_plan', 'grant_save', 'interaction_finish', 'interaction'] as const) {
    assert.equal(Object.keys(grantFailureDiagnostic(new Error(sentinel), stage)).length, 4);
  }
});
