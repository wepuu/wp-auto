import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const name = `p3d-ingress-${randomBytes(6).toString('hex')}`;
const directory = await mkdtemp(join(tmpdir(), 'p3d-ingress-'));
const run = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const guard = await readFile('deploy/wpauto-vps/p3d-otp-send-deny.conf', 'utf8');
  await writeFile(join(directory, 'nginx.conf'), `events {} http { server { listen 8080; server_name auth.example.test;
    ${guard}
    location / { return 200 "existing-service"; }
  } }`);
  run(['run', '-d', '--name', name, '--read-only', '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/run',
    '-p', '127.0.0.1::8080', '--mount', `type=bind,source=${join(directory, 'nginx.conf')},target=/etc/nginx/nginx.conf,readonly`,
    'nginx:1.28.0-alpine']);
  const port = JSON.parse(run(['inspect', name]))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort;
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(ready, true);
  run(['exec', name, 'nginx', '-t']);
  for (const path of ['/v1/account/email/send', '/v1/account/email/resend', '/v1/account/email/%73end',
    '//v1/account/email/send', '/v1/account/email/send?retry=1']) {
    assert.equal((await fetch(`${base}${path}`, { method: 'POST', signal: AbortSignal.timeout(2000) })).status, 503);
  }
  assert.equal((await fetch(`${base}/api/auth/email-otp/send-verification-otp`, { method: 'POST' })).status, 404);
  for (const path of ['/v1/account/email/verify', '/v1/account/login', '/app', '/auth', '/token', '/jwks']) {
    assert.equal((await fetch(`${base}${path}`, { method: path.endsWith('verify') ? 'POST' : 'GET' })).status, 200);
  }
  console.log('P3D_ROLLBACK_INGRESS_PASS=True');
} catch {
  console.error('P3D_ROLLBACK_INGRESS_PASS=False');
  process.exitCode = 1;
} finally {
  try { run(['rm', '-f', name]); } catch { /* owned fixture only */ }
  await rm(directory, { recursive: true, force: true });
}
