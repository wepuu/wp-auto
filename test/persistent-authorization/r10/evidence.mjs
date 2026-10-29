// Fixed schemas; never export arbitrary JSON, stdout, error messages or private files.
import { reportStatuses, processCategories } from './reported-process.mjs';
import { failureCategories } from './report-schema.mjs';
export function projectProcessResult(value) {
  const out = {};
  if (processCategories.has(value?.category)) out.category = value.category;
  if (reportStatuses.has(value?.reportStatus)) out.reportStatus = value.reportStatus;
  if (value?.process) {
    const p = value.process; out.process = {};
    for (const k of ['completed', 'spawnFailed', 'timedOut', 'outputLimitExceeded']) if (typeof p[k] === 'boolean') out.process[k] = p[k];
    out.process.exitCode = p.exitCode === null || Number.isSafeInteger(p.exitCode) ? p.exitCode : null;
    out.process.signal = ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT'].includes(p.signal) ? p.signal : null;
    if (['ENOENT', 'EACCES', 'EPERM', 'SPAWN_ERROR'].includes(p.spawnCategory)) out.process.spawnCategory = p.spawnCategory;
    if (Number.isSafeInteger(p.outputBytes) && p.outputBytes >= 0) out.process.outputBytes = p.outputBytes;
  }
  return out;
}
export function projectReport(v) {
  if (!v || typeof v.passed !== 'boolean') throw Error('INVALID_SAFE_REPORT');
  const out = { passed: v.passed };
  for (const key of ['total', 'fileCount', 'baseDatabaseMigrationCount', 'unmappedEventCount'])
    if (Number.isSafeInteger(v[key]) && v[key] >= 0) out[key] = v[key];
  for (const key of ['topLevelCountsMatch', 'unexpectedEvent']) if (typeof v[key] === 'boolean') out[key] = v[key];
  const file = f => typeof f === 'string' && /^(?:packages\/[a-z-]+\/test\/[a-z0-9.-]+\.test\.ts|apps\/[a-z-]+\/src\/[a-z0-9.-]+\.test\.ts|scripts\/[a-z0-9.-]+\.test\.mjs)$/u.test(f);
  out.missing = Array.isArray(v.missing) ? v.missing.filter(file) : [];
  out.failures = (v.failures ?? []).map(f => ({ ...(file(f.file) ? { file: f.file } : {}),
    line: Number.isSafeInteger(f.line) ? f.line : null,
    category: failureCategories.has(f.category) ? f.category : 'NOT_CONFIRMED',
    ...(failureCategories.has(f.cause) ? { cause: f.cause } : {}) }));
  out.skipCount = Array.isArray(v.skips) ? v.skips.length : 0;
  return out;
}
export function projectEvidence(path, value) {
  if (!['unit-tests.json', 'database-tests.json', 'legacy-tests.json'].includes(path)) throw Error('EVIDENCE_PATH_DENIED');
  const out = { passed: value?.passed === true, rawOutputSuppressed: true };
  Object.assign(out, projectProcessResult(value));
  if (value?.reportedProcess) out.reportedProcess = projectProcessResult(value.reportedProcess);
  if (value.report) out.report = projectReport(value.report);
  if (Array.isArray(value.reports)) out.reports = value.reports.map(v => ({ passed: v.passed === true, report: projectReport(v.report) }));
  if (value.total !== undefined) out.report = projectReport(value);
  return out;
}
