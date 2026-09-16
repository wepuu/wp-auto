import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresAdapter } from '../src/postgres-adapter.mjs';
import { createTestJwks, listenProvider, TEST_RESOURCE } from '../src/provider.mjs';
import { listenResourceServer } from '../src/resource-server.mjs';

const issuer = process.env.CONFORMANCE_ISSUER || 'https://auth.example.test';
const resource = process.env.CONFORMANCE_RESOURCE || TEST_RESOURCE;
const tempDir = resolve(import.meta.dirname, '..', '.tmp');
const jwksPath = resolve(tempDir, 'fixture-jwks.json');
const controlTracePath = resolve(tempDir, 'control-trace.jsonl');
const resourceTracePath = resolve(tempDir, 'resource-trace.jsonl');

await mkdir(tempDir, { recursive: true });
await Promise.all([
  writeFile(controlTracePath, ''),
  writeFile(resourceTracePath, '')
]);
const appendTrace = (path) => (entry) => appendFile(path, `${JSON.stringify(entry)}\n`).catch((error) => console.error(error.message));
let jwks;
try {
  jwks = JSON.parse(await readFile(jwksPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  jwks = createTestJwks();
  await writeFile(jwksPath, `${JSON.stringify(jwks)}\n`, { encoding: 'utf8', mode: 0o600 });
}

const adapter = createPostgresAdapter();
const provider = await listenProvider({
  host: '0.0.0.0',
  port: 19001,
  issuer,
  resource,
  jwks,
  adapter,
  proxy: true,
  automaticInteractions: false,
  onTrace: appendTrace(controlTracePath)
});
const resourceServer = await listenResourceServer({
  host: '0.0.0.0',
  port: 19002,
  issuer,
  resource,
  jwksUri: 'http://127.0.0.1:19001/jwks',
  publicOrigin: new URL(resource).origin,
  onTrace: appendTrace(resourceTracePath)
});

console.log(JSON.stringify({ event: 'https_fixture_ready', issuer, resource }));

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await resourceServer.close();
  await provider.close();
  await adapter.close();
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => stop().then(() => process.exit(0), (error) => {
    console.error(error.message);
    process.exit(1);
  }));
}
