import { projectEvidence } from '../r10/evidence.mjs';
import { stages, validateDiagnostic } from '../../../packages/database/test/reconsent-diagnostic.mjs';
import { expectedLedger } from '../../../packages/database/test/r17-migration-evidence.mjs';
import { verifyTargetObservation, verifyTargetPair } from '../../../packages/database/test/r19-target-ledger.mjs';
export const targetFile = 'packages/database/test/grant-reconsent.test.ts';
const deny = () => { throw Object.assign(Error('R19_RESULT_NOT_CONFIRMED'), { code: 'TARGET_RESULT_NOT_CONFIRMED' }); };
export function validateCredential(cfg) {
  if (cfg?.host !== '127.0.0.1' || cfg.port !== 5432 || cfg.user !== 'postgres' || cfg.database !== 'postgres'
    || !/^[a-f0-9]{64}$/u.test(cfg.password ?? '') || !/^r19-[0-9]+-target$/u.test(cfg.run ?? '')
    || cfg.diagnosticRun !== cfg.run.replace(/^r19-([0-9]+)-target$/u, 'r18-$1')) deny();
  return cfg;
}
export function projectDiagnostics(v, run) {
  const readStatus = ['VALID', 'MISSING', 'ACCESS_DENIED', 'NOT_CONFIRMED'].includes(v?.readStatus) ? v.readStatus : 'NOT_CONFIRMED';
  const out = { readStatus, diagnosticCoverage: 'NOT_CONFIRMED', testVerdict: 'NOT_CONFIRMED', ledgerStatus: 'NOT_CONFIRMED' };
  if (readStatus !== 'VALID') return out;
  if (v.run !== run || !['COMPLETE', 'NOT_CONFIRMED'].includes(v.diagnosticCoverage)
    || !['PASS', 'FAIL', 'NOT_OBSERVED'].includes(v.mainStatus) || !['PASS', 'FAIL', 'NOT_OBSERVED'].includes(v.cleanupStatus)
    || v.testVerdict !== 'NOT_CONFIRMED' || v.ledgerStatus !== 'NOT_CONFIRMED') deny();
  Object.assign(out, { run, diagnosticCoverage: v.diagnosticCoverage, mainStatus: v.mainStatus, cleanupStatus: v.cleanupStatus });
  const failure = (f, channel, status) => {
    if (status !== 'FAIL') { if (f !== null) deny(); return null; }
    if (!f || Object.keys(f).sort().join(',') !== 'error,stage') deny();
    const index = stages.indexOf(f.stage);
    if (channel === 'main' ? index < 0 : f.stage !== 'CLEANUP') deny();
    const checked = validateDiagnostic({ schemaVersion: 1, run, file: targetFile, channel, status: 'FAIL', stage: f.stage,
      completedStages: channel === 'main' ? stages.slice(0, index) : [], elapsedMs: 0, ledgerStatus: 'NOT_CONFIRMED', evidenceSaveFailed: false, error: f.error });
    return { stage: checked.stage, error: checked.error };
  };
  out.primaryFailure = failure(v.primaryFailure, 'main', v.mainStatus);
  out.cleanupFailure = failure(v.cleanupFailure, 'cleanup', v.cleanupStatus);
  if (out.diagnosticCoverage === 'COMPLETE' && [out.mainStatus, out.cleanupStatus].includes('NOT_OBSERVED')) deny();
  return out;
}
export async function projectTarget(v, run) {
  if (!/^r19-[0-9]+-target$/u.test(run ?? '')) deny();
  if (!v || v.run !== run && !(v.run === undefined && v.stage === 'credentials' && v.passed === false)) deny();
  const out = { run, passed: v.passed === true, reproductionComplete: false, testAttempts: v.testAttempts === 1 ? 1 : 0,
    rawOutputSuppressed: true, productionAccessed: false, serviceStartupExecuted: false, abExecuted: false,
    stage: ['credentials', 'connection', 'runtime', 'target_test', 'evidence', 'complete'].includes(v.stage) ? v.stage : 'NOT_CONFIRMED' };
  const codes = ['CREDENTIALS_NOT_CONFIRMED', 'CONNECTION_NOT_CONFIRMED', 'RUNTIME_NOT_CONFIRMED', 'TEST_FAILED', 'EVIDENCE_NOT_CONFIRMED', 'EVIDENCE_SAVE_FAILED', 'GROUP_TIMEOUT'];
  if (codes.includes(v.category)) out.category = v.category;
  if (v.test) {
    out.test = projectEvidence('database-tests.json', v.test);
    if (out.test.report && Number.isSafeInteger(v.test.report?.skipCount)) out.test.report.skipCount = v.test.report.skipCount;
  }
  out.diagnostics = projectDiagnostics(v.diagnostics, run.replace(/^r19-([0-9]+)-target$/u, 'r18-$1'));
  const db = /^[a-f0-9]{64}$/u.test(v.databaseSha256 ?? '') ? v.databaseSha256 : undefined;
  if (db) out.databaseSha256 = db;
  out.ledgerStatus = ['COMPLETE', 'NOT_CONFIRMED'].includes(v.ledgerStatus) ? v.ledgerStatus : 'NOT_CONFIRMED';
  out.observations = [];
  if (!Array.isArray(v.observations) || v.observations.length > 2) deny();
  const expected = await expectedLedger('candidate');
  for (const row of v.observations) out.observations.push(verifyTargetObservation(row, expected, run, db));
  if (out.ledgerStatus === 'COMPLETE') verifyTargetPair(out.observations, expected, run, db);
  const p = out.test?.process, report = out.test?.report;
  out.reproductionComplete = out.testAttempts === 1 && out.stage === 'complete' && p?.completed === true
    && !p.spawnFailed && !p.timedOut && !p.outputLimitExceeded && p.signal === null && [0, 1].includes(p.exitCode)
    && out.test.reportStatus === 'VALID' && report?.topLevelCountsMatch === true && report.skipCount === 0
    && report.total === 1 && report.fileCount === 1 && out.diagnostics.diagnosticCoverage === 'COMPLETE' && out.ledgerStatus === 'COMPLETE';
  if (out.passed && (!out.reproductionComplete || out.category || out.test?.passed !== true || out.test.category !== 'PASS'
    || out.diagnostics.mainStatus !== 'PASS' || out.diagnostics.cleanupStatus !== 'PASS')) deny();
  return out;
}
