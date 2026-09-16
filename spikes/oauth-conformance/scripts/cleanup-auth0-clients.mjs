import { Auth0Adapter } from '../src/auth0-adapter.mjs';

for (const name of ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'CONFORMANCE_RESOURCE', 'AUTH0_MGMT_TOKEN', 'AUTH0_CLEANUP_CLIENT_IDS']) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

if (!/^[\x21-\x7e]+$/.test(process.env.AUTH0_MGMT_TOKEN)) {
  throw new Error('AUTH0_MGMT_TOKEN must be one printable ASCII value');
}

const adapter = new Auth0Adapter();
const results = [];
await adapter.start();
try {
  for (const clientId of process.env.AUTH0_CLEANUP_CLIENT_IDS.split(',').map((value) => value.trim()).filter(Boolean)) {
    const result = await adapter.deleteClient(clientId);
    results.push({ method: 'DELETE', path: '/api/v2/clients/{opaque}', status: result.status });
  }
} finally {
  await adapter.stop();
}

console.log(JSON.stringify({ cleanup: results }));
