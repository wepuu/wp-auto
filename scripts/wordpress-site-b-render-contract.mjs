import assert from 'node:assert/strict';
// Exact original rendered-model assertions; no daemon or process access here.
export function assertSiteBRender(config) {
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
}
export function renderProjection(process) {
  const out = { passed: false, rawOutputSuppressed: true };
  if (process.unavailable) out.category = 'COMPOSE_NOT_AVAILABLE';
  else if (process.timedOut) out.category = 'COMPOSE_TIMEOUT';
  else if (process.outputLimitExceeded) out.category = 'COMPOSE_OUTPUT_LIMIT';
  else if (process.exitCode !== 0 || process.signal != null) out.category = 'COMPOSE_EXIT_FAILED';
  else {
    let value; try { value = JSON.parse(process.output); } catch { out.category = 'COMPOSE_INVALID_JSON'; return out; }
    try { assertSiteBRender(value); out.passed = true; out.category = 'PASS'; }
    catch { out.category = 'COMPOSE_ASSERTION_FAILED'; }
  }
  return out;
}
export function renderInvocation({ docker, configDir, emptyEnv, template, systemRoot, temp, pluginParent, run }) {
  assert(/^[a-z0-9-]+$/u.test(run));
  return { executable: docker,
    args: ['--config', configDir, 'compose', '--env-file', emptyEnv, '-f', template, '--profile', 'tools', 'config', '--format', 'json'],
    // Do not inherit user .docker/config, .env, remote context, credentials or COMPOSE overrides.
    env: { PATH: pluginParent + ';' + systemRoot + '\\System32', SystemRoot: systemRoot, WINDIR: systemRoot,
      TEMP: temp, TMP: temp, USERPROFILE: temp, DOCKER_CONFIG: configDir,
      DOCKER_HOST: 'npipe:////./pipe/wepuu-no-engine-' + run, COMPOSE_DISABLE_ENV_FILE: '1',
      WPAUTO_E2E_B_DATABASE_PASSWORD: 'fixture-only-password', WPAUTO_E2E_B_DATABASE_ROOT_PASSWORD: 'fixture-only-root-password' } };
}
export async function compositeGate({ render, unit, postcheck }) {
  const r = { passed: false, renderAttempts: 0, unitGateInvocations: 0 };
  try {
    r.stage = 'compose_render'; r.renderAttempts = 1; r.render = await render();
    if (r.render.passed !== true) return r;
    r.stage = 'container_unit'; r.unitGateInvocations = 1; r.unit = await unit();
    if (r.unit.passed !== true) return r;
    r.stage = 'composite_postcheck'; r.postcheck = await postcheck();
    r.passed = r.postcheck?.passed === true;
  } catch { r.failure = 'COMPOSITE_STAGE_NOT_CONFIRMED'; }
  return r;
}
