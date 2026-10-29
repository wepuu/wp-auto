import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { assertSiteBRender, renderProjection, renderInvocation, compositeGate } from './wordpress-site-b-render-contract.mjs';
const fixture = () => ({ name: 'wpauto-wordpress-e2e-b', services: {
  database: { mem_limit: 384 * 1024 ** 2, restart: 'no' },
  wordpress: { ports: [{ host_ip: '127.0.0.1', published: '3201', target: 80 }], mem_limit: 512 * 1024 ** 2, restart: 'no' },
  wpcli: { restart: 'no' } }, networks: { backend: { ipam: { config: [{ subnet: '172.30.52.0/24' }] } } },
  volumes: { 'database-data': { name: 'wpauto_wordpress_e2e_b_database' }, 'wordpress-data': { name: 'wpauto_wordpress_e2e_b_files' } } });
const completed = output => ({ output, exitCode: 0, signal: null });
const cases = [
  ['original_assertions_byte_equivalent', async () => {
    const original = (await promisify(execFile)('git', ['show', '31c6ced:scripts/wordpress-site-b-template.test.mjs'], { windowsHide: true, timeout: 5000 })).stdout;
    const source = await readFile(new URL('./wordpress-site-b-render-contract.mjs', import.meta.url), 'utf8');
    const extract = v => v.replaceAll('\r\n', '\n').match(/  assert\.equal\(config\.name,[\s\S]*?  assert\.equal\(config\.services\.wpcli\.restart, 'no'\);/u)?.[0];
    assert(extract(original)); assert.equal(extract(original), extract(source));
    const current = await readFile(new URL('./wordpress-site-b-template.test.mjs', import.meta.url), 'utf8');
    const oldStatic = original.replaceAll('\r\n', '\n').split("test('Docker Compose renders")[0].split('const templatePath')[1].trim();
    const newStatic = current.replaceAll('\r\n', '\n').split('// The third original case')[0].split('const templatePath')[1].trim();
    assert.equal(oldStatic, newStatic);
  }],
  ['valid_model_and_projection', async () => {
    assertSiteBRender(fixture()); assert(renderProjection(completed(JSON.stringify(fixture()))).passed);
  }],
  ['all_eleven_original_assertions_reject_mutation', async () => {
    const changes = [v => { v.name = 'other'; }, v => { v.services.database.ports = []; },
      v => { v.services.wordpress.ports[0].host_ip = '0.0.0.0'; },
      v => { v.services.wordpress.mem_limit = 1; }, v => { v.services.database.mem_limit = 1; },
      v => { v.networks.backend.ipam.config[0].subnet = 'other'; },
      v => { v.volumes['database-data'].name = 'other'; }, v => { v.volumes['wordpress-data'].name = 'other'; },
      v => { v.services.database.restart = 'always'; }, v => { v.services.wordpress.restart = 'always'; },
      v => { v.services.wpcli.restart = 'always'; }];
    for (const change of changes) { const v = fixture(); change(v); assert.throws(() => assertSiteBRender(v));
      assert.equal(renderProjection(completed(JSON.stringify(v))).category, 'COMPOSE_ASSERTION_FAILED'); }
  }],
  ['render_process_and_json_fail_closed', async () => {
    const good = completed(JSON.stringify(fixture()));
    for (const [patch, category] of [[{ unavailable: true }, 'COMPOSE_NOT_AVAILABLE'], [{ timedOut: true }, 'COMPOSE_TIMEOUT'],
      [{ outputLimitExceeded: true }, 'COMPOSE_OUTPUT_LIMIT'], [{ exitCode: 1 }, 'COMPOSE_EXIT_FAILED'],
      [{ signal: 'SIGTERM' }, 'COMPOSE_EXIT_FAILED'], [{ output: 'SECRET_SENTINEL' }, 'COMPOSE_INVALID_JSON']]) {
      const v = renderProjection({ ...good, ...patch }); assert(!v.passed); assert.equal(v.category, category);
      assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
    }
  }],
  ['invocation_is_config_only_and_env_isolated', async () => {
    const v = renderInvocation({ docker: 'docker.exe', configDir: 'private', emptyEnv: 'empty.env', template: 'frozen.yaml',
      systemRoot: 'C:\\Windows', temp: 'private', pluginParent: 'plugins', run: 'r14-synthetic', secret: 'SECRET_SENTINEL' });
    assert.deepEqual(v.args, ['--config', 'private', 'compose', '--env-file', 'empty.env', '-f', 'frozen.yaml', '--profile', 'tools', 'config', '--format', 'json']);
    assert.equal(v.env.COMPOSE_DISABLE_ENV_FILE, '1'); assert(!('DOCKER_CONTEXT' in v.env)); assert(!('COMPOSE_FILE' in v.env));
    assert(!('COMPOSE_PROFILES' in v.env)); assert(!('COMPOSE_ENV_FILES' in v.env));
    assert(v.env.DOCKER_HOST.includes('wepuu-no-engine-r14-synthetic')); assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
  }],
  ['render_failure_prevents_unit', async () => {
    let count = 0; const v = await compositeGate({ render: async () => ({ passed: false }), unit: async () => { count++; }, postcheck: async () => ({ passed: true }) });
    assert(!v.passed); assert.equal(count, 0); assert.equal(v.renderAttempts, 1);
  }],
  ['both_gates_required_once', async () => {
    for (const pass of [false, true]) {
      let count = 0; const v = await compositeGate({ render: async () => ({ passed: true }), unit: async () => { count++; return { passed: pass }; }, postcheck: async () => ({ passed: true }) });
      assert.equal(v.passed, pass); assert.equal(count, 1);
    }
  }],
  ['input_drift_cannot_use_render_pass', async () => {
    let count = 0; const v = await compositeGate({ render: async () => ({ passed: true }), unit: async () => { throw Error('SECRET_SENTINEL'); }, postcheck: async () => { count++; } });
    assert(!v.passed); assert.equal(count, 0); assert(!JSON.stringify(v).includes('SECRET_SENTINEL'));
  }],
  ['postcheck_failure_cannot_pass', async () => {
    const v = await compositeGate({ render: async () => ({ passed: true }), unit: async () => ({ passed: true }), postcheck: async () => ({ passed: false }) });
    assert(!v.passed);
  }]
];
const result = { phase: 'r14_composite_synthetic', passed: true, dockerInvoked: false, cases: [] };
for (const [name, check] of cases) {
  try { await check(); result.cases.push({ name, passed: true }); }
  catch { result.cases.push({ name, passed: false, category: 'SYNTHETIC_ASSERTION_FAILED' }); result.passed = false; break; }
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
