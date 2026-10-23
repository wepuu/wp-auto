// Fixed schemas; never export arbitrary JSON, stdout, error messages or private files.
export function projectReport(v) {
  if (!v || typeof v.passed !== 'boolean') throw Error('INVALID_SAFE_REPORT');
  const out = { passed: v.passed };
  for (const key of ['total', 'fileCount', 'baseDatabaseMigrationCount'])
    if (Number.isSafeInteger(v[key]) && v[key] >= 0) out[key] = v[key];
  for (const key of ['topLevelCountsMatch', 'unexpectedEvent']) if (typeof v[key] === 'boolean') out[key] = v[key];
  const file = f => typeof f === 'string' && /^(?:packages\/[a-z-]+\/test\/[a-z0-9.-]+\.test\.ts|apps\/[a-z-]+\/src\/[a-z0-9.-]+\.test\.ts|scripts\/[a-z0-9.-]+\.test\.mjs)$/u.test(f);
  out.missing = Array.isArray(v.missing) ? v.missing.filter(file) : [];
  out.failures = (v.failures ?? []).map(f => ({ ...(file(f.file) ? { file: f.file } : {}),
    line: Number.isSafeInteger(f.line) ? f.line : null,
    category: ['ERR_ASSERTION', '42501', 'P0001', '23503', '23505', '23514', '55P03', '57014', 'TEST_FAILED'].includes(f.category) ? f.category : 'NOT_CONFIRMED' }));
  out.skipCount = Array.isArray(v.skips) ? v.skips.length : 0;
  return out;
}
export function projectEvidence(path, value) {
  if (!['unit-tests.json', 'database-tests.json', 'legacy-tests.json'].includes(path)) throw Error('EVIDENCE_PATH_DENIED');
  const out = { passed: value?.passed === true, rawOutputSuppressed: true };
  if (value.report) out.report = projectReport(value.report);
  if (Array.isArray(value.reports)) out.reports = value.reports.map(v => ({ passed: v.passed === true, report: projectReport(v.report) }));
  if (value.total !== undefined) out.report = projectReport(value);
  return out;
}
