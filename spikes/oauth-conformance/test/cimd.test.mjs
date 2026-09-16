import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchClientIdMetadata, validateClientIdMetadataUrl } from '../src/cimd.mjs';

const CLIENT_ID = 'https://client.example.test/metadata.json';

test('CIMD requires an HTTPS URL and exact client_id binding', async () => {
  assert.equal(validateClientIdMetadataUrl(CLIENT_ID), CLIENT_ID);
  assert.throws(() => validateClientIdMetadataUrl('http://client.example.test/metadata.json'), /invalid_cimd_client_id/);
  assert.throws(() => validateClientIdMetadataUrl('https://user:pass@client.example.test/metadata.json'), /invalid_cimd_client_id/);
  const fetcher = async () => new Response(JSON.stringify({ client_id: CLIENT_ID, token_endpoint_auth_method: 'none' }), { status: 200 });
  await assert.doesNotReject(() => fetchClientIdMetadata(CLIENT_ID, { fetcher }));
  await assert.rejects(() => fetchClientIdMetadata(CLIENT_ID, {
    fetcher: async () => new Response(JSON.stringify({ client_id: 'https://other.example.test', token_endpoint_auth_method: 'none' }), { status: 200 })
  }), /cimd_client_id_mismatch/);
});

test('CIMD rejects shared secrets, non-HTTPS metadata, and oversized documents', async () => {
  await assert.rejects(() => fetchClientIdMetadata(CLIENT_ID, {
    fetcher: async () => new Response(JSON.stringify({ client_id: CLIENT_ID, token_endpoint_auth_method: 'client_secret_post' }), { status: 200 })
  }), /cimd_shared_secret_forbidden/);
  await assert.rejects(() => fetchClientIdMetadata(CLIENT_ID, {
    fetcher: async () => new Response(JSON.stringify({ client_id: CLIENT_ID, token_endpoint_auth_method: 'none', logo_uri: 'http://client.example.test/logo' }), { status: 200 })
  }), /cimd_https_uri_required/);
  await assert.rejects(() => fetchClientIdMetadata(CLIENT_ID, {
    maxBytes: 10,
    fetcher: async () => new Response('{"client_id":"https://client.example.test/metadata.json"}', { status: 200 })
  }), /cimd_document_too_large/);
});
