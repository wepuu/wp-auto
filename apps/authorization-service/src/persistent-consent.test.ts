import assert from 'node:assert/strict';
import test from 'node:test';
import { PersistentAuthorizationPolicy } from '@wepuu/oauth-provider';
import { PersistentConsentController } from './persistent-consent.js';
import { signCsrf } from './server.js';

const origin = 'https://auth.example.test';
const key = 'synthetic-consent-test-key-0000000000000000';
const uid = 'interaction_FAKE_TEST';
const account = 'account_FAKE_TEST';
const binding = { subjectId: account, tenantId: '11111111-1111-4111-8111-111111111111',
  siteId: 'site_FAKE_TEST', grantId: 'grant_FAKE_TEST', clientId: 'client_FAKE_TEST',
  resource: 'https://site.example.test/wp-json/wp-auto/mcp', scopes: ['mcp:read'] as const };
const headers = { method: 'POST', contentType: 'application/x-www-form-urlencoded', origin };
function fixture(mode: 'guard-only' | 'explicit-consent' = 'explicit-consent') {
  let count = 0;
  let live = true;
  const controller = new PersistentConsentController({ origin, csrfKey: key,
    policy: new PersistentAuthorizationPolicy(mode),
    async resolve(requestUid, requestAccount) {
      return live && requestUid === uid && requestAccount === account ? binding : undefined;
    },
    async approve(input) { assert.equal(input.explicitApproval, true); assert.equal(input.grantId, binding.grantId); count += 1; }
  });
  const form = () => new URLSearchParams({ csrf: signCsrf({ uid, accountId: account,
    grantId: binding.grantId, expiresAt: Math.floor(Date.now() / 1000) + 60,
    nonce: 'a'.repeat(32) }, key), decision: 'approve' });
  return { controller, form, count: () => count, removeBinding: () => { live = false; } };
}

test('persistent choice is unchecked and requires its exact value; ordinary consent writes no receipt', async () => {
  const f = fixture();
  const html = await f.controller.fields(uid, account);
  assert(html.includes('type="checkbox"'));
  assert(!/type="checkbox"[^>]*\bchecked\b/u.test(html));
  assert.deepEqual(await f.controller.submit(uid, account, headers, f.form()), { approved: true, persistent: false });
  assert.equal(f.count(), 0);
  const selected = f.form(); selected.set('persistent', 'approve-readonly-persistent');
  assert.deepEqual(await f.controller.submit(uid, account, headers, selected), { approved: true, persistent: true });
  assert.equal(f.count(), 1);
});

test('form rejects forged fields, duplicate choices, invalid CSRF and stale account binding', async () => {
  const f = fixture();
  for (const change of [(form: URLSearchParams) => { form.set('csrf', 'invalid'); },
    (form: URLSearchParams) => { form.set('tenant_id', binding.tenantId); },
    (form: URLSearchParams) => { form.set('persistent', 'true'); },
    (form: URLSearchParams) => { form.append('decision', 'approve'); },
    (form: URLSearchParams) => { form.append('csrf', form.get('csrf') ?? ''); }]) {
    const form = f.form(); change(form);
    await assert.rejects(() => f.controller.submit(uid, account, headers, form), /persistent_consent_denied/u);
  }
  await assert.rejects(() => f.controller.submit(uid, account, { ...headers, origin: 'https://other.example.test' }, f.form()));
  await assert.rejects(() => f.controller.submit(uid, 'account_OTHER_TEST', headers, f.form()));
  f.removeBinding();
  await assert.rejects(() => f.controller.submit(uid, account, headers, f.form()));
  assert.equal(f.count(), 0);
});

test('guard-only hides the persistent choice and rejects stale persistent approval', async () => {
  const f = fixture('guard-only');
  assert(!(await f.controller.fields(uid, account)).includes('type="checkbox"'));
  const selected = f.form(); selected.set('persistent', 'approve-readonly-persistent');
  await assert.rejects(() => f.controller.submit(uid, account, headers, selected));
  assert.equal(f.count(), 0);
  assert.deepEqual(await f.controller.submit(uid, account, headers, f.form()), { approved: true, persistent: false });
});
