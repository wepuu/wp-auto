import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpsRevocationDelivery, revocationEndpoint, RevocationWorker } from './revocation-worker.js';
import { FailureInjector, ManualFaultClock, assertContentFreeEvidence } from './phase-2-0-6-fixtures.js';

test('revocation endpoint is fixed to the paired resource origin', () => {
  assert.equal(
    revocationEndpoint('https://site.example.test/wp-json/wp-auto/mcp').href,
    'https://site.example.test/wp-json/wp-auto/v1/revocations'
  );
  assert.throws(() => revocationEndpoint('https://site.example.test/other'));
  assert.throws(() => revocationEndpoint('https://127.0.0.1/wp-json/wp-auto/mcp?x=1'));
  assert.throws(() => revocationEndpoint('https://site.example.test:444/wp-json/wp-auto/mcp'));
});

test('HTTPS delivery pins one public address and never follows a response itself', async () => {
  const observed: Array<{ endpoint: string; body: string; address: string }> = [];
  const delivery = new HttpsRevocationDelivery({
    resolve: async (hostname) => {
      assert.equal(hostname, 'site.example.test');
      return ['8.8.8.8', '1.1.1.1'];
    },
    request: async (endpoint, body, address) => {
      observed.push({ endpoint: endpoint.href, body: body.toString('utf8'), address });
    }
  });
  await delivery.send('https://site.example.test/wp-json/wp-auto/mcp', 'header.payload.signature');
  assert.deepEqual(observed, [{
    endpoint: 'https://site.example.test/wp-json/wp-auto/v1/revocations',
    body: 'header.payload.signature',
    address: '8.8.8.8'
  }]);
});

test('HTTPS delivery rejects private or empty DNS results before transport', async () => {
  let requests = 0;
  for (const addresses of [[], ['127.0.0.1'], ['10.0.0.7'], ['::1']]) {
    const delivery = new HttpsRevocationDelivery({
      resolve: async () => addresses,
      request: async () => { requests += 1; }
    });
    await assert.rejects(
      delivery.send('https://site.example.test/wp-json/wp-auto/mcp', 'header.payload.signature'),
      /unsafe_destination/u
    );
  }
  assert.equal(requests, 0);
});

test('HTTPS delivery bounds the signed control event before DNS or network access', async () => {
  let resolved = false;
  const delivery = new HttpsRevocationDelivery({
    resolve: async () => { resolved = true; return ['8.8.8.8']; }
  });
  await assert.rejects(
    delivery.send('https://site.example.test/wp-json/wp-auto/mcp', 'x'.repeat(16 * 1024 + 1)),
    /revocation_event_too_large/u
  );
  assert.equal(resolved, false);
});

test('worker signs only bounded control metadata and acknowledges success', async () => {
  const signed: Array<Record<string, unknown>> = [];
  const delivered: string[] = [];
  const acknowledged: string[] = [];
  const deferred: string[] = [];
  const record = {
    id: '7', tenantId: '11111111-1111-4111-8111-111111111111', siteId: 'site_00000001',
    resource: 'https://site.example.test/wp-json/wp-auto/mcp', sequence: 4,
    eventType: 'grant' as const, grantId: 'grant_00000001', reason: 'refresh_replay', attempts: 1
  };
  const worker = new RevocationWorker({
    outbox: {
      claim: async () => [record],
      markDelivered: async (id: string) => { acknowledged.push(id); },
      reschedule: async (id: string) => { deferred.push(id); }
    } as never,
    signer: { sign: async (input: Record<string, unknown>) => { signed.push(input); return 'header.payload.signature'; } } as never,
    delivery: { send: async (_resource, compact) => { delivered.push(compact); } },
    issuer: 'https://auth.example.test',
    now: () => new Date('2026-09-24T00:00:00Z')
  });
  assert.deepEqual(await worker.runOnce(), { delivered: 1, deferred: 0 });
  assert.deepEqual(acknowledged, ['7']);
  assert.deepEqual(deferred, []);
  assert.equal(delivered[0], 'header.payload.signature');
  assert.deepEqual(Object.keys(signed[0] ?? {}).sort(), [
    'eventType', 'grantId', 'issuer', 'reason', 'resource', 'sequence', 'siteId', 'tenantId'
  ]);
});

test('worker defers a failed delivery without acknowledging the event', async () => {
  const acknowledged: string[] = [];
  const deferred: Array<{ id: string; code: string; delay: number }> = [];
  const record = {
    id: '8', tenantId: '11111111-1111-4111-8111-111111111111', siteId: 'site_00000001',
    resource: 'https://site.example.test/wp-json/wp-auto/mcp', sequence: 5,
    eventType: 'site' as const, reason: 'site_disconnected', attempts: 3
  };
  const worker = new RevocationWorker({
    outbox: {
      claim: async () => [record],
      markDelivered: async (id: string) => { acknowledged.push(id); },
      reschedule: async (id: string, code: string, delay: number) => { deferred.push({ id, code, delay }); }
    } as never,
    signer: { sign: async () => 'header.payload.signature' } as never,
    delivery: { send: async () => { throw new Error('connector_unavailable'); } },
    issuer: 'https://auth.example.test'
  });
  assert.deepEqual(await worker.runOnce(), { delivered: 0, deferred: 1 });
  assert.deepEqual(acknowledged, []);
  assert.deepEqual(deferred, [{ id: '8', code: 'delivery_failed', delay: 8 }]);
});

test('fault injection retries a transient delivery without changing the content-free event contract', async () => {
  const faults = new FailureInjector();
  const clock = new ManualFaultClock(new Date('2026-09-29T00:00:00.000Z'));
  faults.fail('delivery.timeout');
  let attempts = 0;
  const deferred: number[] = [];
  const acknowledged: string[] = [];
  const record = {
    id: '9', tenantId: '11111111-1111-4111-8111-111111111111', siteId: 'site_00000001',
    resource: 'https://site.example.test/wp-json/wp-auto/mcp', sequence: 6,
    eventType: 'site' as const, reason: 'site_disconnected', attempts: 0
  };
  const worker = new RevocationWorker({
    outbox: {
      claim: async () => attempts < 2 ? [record] : [],
      markDelivered: async (id: string) => { acknowledged.push(id); },
      reschedule: async (_id: string, _code: string, delay: number) => { deferred.push(delay); }
    } as never,
    signer: { sign: async () => 'header.payload.signature' } as never,
    delivery: {
      send: async (_resource, event) => {
        attempts += 1;
        assertContentFreeEvidence({ event, resource: _resource, at: clock.now().toISOString() });
        if (faults.trip('delivery.timeout')) throw new Error('timeout');
      }
    },
    issuer: 'https://auth.example.test',
    now: () => clock.now()
  });
  assert.deepEqual(await worker.runOnce(), { delivered: 0, deferred: 1 });
  clock.advance(8_000);
  assert.deepEqual(await worker.runOnce(), { delivered: 1, deferred: 0 });
  assert.deepEqual(deferred, [1]);
  assert.deepEqual(acknowledged, ['9']);
});
