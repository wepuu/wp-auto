import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const fixedTestRuntime = Object.freeze({ version: 'v24.22.1', lts: 'Krypton', uid: 1000,
  tsxVersion: '4.23.13', entry: '/workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs',
  entrySha256: '7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d' });
export function verifyTestRuntime(value) {
  for (const [key, expected] of Object.entries(fixedTestRuntime)) {
    if (value?.[key] !== expected) throw Object.assign(Error('fixed_test_runtime_denied'), { code: 'TEST_RUNTIME_MISMATCH' });
  }
  return { ...fixedTestRuntime };
}
// Test tooling only: resolve the already installed immutable loader. No pnpm,
// dependency install/check repair, shell, inherited NODE_OPTIONS or service main.
export async function fixedNodeTestCommand() {
  const require = createRequire('/workspace/package.json');
  const entry = await realpath(require.resolve('tsx'));
  const pkg = JSON.parse(await readFile('/workspace/node_modules/tsx/package.json', 'utf8'));
  const identity = verifyTestRuntime({ version: process.version, lts: process.release.lts, uid: process.getuid(),
    tsxVersion: pkg.version, entry, entrySha256: createHash('sha256').update(await readFile(entry)).digest('hex') });
  return { executable: process.execPath,
    args: ['--import=' + pathToFileURL(entry).href, '--test', '--test-concurrency=1'], identity };
}
