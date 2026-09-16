import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const codex = process.env.CODEX_BIN || 'C:\\Users\\admin\\AppData\\Roaming\\npm\\codex.cmd';
const resource = process.env.CONFORMANCE_RESOURCE || 'https://site-a.example.test/wp-json/wp-auto/mcp';
await mkdir(resolve(root, '.tmp'), { recursive: true });
const tempHome = await mkdtemp(resolve(root, '.tmp', 'codex-home-'));
const env = { ...process.env, CODEX_HOME: tempHome };
const run = async (args) => {
  if (process.platform !== 'win32') return (await execFileAsync(codex, args, { env, windowsHide: true })).stdout;
  const command = [codex, ...args].join(' ');
  return (await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command], { env, windowsHide: true })).stdout;
};

const modes = [
  { name: 'pre-registered', args: ['--oauth-client-id', 'codex-test-client'] },
  { name: 'cimd', args: ['--oauth-client-registration', 'cimd'] },
  { name: 'dcr', args: ['--oauth-client-registration', 'dcr'] },
  { name: 'automatic-discovery', args: ['--oauth-client-registration', 'auto'] }
];

try {
  const version = (await run(['--version'])).trim();
  const configured = [];
  for (const mode of modes) {
    const name = `wepuu-${mode.name}`;
    await run(['mcp', 'add', name, '--url', resource, '--oauth-resource', resource, ...mode.args]);
    const details = JSON.parse(await run(['mcp', 'get', name, '--json']));
    const serialized = JSON.stringify(details);
    if (!serialized.includes(resource)) throw new Error(`codex_probe_missing_resource:${mode.name}`);
    if (/access_token|refresh_token|cookie/iu.test(serialized)) throw new Error('codex_probe_persisted_secret');
    configured.push({ mode: mode.name, configured: true, exactResource: true });
  }
  const list = JSON.parse(await run(['mcp', 'list', '--json']));
  if (!Array.isArray(list) || list.length !== modes.length) throw new Error('codex_probe_matrix_incomplete');
  console.log(JSON.stringify({ version, isolatedHome: true, configured, browserLogin: 'not-run' }));
} finally {
  await rm(tempHome, { recursive: true, force: true });
}
