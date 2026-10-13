import { pathToFileURL } from 'node:url';

const CORE_NAMES = ['wpauto-control-1', 'wpauto-authorization-1', 'wpauto-postgres-1',
  'wpauto-wordpress-e2e-wordpress-1', 'wpauto-wordpress-e2e-database-1'];
const STAGES = ['preflight', 'wordpress', 'wpcli', 'test'];
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function evaluateTemporarySiteB(snapshot, stage = 'preflight', now = Date.now() / 1_000) {
  const stop = (reason) => ({ allowed: false, reasonCodes: [reason], temporary4gbMode: true });
  if (!finite(now) || !STAGES.includes(stage) || snapshot?.version !== 1 || snapshot.stage !== stage
      || !Array.isArray(snapshot.samples)
      || snapshot.samples.length < 6 || !Array.isArray(snapshot.cores)
      || !Array.isArray(snapshot.conflicts) || !finite(snapshot.diskAvailableMiB)
      || !finite(snapshot.inodesAvailable) || !finite(snapshot.databasePeakMiB)
      || !finite(snapshot.wordpressPeakMiB) || snapshot.databasePeakMiB <= 0
      || snapshot.wordpressPeakMiB <= 0 || snapshot.cores.some((core) => core === null
        || typeof core !== 'object')) return stop('resource.evidence_invalid');
  const samples = snapshot.samples;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample === null || typeof sample !== 'object'
        || !['at', 'availableMiB', 'swapUsedMiB', 'swapIoMiBps', 'someAvg10', 'fullAvg10', 'hostOomKills']
      .every((key) => finite(sample[key])) || sample.someAvg10 > 100 || sample.fullAvg10 > 100
        || (i > 0 && (sample.at <= samples[i - 1].at || sample.at - samples[i - 1].at > 10
          || sample.hostOomKills < samples[i - 1].hostOomKills))) {
      return stop('resource.evidence_invalid');
    }
  }
  const last = samples.at(-1);
  if (last.at - samples[0].at < 20 || now - last.at > 120 || last.at > now + 5) {
    return stop('resource.evidence_stale_or_short');
  }
  const requiredCores = [...CORE_NAMES];
  if (stage !== 'preflight') requiredCores.push('wpauto-wordpress-e2e-b-database-1');
  if (stage === 'wpcli' || stage === 'test') requiredCores.push('wpauto-wordpress-e2e-b-wordpress-1');
  if (requiredCores.some((name) => {
    const matches = snapshot.cores.filter((core) => core.name === name);
    if (matches.length !== 1) return true;
    const core = matches[0];
    return core.healthyBefore !== true || core.healthyAfter !== true;
  })) return stop('resource.core_unhealthy');
  if (snapshot.cores.some((core) => core.healthyBefore !== true || core.healthyAfter !== true)) {
    return stop('resource.core_unhealthy');
  }
  if (snapshot.cores.some((core) => !finite(core.oomBefore) || !finite(core.oomAfter)
      || core.oomAfter < core.oomBefore || typeof core.oomFlag !== 'boolean'
      || !finite(core.restartsDelta))) return stop('resource.evidence_invalid');
  if (snapshot.cores.some((core) => core.oomFlag || core.oomAfter > core.oomBefore || core.restartsDelta > 0)
      || last.hostOomKills > samples[0].hostOomKills) return stop('resource.oom_or_restart');
  if (snapshot.conflicts.length > 0) return stop('resource.deployment_conflict');
  if (snapshot.diskAvailableMiB < 2048 || snapshot.inodesAvailable < 10_000) return stop('resource.disk_insufficient');
  const sustained = (predicate) => {
    let run = 0;
    return samples.some((sample) => { run = predicate(sample) ? run + 1 : 0; return run >= 3; });
  };
  // Project temporary-test stop rules, not Linux-defined thresholds. Three
  // consecutive samples distinguish sustained contention from one short burst.
  if (sustained((sample) => sample.fullAvg10 >= 5 || sample.someAvg10 >= 10)) {
    return stop('resource.sustained_pressure');
  }
  if (sustained((sample) => sample.swapIoMiBps >= 4 && (sample.someAvg10 >= 2 || sample.fullAvg10 >= 1))) {
    return stop('resource.sustained_paging_pressure');
  }
  const nextPeakMiB = stage === 'preflight' ? snapshot.databasePeakMiB
    : stage === 'wordpress' ? snapshot.wordpressPeakMiB : stage === 'wpcli' ? 128 : 0;
  const requiredAdditionalMiB = Math.ceil(nextPeakMiB) + 64;
  const minimumAvailableMiB = Math.min(...samples.map((sample) => sample.availableMiB));
  if (minimumAvailableMiB < requiredAdditionalMiB) return stop('resource.next_stage_headroom_insufficient');
  const warnings = [];
  if (samples.some((sample) => sample.swapUsedMiB > 1024)) warnings.push('resource.swap_in_use_not_blocking');
  if (samples.some((sample) => sample.swapIoMiBps >= 4)) warnings.push('resource.transient_paging');
  if (samples.some((sample) => sample.someAvg10 >= 1 || sample.fullAvg10 >= 0.5)) warnings.push('resource.pressure_present');
  if (last.hostOomKills > 0) warnings.push('resource.historical_oom_count_present');
  return { allowed: true, reasonCodes: [], warnings, temporary4gbMode: true, stage,
    minimumAvailableMiB, latestAvailableMiB: last.availableMiB, requiredAdditionalMiB,
    scope: 'next_stage_only_not_full_runtime_acceptance' };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const stage = process.argv.length === 4 && process.argv[2] === '--stage' ? process.argv[3] : undefined;
    if (stage === undefined) throw new Error('arguments');
    let body = '';
    for await (const chunk of process.stdin) {
      body += chunk.toString();
      if (body.length > 65_536) throw new Error('size');
    }
    const result = evaluateTemporarySiteB(JSON.parse(body), stage);
    console.log(JSON.stringify(result));
    process.exitCode = result.allowed ? 0 : 1;
  } catch {
    console.error('TEMPORARY_SITE_B_RESOURCE_ERROR=resource.input_invalid');
    process.exitCode = 1;
  }
}
