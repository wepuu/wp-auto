import test from 'node:test';
import assert from 'node:assert/strict';
import { Auth0Adapter } from '../src/auth0-adapter.mjs';

test('Auth0 adapter fails closed without a disposable tenant configuration', async () => {
  const adapter = new Auth0Adapter({ domain: undefined, clientId: undefined });
  await assert.rejects(() => adapter.start(), /AUTH0_DOMAIN/);
});

test('Auth0 adapter rejects non-HTTPS tenant origins', async () => {
  const adapter = new Auth0Adapter({ domain: 'http://tenant.example.test', clientId: 'client', resource: 'https://site.example.test/wp-json/wp-auto/mcp' });
  await assert.rejects(() => adapter.start(), /invalid_auth0_domain/);
});

test('Auth0 metadata smoke is opt-in and never runs against an ambient tenant', { skip: !process.env.AUTH0_DOMAIN }, async () => {
  const adapter = new Auth0Adapter();
  const metadata = await adapter.start();
  assert.equal(metadata.issuer, adapter.issuer);
  await adapter.stop();
});
