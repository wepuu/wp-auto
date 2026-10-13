import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('Docker Compose renders the isolated template using dummy credentials only', (t) => {
  const docker = process.env.WEPUU_TEST_DOCKER_BINARY ?? 'docker';
  const result = spawnSync(docker, ['compose', '--env-file', process.platform === 'win32' ? 'NUL' : '/dev/null',
    '-f', templatePath, '--profile', 'tools', 'config', '--format', 'json'], {
    encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, WPAUTO_E2E_B_DATABASE_PASSWORD: 'fixture-only-password',
      WPAUTO_E2E_B_DATABASE_ROOT_PASSWORD: 'fixture-only-root-password', COMPOSE_PROFILES: '' },
  });
  if (result.error?.code === 'ENOENT') { t.skip('Docker CLI unavailable; render is not claimed as passed'); return; }
  assert.equal(result.status, 0, 'compose render must succeed');
  const config = JSON.parse(result.stdout);
  assert.equal(config.name, 'wpauto-wordpress-e2e-b');
  assert.equal(config.services.database.ports, undefined);
  assert.deepEqual(config.services.wordpress.ports.map(({ host_ip, published, target }) => [host_ip, published, target]),
    [['127.0.0.1', '3201', 80]]);
  assert.equal(Number(config.services.wordpress.mem_limit), 512 * 1024 * 1024);
  assert.equal(Number(config.services.database.mem_limit), 384 * 1024 * 1024);
  assert.equal(config.networks.backend.ipam.config[0].subnet, '172.30.52.0/24');
  assert.equal(config.volumes['database-data'].name, 'wpauto_wordpress_e2e_b_database');
  assert.equal(config.volumes['wordpress-data'].name, 'wpauto_wordpress_e2e_b_files');
  assert.equal(config.services.database.restart, 'no');
  assert.equal(config.services.wordpress.restart, 'no');
  assert.equal(config.services.wpcli.restart, 'no');
});
