import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { evaluateTemporarySiteB } from './check-temporary-site-b-resources.mjs';

const now = 1_800_000_000;
const names = ['wpauto-control-1', 'wpauto-authorization-1', 'wpauto-postgres-1',
  'wpauto-wordpress-e2e-wordpress-1', 'wpauto-wordpress-e2e-database-1'];
const core = (name) => ({ name, healthyBefore: true, healthyAfter: true,
  oomBefore: 0, oomAfter: 0, oomFlag: false, restartsDelta: 0 });
const snapshot = () => ({ version: 1, stage: 'preflight', diskAvailableMiB: 15_000, inodesAvailable: 100_000,
  databasePeakMiB: 158, wordpressPeakMiB: 414, conflicts: [], cores: names.map(core),
  samples: Array.from({ length: 6 }, (_, i) => ({ at: now - 25 + i * 5,
    availableMiB: 550, swapUsedMiB: 2440, swapIoMiBps: 0,
    someAvg10: 0.05, fullAvg10: 0.01, hostOomKills: 4 })) });

test('temporary mode permits low available RAM and high occupied Swap without pressure', () => {
  const result = evaluateTemporarySiteB(snapshot(), 'preflight', now);
  assert.equal(result.allowed, true);
  assert.equal(result.requiredAdditionalMiB, 222);
  assert.equal(result.temporary4gbMode, true);
  assert.deepEqual(result.warnings, ['resource.swap_in_use_not_blocking', 'resource.historical_oom_count_present']);
  assert.equal(result.scope, 'next_stage_only_not_full_runtime_acceptance');
  const pressured = snapshot();
  pressured.samples[0].someAvg10 = 2.4;
  assert.ok(evaluateTemporarySiteB(pressured, 'preflight', now).warnings.includes('resource.pressure_present'));
});

test('sustained PSI and paging pressure stop; one burst does not', () => {
  for (const patch of [{ fullAvg10: 5 }, { someAvg10: 10 }, { swapIoMiBps: 4, someAvg10: 2 }]) {
    const evidence = snapshot();
    Object.assign(evidence.samples[3], patch);
    assert.equal(evaluateTemporarySiteB(evidence, 'preflight', now).allowed, true);
    Object.assign(evidence.samples[4], patch);
    Object.assign(evidence.samples[5], patch);
    assert.equal(evaluateTemporarySiteB(evidence, 'preflight', now).allowed, false);
  }
});

test('new host/container OOM, restart and core health degradation stop', () => {
  for (const mutate of [(s) => { s.samples[5].hostOomKills += 1; },
    (s) => { s.cores[0].oomAfter = 1; }, (s) => { s.cores[0].oomFlag = true; },
    (s) => { s.cores[0].restartsDelta = 1; }, (s) => { s.cores[0].healthyAfter = false; }]) {
    const evidence = snapshot(); mutate(evidence);
    assert.equal(evaluateTemporarySiteB(evidence, 'preflight', now).allowed, false);
  }
});

test('next-stage budget uses observed peak or WP-CLI cap, not sum of caps plus old reserve', () => {
  const evidence = snapshot();
  evidence.cores.push(core('wpauto-wordpress-e2e-b-database-1'));
  evidence.stage = 'wordpress';
  assert.equal(evaluateTemporarySiteB(evidence, 'wordpress', now).requiredAdditionalMiB, 478);
  evidence.cores.push(core('wpauto-wordpress-e2e-b-wordpress-1'));
  evidence.stage = 'wpcli';
  assert.equal(evaluateTemporarySiteB(evidence, 'wpcli', now).requiredAdditionalMiB, 192);
  evidence.stage = 'test';
  assert.equal(evaluateTemporarySiteB(evidence, 'test', now).requiredAdditionalMiB, 64);
  evidence.samples.forEach((sample) => { sample.availableMiB = 191; });
  evidence.stage = 'wpcli';
  assert.deepEqual(evaluateTemporarySiteB(evidence, 'wpcli', now).reasonCodes,
    ['resource.next_stage_headroom_insufficient']);
  evidence.cores[5].healthyAfter = false;
  evidence.stage = 'wordpress';
  assert.deepEqual(evaluateTemporarySiteB(evidence, 'wordpress', now).reasonCodes, ['resource.core_unhealthy']);
});

test('unknown, short, stale, reordered or non-finite evidence never passes', () => {
  for (const mutate of [(s) => { s.samples = s.samples.slice(0, 2); },
    (s) => { s.samples[5].availableMiB = undefined; }, (s) => { s.samples[5].fullAvg10 = 101; },
    (s) => { s.samples[0].at = s.samples[1].at; }, (s) => { s.cores.pop(); },
    (s) => { s.cores[0] = null; }, (s) => { s.databasePeakMiB = 0; },
    (s) => { s.samples[5].hostOomKills = 0; },
    (s) => { s.samples.forEach((sample) => { sample.at -= 121; }); }]) {
    const evidence = snapshot(); mutate(evidence);
    assert.equal(evaluateTemporarySiteB(evidence, 'preflight', now).allowed, false);
  }
  assert.equal(evaluateTemporarySiteB(snapshot(), 'unknown', now).allowed, false);
  assert.equal(evaluateTemporarySiteB(snapshot(), 'wordpress', now).allowed, false);
});

test('deployment collisions, insufficient disk or inode space stop', () => {
  for (const patch of [{ conflicts: ['subnet'] }, { diskAvailableMiB: 1024 }, { inodesAvailable: 1 }]) {
    assert.equal(evaluateTemporarySiteB({ ...snapshot(), ...patch }, 'preflight', now).allowed, false);
  }
});

test('CLI prints only safe resource result and never echoes invalid secret-bearing input', () => {
  const evidence = snapshot();
  evidence.samples.forEach((sample, i) => { sample.at = Math.floor(Date.now() / 1_000) - 25 + i * 5; });
  evidence.extra = 'SECRET_SENTINEL';
  const output = execFileSync(process.execPath, ['scripts/check-temporary-site-b-resources.mjs', '--stage', 'preflight'],
    { input: JSON.stringify(evidence), encoding: 'utf8', stdio: 'pipe' });
  assert.equal(JSON.parse(output).allowed, true);
  assert.ok(!output.includes('SECRET'));
  try {
    execFileSync(process.execPath, ['scripts/check-temporary-site-b-resources.mjs', '--stage', 'preflight'],
      { input: 'SECRET_INVALID_JSON', encoding: 'utf8', stdio: 'pipe' });
    assert.fail('invalid input must fail');
  } catch (error) {
    assert.equal(error.status, 1);
    assert.equal(error.stderr.trim(), 'TEMPORARY_SITE_B_RESOURCE_ERROR=resource.input_invalid');
  }
});

test('collector is bounded/read-only and does not read secrets or mutate existing services', async () => {
  const source = await readFile('deploy/wpauto-vps/inspect-wordpress-e2e-b-resources.sh', 'utf8');
  assert.ok(source.includes('for sample in 1 2 3 4 5 6'));
  assert.ok(source.includes('memory.events'));
  assert.ok(source.includes('/proc/pressure/memory'));
  assert.ok(source.includes('n.overlaps(target)'));
  assert.ok(!/docker\s+(?:stop|restart|rm|run|prune)|compose\s+(?:up|down)|drop_caches|swapoff|swapon|\.Config\.Env|\/environ|pg_dump|psql/u.test(source));
  if (process.platform !== 'win32') {
    const syntax = spawnSync('bash', ['-n'], { input: source, encoding: 'utf8', timeout: 10_000 });
    assert.equal(syntax.status, 0, 'Linux CI must syntax-check the read-only collector');
  }
});
