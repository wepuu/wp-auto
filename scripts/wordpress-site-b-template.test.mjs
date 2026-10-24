import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const templatePath = 'deploy/wpauto-vps/compose.wordpress-e2e-b.yaml';

test('Site B DNS-01 ingress uses dedicated TLS files and loopback target only', async () => {
  const source = await readFile('deploy/wpauto-vps/nginx.test2.wpauto.cc.conf', 'utf8');
  assert.equal((source.match(/server_name test2\.wpauto\.cc;/gu) ?? []).length, 2);
  assert.ok(source.includes('return 301 https://test2.wpauto.cc$request_uri;'));
  assert.ok(source.includes('proxy_pass http://127.0.0.1:3201;'));
  assert.ok(source.includes('ssl_certificate /www/server/panel/vhost/letsencrypt/test2.wpauto.cc/fullchain.pem;'));
  assert.ok(source.includes('ssl_certificate_key /www/server/panel/vhost/letsencrypt/test2.wpauto.cc/privkey.pem;'));
  assert.ok(source.includes('proxy_set_header X-Forwarded-Proto https;'));
  assert.ok(!/test\.wpauto\.cc|auth\.wpauto\.cc|app\.wpauto\.cc|3200|3000|3001|ssl_verify_client off/u.test(source));
});

test('Site B template freezes distinct project, volumes, subnet, loopback ingress and images', async () => {
  const a = await readFile('deploy/wpauto-vps/compose.wordpress-e2e.yaml', 'utf8');
  const b = await readFile(templatePath, 'utf8');
  for (const value of ['name: wpauto-wordpress-e2e-b', '127.0.0.1:3201:80',
    'wpauto_wordpress_e2e_b_internal', '172.30.52.0/24', 'wpauto_wordpress_e2e_b_database',
    'wpauto_wordpress_e2e_b_files', 'https://test2.wpauto.cc', 'wpauto_e2e_b',
    '${WPAUTO_E2E_B_DATABASE_PASSWORD:?}', '${WPAUTO_E2E_B_DATABASE_ROOT_PASSWORD:?}',
    'mem_limit: 384m', 'mem_limit: 512m', 'profiles: [tools]', './artifacts:/artifacts:ro']) {
    assert.ok(b.includes(value), value);
  }
  assert.deepEqual([...b.matchAll(/image: (.+)/gu)].map((match) => match[1]),
    [...a.matchAll(/image: (.+)/gu)].map((match) => match[1]));
  assert.ok(!b.includes('${WPAUTO_E2E_DATABASE_PASSWORD'));
  assert.ok(!b.includes('127.0.0.1:3200'));
  assert.ok(!/external:|container_name:|privileged:|network_mode:|\/opt\/wpauto\/|\/var\/run\/docker.sock/u.test(b));
  assert.equal((b.match(/ports:/gu) ?? []).length, 1);
  assert.equal((b.match(/restart: "no"/gu) ?? []).length, 3);
  assert.ok(!b.includes('restart: unless-stopped'));
});

// The third original case is REQUIRED in run-r14-composite.mjs on the host.
// Every rendered-model assertion lives in wordpress-site-b-render-contract.mjs.
// These two static cases alone are not the composite acceptance gate.
