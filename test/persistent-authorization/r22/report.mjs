// Test-only fixed projection. Never export exception text, stdout, credentials or payloads.
import { controlRunPass, startupErrors } from '../r23/control-lifecycle.mjs';
import { expiryStages, expiryAssertions, projectExpiry } from '../r8/expiry-evidence.mjs';
export const steps = Object.freeze(['startup', 'control', 'matrix', 'transition']);
export const proofChecks = ['invalid_signature', 'wrong_tenant', 'wrong_site', 'wrong_client', 'wrong_subject', 'wrong_resource', 'wrong_scope'].map(x => 'proof_' + x).concat('single_pending_negative_proofs_then_valid_activation');
const common = ['real_BetterAuth_mock_OTP_Session_and_account_workspace_provision', 'test_process_network_APIs_deny_external_TCP_TLS_DNS'];
const flow = [...common, 'unchanged_compiled_main_starts_A_default_and_explicit_B', ...proofChecks, 'actual_signed_site_Consent_invalid_signature_denied_valid_proof_activates_Grant'];
export const expectedChecks = Object.freeze({
 startup: common, control: common,
 matrix: [...flow, 'real_A_rejects_persistence_and_preserves_ordinary_session_path', 'other_site_native_guarded_path_preserved',
  'B_INVALID_CSRF', 'B_SPOOFED_BINDING', 'B_INVALID_PERSISTENT_CHOICE', 'B_WRONG_ORIGIN',
  'real_form_CSRF_origin_spoofed_binding_and_truthy_approval_denied',
  ...['receipt', 'provider', 'code'].map(x => 'real_service_' + x + '_save_failure_does_not_issue_Code'),
  'duplicate_submission_no_second_receipt_or_Code', 'real_service_explicit_receipt_B_Code_to_A_RT_A_B_after_ProviderSession_expiry',
  'real_A_B_expired_original_ProviderSession_Code_denied', ...['deleted', 'account', 'client_grant'].map(x => 'real_A_B_Code_original_Session_' + x + '_denied'),
  'real_service_native_PKCE_redirect_resource_negatives', 'real_account_scoped_membership_revocation_denies_binding',
  'unknown_receipt_version_rejected_by_real_database_constraint', 'real_missing_RT_link_denied_without_native_fallback',
  'second_real_local_account_cannot_reuse_first_account_Grant', 'real_A_B_withdrawal_denies_existing_RT',
  'real_A_B_refresh_replay_revokes_Grant_and_successor_with_one_Outbox', 'real_expired_BetterAuth_Session_cannot_enter_consent',
  'protected_site_Grant_and_secret_free_receipt_projection'],
 transition: [...flow, 'B_issued_Code_and_RT_before_transition', 'B_retired_before_A_started',
  'A_preserves_guarded_Code_and_RT_with_original_lifetime', 'A_closes_new_persistent_consent_after_B_shutdown', 'A_keeps_replay_revocation_and_protected_Grant']
});
const driverNames = ['missing_schema_denied_without_auto_migration', 'separate_explicit_migration_identity', 'runtime_cannot_DDL_write_ledger_or_assume_migrator', 'missing_ledger_permission_denied_without_repair'];
const names = new Set([...driverNames, ...Object.values(expectedChecks).flat()]);
const categories = new Set(['TIMEOUT', 'ASSERTION_FAILED', 'LOCAL_FAILURE', 'SQL_FAILURE', 'NOT_CONFIRMED', 'SQL_UNIQUE_CONFLICT', 'INVALID_SIGNATURE', 'PROOF_CLAIMS_INVALID']);
const stages = new Set(['setup', 'identity', 'explicit_migration', 'runtime_privileges', 'missing_schema_default_main', 'missing_ledger_permission', 'compiled_service_matrix',
 'driver_initialization_or_report', 'actual_better_auth', 'local_keys_and_sites', 'egress_guard', 'default_main_start', 'compiled_main_start', 'no_grant_bootstrap',
 'grant_pending_create', 'protected_grant_create', 'A_default_and_ordinary', 'B_form_render', 'save_failure_injection', 'B_to_A_code_and_RT', 'expired_code',
 'native_guards', 'membership_guard', 'link_and_version_guards', 'wrong_account', 'receipt_withdrawal', 'refresh_replay', 'BetterAuth_session_expiry',
 'B_issue_before_stop', 'B_stop_before_A', 'A_accepts_guarded_preissued_code', 'A_denies_new_persistent_consent', 'A_preserves_replay_guard', 'proof_valid_activation',
 ...proofChecks, ...expiryStages, ...['B_INVALID_CSRF', 'B_SPOOFED_BINDING', 'B_INVALID_PERSISTENT_CHOICE', 'B_WRONG_ORIGIN'].flatMap(x => [x, x + '_NO_ARTIFACT'])]);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
