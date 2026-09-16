import { open, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const temp = resolve(root, '.tmp');
const home = resolve(temp, 'codex-client');
const stdoutPath = resolve(temp, 'codex-login.stdout.tmp');
const stderrPath = resolve(temp, 'codex-login.stderr.tmp');
const pidPath = resolve(temp, 'codex-login.pid');
const codex = process.env.CODEX_BIN || 'C:\\Users\\admin\\AppData\\Roaming\\npm\\codex.cmd';
const ca = resolve(temp, 'caddy-root.crt');
const browserCapture = resolve(import.meta.dirname, 'capture-browser-url.cmd');

await mkdir(home, { recursive: true });
await Promise.all([stdoutPath, stderrPath, pidPath].map((path) => rm(path, { force: true })));
const [stdout, stderr] = await Promise.all([open(stdoutPath, 'w'), open(stderrPath, 'w')]);
const env = { ...process.env, CODEX_HOME: home, SSL_CERT_FILE: ca, NO_PROXY: 'auth.example.test,site-a.example.test,127.0.0.1,localhost' };
env.BROWSER = browserCapture;
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key];
const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', codex, 'mcp', 'login', 'wepuu-conformance', '--scopes', 'mcp:read', '--oauth-client-registration', 'dcr'], {
  cwd: root,
  env,
  windowsHide: true,
  detached: true,
  stdio: ['ignore', stdout.fd, stderr.fd]
});
child.unref();
await writeFile(pidPath, `${child.pid}\n`, { mode: 0o600 });
await Promise.all([stdout.close(), stderr.close()]);
console.log(JSON.stringify({ started: true, pid: child.pid, isolatedHome: true }));
