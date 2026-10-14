import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { EXPECTED_TOOLS } from './test-production-wordpress-oauth.mjs';
import { RESOURCE, runApplicationPasswordAcceptance } from './test-production-application-password.mjs';

function fixture(change = {}) {
  const calls = [], lines = [], operations = [];
  const password = 'sentinel-application-password', cookie = 'sentinel-cookie', nonce = 'sentinel-nonce';
  const basic = `Basic ${Buffer.from(`temporary:${password}`).toString('base64')}`;
  let revoked = false;
  const json = result => new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'mcp-session-id': 'isolated-session' } });
  const admin = async action => {
    operations.push(action);
    if (action === 'preflight') return { supported: true, subscribers: 0 };
    if (action === 'create') {
      if (change.createFails) throw new Error(password);
      return { userId: 7, login: 'temporary', password, uuid: 'test-only', subscriber: true };
    }
    if (action === 'ambient') return { cookie, nonce };
    revoked = true;
    return { passwordRevoked: true, userDeleted: true };
  };
  const request = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (url.endsWith('/users/me')) return json({ id: change.cookieWrong && init.headers.cookie ? 8 : 7 });
    assert.equal(url, RESOURCE);
    const auth = init.headers.authorization;
    if (auth?.startsWith('Bearer ')) return new Response('', { status: change.bearerAccepts ? 200 : 401,
      headers: { 'www-authenticate': 'Bearer error="invalid_token"' } });
    if (revoked || auth !== basic) return new Response('', { status: 401 });
    const body = JSON.parse(init.body);
    if (change.networkFails) throw new Error(password);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'initialize') return json({ result: { protocolVersion: '2025-06-18' } });
    if (body.method === 'tools/list') return json({ result: { tools: (change.badCatalog ? EXPECTED_TOOLS.slice(1) : EXPECTED_TOOLS).map(name => ({ name })) } });
    assert.equal(body.method, 'tools/call');
    if (body.params.name === 'wp-auto-site-health') return json({ result: { isError: !!change.healthFails,
      content: [{ type: 'text', text: 'sentinel-wordpress-response' }] } });
    assert.equal(body.params.name, 'wp-auto-media-search');
    return json({ result: { isError: !change.permissionAllows, structuredContent: null,
      content: [{ type: 'text', text: 'Permission denied' }] } });
  };
  return { admin, request, report: line => lines.push(line), calls, lines, operations, password, cookie, nonce };
}

test('Basic-only direct MCP, frozen catalog, permission denial, cookie nonfallback and exact cleanup pass', async () => {
  const f = fixture(); await runApplicationPasswordAcceptance(f);
  assert.deepEqual(f.operations, ['preflight', 'create', 'ambient', 'cleanup']);
  for (const name of ['MCP_INITIALIZE', 'TOOL_CATALOG_23', 'SITE_HEALTH', 'NATIVE_PERMISSION_DENIAL',
    'BASIC_WRONG_DENIED', 'MISSING_AUTH_DENIED', 'INVALID_BEARER_NO_COOKIE_FALLBACK',
    'REVOKED', 'TEMPORARY_USER_DELETED', 'REVOKED_CREDENTIAL_DENIED']) {
    assert.ok(f.lines.includes(`APPLICATION_PASSWORD_${name}=True`));
  }
  const text = f.lines.join('\n');
  for (const secret of [f.password, f.cookie, f.nonce, 'sentinel-wordpress-response']) assert.ok(!text.includes(secret));
  assert.ok(f.calls.every(({ url }) => url.startsWith('https://test2.wpauto.cc/')));
  assert.ok(f.calls.every(({ init }) => !String(init.headers.authorization).includes(',')));
  assert.ok(f.calls.every(({ init }) => !/refresh_token|revocation|grant_type/u.test(init.body ?? '')));
});

for (const flag of ['badCatalog', 'healthFails', 'permissionAllows', 'bearerAccepts', 'cookieWrong', 'networkFails']) {
  test(`${flag} fails closed, cleans the single credential and never exposes errors`, async () => {
    const f = fixture({ [flag]: true });
    await assert.rejects(runApplicationPasswordAcceptance(f));
    assert.equal(f.operations.filter(x => x === 'create').length, 1);
    assert.equal(f.operations.filter(x => x === 'cleanup').length, 1);
    assert.ok(f.lines.includes('APPLICATION_PASSWORD_REVOKED=True'));
    assert.ok(!f.lines.join('\n').includes(f.password));
  });
}

test('create response failure still attempts exact run cleanup once', async () => {
  const f = fixture({ createFails: true });
  await assert.rejects(runApplicationPasswordAcceptance(f));
  assert.deepEqual(f.operations, ['preflight', 'create', 'cleanup']);
});

test('unsupported or preexisting Subscriber state stops before mutation', async () => {
  for (const pre of [{ supported: false, subscribers: 0 }, { supported: true, subscribers: 1 }]) {
    const f = fixture(); f.admin = async action => { assert.equal(action, 'preflight'); return pre; };
    await assert.rejects(runApplicationPasswordAcceptance(f), /application_identity_review_required/u);
    assert.deepEqual(f.operations, []);
  }
});

test('Core helper uses native exact-password deletion and dependency-gated test-user removal', async () => {
  const source = await readFile(new URL('./p3b3-application-password-core.php', import.meta.url), 'utf8');
  assert.ok(source.includes('WP_Application_Passwords::create_new_application_password'));
  assert.ok(source.includes('WP_Application_Passwords::delete_application_password'));
  assert.ok(!source.includes('delete_all_application_passwords'));
  assert.ok(source.includes('$posts || $comments || $links'));
  assert.ok(source.includes("get_user_meta($user->ID, 'wepuu_p3b3_run', true) !== $run"));
  const bootstrap = source.indexOf("require '/var/www/html/wp-load.php'");
  assert.ok(bootstrap >= 0);
  assert.ok(source.indexOf('$action = $p3b3_action;') > bootstrap);
  assert.ok(source.indexOf('$run = $p3b3_run;') > bootstrap);
});