export function lastResult(output) {
 try { const v = JSON.parse(String(output ?? '').trim().split(/\r?\n/u).at(-1)); return v && typeof v === 'object' && !Array.isArray(v) && typeof v.passed === 'boolean' ? v : null; } catch { return null; }
}
export function boundaryFailure(step, error) {
 return { passed: false, step: steps.includes(step) ? step : 'NOT_CONFIRMED', stage: 'driver_initialization_or_report',
  category: error?.killed ? 'TIMEOUT' : 'LOCAL_FAILURE', rawErrorSuppressed: true, productionAccessed: false };
}
export function project(v) {
 const out = { passed: v?.passed === true, rawErrorSuppressed: true };
 if (expiryStages.includes(v?.stage) && expiryAssertions.includes(v?.assertion)) out.assertion = v.assertion;
 if (v?.expiryEvidence && typeof v.expiryEvidence === 'object') out.expiryEvidence = projectExpiry(v.expiryEvidence);
 if (steps.includes(v?.step)) out.step = v.step;
 if (v?.stage !== undefined) out.stage = stages.has(v.stage) ? v.stage : 'NOT_CONFIRMED';
 if (v?.category !== undefined) out.category = categories.has(v.category) ? v.category : 'NOT_CONFIRMED';
 if (['CONTROL_MAIN_LIFECYCLE', 'SERVICE_MATRIX_FAILED', 'SERVICE_SCHEMA_UNCHANGED', 'MIGRATION_LEDGER_UNCHANGED', 'STARTUP_DENIAL_TIMEOUT', 'STARTUP_DENIAL_EXIT', 'EXACT_STARTUP_DENIAL', 'DEFAULT_MAIN_READY', 'DEFAULT_MAIN_STOP', 'DEFAULT_MAIN_EXIT', 'CONTROL_MAIN_READY', 'CONTROL_MAIN_STOP', 'CONTROL_MAIN_EXIT', 'MAIN_START_OR_READY_FAILED', 'RUNTIME_NOT_ADMIN', 'RUNTIME_DDL_OR_ESCALATION_DENIED', 'MIGRATION_COUNT', 'NO_014'].includes(v?.assertion)) out.assertion = v.assertion;
 if (/^[0-9A-Z]{5}$/u.test(v?.sqlstate ?? '')) out.sqlstate = v.sqlstate;
 for (const k of ['explicitMigration', 'runtimePrivilegeSeparationPass', 'protocolAssertionsPass', 'childEvidencePass', 'deadlineExceeded', 'syntheticFileSecretsEphemeral', 'boundaryEvidenceSaved', 'schemaAndLedgerUnchanged', 'runtimeDsnRestricted']) if (typeof v?.[k] === 'boolean') out[k] = v[k];
 for (const k of ['authRequests', 'tokenRequests', 'mockDeliveriesObserved', 'elapsedMonotonicMs']) if (Number.isFinite(v?.[k]) && v[k] >= 0) out[k] = v[k];
 for (const k of ['schemaBefore', 'schemaAfter']) if (hash(v?.[k])) out[k] = v[k];
 for (const k of ['ledgerBefore', 'ledgerAfter']) if (Array.isArray(v?.[k])) out[k] = v[k].map(r => ({ name: /^\d{3}_[a-z0-9_]+\.sql$/u.test(r?.name ?? '') ? r.name : 'NOT_CONFIRMED', sha256: hash(r?.sha256) ? r.sha256 : 'NOT_CONFIRMED' }));
 if (Array.isArray(v?.checks)) out.checks = v.checks.map(c => ({ name: names.has(c?.name) ? c.name : 'NOT_CONFIRMED', passed: c?.passed === true,
  ...(['42P01', '42501'].includes(c?.sqlstate) ? { sqlstate: c.sqlstate } : {}) }));
 if (Array.isArray(v?.runs)) out.runs = v.runs.map(r => ({ attempt: r.attempt === 1 || r.attempt === 2 ? r.attempt : null, ready: r.ready === true, exitCode: Number.isSafeInteger(r.exitCode) ? r.exitCode : null,
  ...(typeof r?.passed === 'boolean' ? { passed: r.passed } : {}),
  ...Object.fromEntries(['stopRequested', 'stopSignalDelivered', 'exitObserved', 'closeObserved', 'outputLimitExceeded'].filter(k => typeof r[k] === 'boolean').map(k => [k, r[k]])),
  ...(Number.isSafeInteger(r?.readinessStatus) ? { readinessStatus: r.readinessStatus } : {}),
  ...(r?.signal === null || ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV', 'OTHER'].includes(r?.signal) ? { signal: r.signal } : {}),
  ...Object.fromEntries(['spawnErrorCategory', 'startupFailureCategory', 'cleanupFailureCategory', 'observedStartupError'].filter(k => ['NONE', 'NOT_OBSERVED', 'ENOENT', 'EACCES', 'EPERM', 'SPAWN_ERROR', 'SPAWN_FAILED', 'OUTPUT_LIMIT', 'EXIT_BEFORE_READY', 'READINESS_TIMEOUT', 'LOCAL_OBSERVATION_FAILED', 'SIGNAL_SEND_FAILED', 'STOP_TIMEOUT', 'UNCLEAN_EXIT', ...startupErrors].includes(r[k])).map(k => [k, r[k]])),
  ...Object.fromEntries(['outputBytes', 'elapsedMonotonicMs'].filter(k => Number.isFinite(r[k]) && r[k] >= 0).map(k => [k, r[k]])) }));
 if (v?.cleanup) out.cleanup = { childrenStopped: v.cleanup.childrenStopped === true, forcedOwnedChildTermination: v.cleanup.forcedOwnedChildTermination === true };
 if (Array.isArray(v?.startupEvidence)) out.startupEvidence = v.startupEvidence.map(c => ({ mode: ['A', 'B'].includes(c.mode) ? c.mode : 'NOT_CONFIRMED',
  readyStatus: c.readyStatus === 200 ? 200 : null, readinessRequestCount: Number.isSafeInteger(c.readinessRequestCount) ? c.readinessRequestCount : null,
  ownedChildStopped: c.ownedChildStopped === true, forcedOwnedChildTermination: c.forcedOwnedChildTermination === true,
  observed: { passed: c.observed?.passed === true, evidenceComplete: c.observed?.evidenceComplete === true, snapshotReceived: c.observed?.snapshotReceived === true,
   timedOut: c.observed?.timedOut === true, exitCode: Number.isSafeInteger(c.observed?.exitCode) ? c.observed.exitCode : null } }));
 if (v?.matrix) out.matrix = project(v.matrix);
 return out;
}
const equalSet = (rows, expected) => Array.isArray(rows) && rows.length === expected.length && rows.every(r => r.passed && expected.includes(r.name)) && new Set(rows.map(r => r.name)).size === expected.length;
export function verifyScenario(v, step, ledger, { controlEvidence = false } = {}) {
 const out = project(v), fail = () => { throw Object.assign(Error('SCENARIO_NOT_CONFIRMED'), { code: 'SCENARIO_NOT_CONFIRMED' }); };
 if (!steps.includes(step) || out.step !== step || !out.passed || !out.explicitMigration || !out.runtimePrivilegeSeparationPass
  || !equalSet(out.checks, ['startup', 'control'].includes(step) ? driverNames : driverNames.slice(1, 3))
  || JSON.stringify(out.ledgerBefore) !== JSON.stringify(ledger) || JSON.stringify(out.ledgerAfter) !== JSON.stringify(ledger)
  || !hash(out.schemaBefore) || out.schemaBefore !== out.schemaAfter || !out.matrix?.passed || !equalSet(out.matrix.checks, expectedChecks[step])) fail();
 if (['startup', 'control'].includes(step)) {
  if (!out.matrix.runtimeDsnRestricted || !out.matrix.schemaAndLedgerUnchanged || out.matrix.runs?.length !== 2
   || out.matrix.runs.some((r, i) => r.attempt !== i + 1 || !r.ready || r.exitCode !== 0)
   || out.checks[0].sqlstate !== '42P01' || out.checks[3].sqlstate !== '42501') fail();
  if (step === 'control' && controlEvidence && out.matrix.runs.some(r => !controlRunPass(r))) fail();
 } else {
  const m = out.matrix;
  if (!m.protocolAssertionsPass || !m.childEvidencePass || m.deadlineExceeded !== false || !m.cleanup?.childrenStopped || m.cleanup.forcedOwnedChildTermination !== false
   || !Number.isSafeInteger(m.authRequests) || m.authRequests < 1 || m.authRequests > 20 || !Number.isSafeInteger(m.tokenRequests) || m.tokenRequests < 1 || m.tokenRequests > 30
   || m.startupEvidence?.length !== 2 || new Set(m.startupEvidence.map(c => c.mode)).size !== 2
   || m.startupEvidence.some(c => !['A', 'B'].includes(c.mode) || c.readyStatus !== 200 || c.readinessRequestCount !== 1 || !c.ownedChildStopped || c.forcedOwnedChildTermination
    || !c.observed.passed || !c.observed.evidenceComplete || !c.observed.snapshotReceived || c.observed.timedOut || c.observed.exitCode !== 0)) fail();
 }
 return out;
}
