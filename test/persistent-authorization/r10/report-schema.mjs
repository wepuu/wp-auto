export const reportVersion = 1;
const phases = new Set(['unit', 'database', 'legacy']);
export const failureCategories = new Set(['ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ERR_MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION',
  'ENOENT', 'EACCES', 'EPERM', 'SYNTAX_ERROR', '42501', 'P0001', '23503', '23505', '23514', '55P03', '57014', 'TEST_FAILED']);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const keysOnly = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).every(k => keys.includes(k));
export function validateReportConfig(v) {
  if (!keysOnly(v, ['files', 'phase', 'expectedTopLevel']) || !phases.has(v.phase)
    || !Array.isArray(v.files) || v.files.length === 0 || v.files.length > 1000
    || v.files.some(f => typeof f !== 'string' || f.length > 1024 || /[\r\n\0]/u.test(f))
    || new Set(v.files).size !== v.files.length
    || v.expectedTopLevel !== undefined && (!keysOnly(v.expectedTopLevel, Object.keys(v.expectedTopLevel))
      || Object.values(v.expectedTopLevel).some(n => !integer(n) || n === 0))) throw Error('REPORT_CONFIG_INVALID');
  return v;
}
// Reconstruct every accepted field. No names/messages/stacks/actual/expected/stdout.
export function validateStructuredReport(v, config) {
  validateReportConfig(config);
  if (!keysOnly(v, ['passed', 'phase', 'total', 'fileCount', 'missing', 'failures', 'skips', 'unexpectedEvent',
    'unmappedEventCount', 'topLevelCountsMatch', 'rawOutputSuppressed']) || typeof v.passed !== 'boolean'
    || v.phase !== config.phase || !integer(v.total) || !integer(v.fileCount) || v.fileCount > config.files.length
    || !Array.isArray(v.missing) || v.missing.length > config.files.length
    || new Set(v.missing).size !== v.missing.length || v.missing.some(f => !config.files.includes(f))
    || !Array.isArray(v.failures) || v.failures.length > 10000 || !Array.isArray(v.skips) || v.skips.length > 10000
    || typeof v.unexpectedEvent !== 'boolean' || !integer(v.unmappedEventCount)
    || typeof v.topLevelCountsMatch !== 'boolean' || v.rawOutputSuppressed !== true) throw Error('REPORT_SCHEMA_INVALID');
  const failures = v.failures.map(f => {
    if (!keysOnly(f, ['file', 'line', 'category', 'cause']) || !config.files.includes(f.file)
      || !(f.line === null || integer(f.line)) || !failureCategories.has(f.category)
      || f.cause !== undefined && !failureCategories.has(f.cause)) throw Error('REPORT_SCHEMA_INVALID');
    return { file: f.file, line: f.line, category: f.category, ...(f.cause === undefined ? {} : { cause: f.cause }) };
  });
  const skips = v.skips.map(s => {
    if (!keysOnly(s, ['file', 'allowed']) || !config.files.includes(s.file) || typeof s.allowed !== 'boolean') throw Error('REPORT_SCHEMA_INVALID');
    return { file: s.file, allowed: s.allowed };
  });
  const canPass = v.total > 0 && v.fileCount === config.files.length && v.missing.length === 0
    && failures.length === 0 && skips.every(s => s.allowed) && !v.unexpectedEvent
    && v.unmappedEventCount === 0 && v.topLevelCountsMatch;
  if (v.passed && !canPass) throw Error('REPORT_VERDICT_CONFLICT');
  return { passed: v.passed, phase: v.phase, total: v.total, fileCount: v.fileCount, missing: [...v.missing],
    failures, skips, unexpectedEvent: v.unexpectedEvent, unmappedEventCount: v.unmappedEventCount,
    topLevelCountsMatch: v.topLevelCountsMatch, rawOutputSuppressed: true };
}
export function validateReportEnvelope(v, config, runId) {
  if (!keysOnly(v, ['schemaVersion', 'runId', 'reporterStatus', 'report']) || v.schemaVersion !== reportVersion
    || v.runId !== runId || !/^[a-f0-9]{24}$/u.test(runId)) throw Error('REPORT_ENVELOPE_INVALID');
  if (v.reporterStatus === 'REPORTER_EXCEPTION' && v.report === null) return { reporterStatus: v.reporterStatus };
  if (v.reporterStatus !== 'COMPLETE') throw Error('REPORT_ENVELOPE_INVALID');
  return { reporterStatus: 'COMPLETE', report: validateStructuredReport(v.report, config) };
}
