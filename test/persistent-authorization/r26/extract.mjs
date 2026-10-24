// Evidence-only entry. No application imports, network APIs or child processes.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const sourceDirectory = 'matrix-fd255ef5ec6d';
export const reportFiles = Object.freeze(['integration.json', 'driver-result.json']);
export const maxBytes = 1024 * 1024;
const stages = new Set(['expired_code', 'compiled_service_matrix']);
const categories = new Set(['ASSERTION_FAILED', 'TIMEOUT', 'NOT_CONFIRMED', 'SQL_FAILURE', 'LOCAL_FAILURE']);
const assertions = new Set(['DENIED_STATUS', 'DENIED_ERROR', 'NO_DENIED_AT', 'NO_DENIED_RT', 'CODE_REQUIRED', 'SERVICE_MATRIX_FAILED']);
const oauthErrors = new Set(['invalid_grant', 'invalid_request', 'invalid_target', 'invalid_scope', 'server_error', 'NOT_OBSERVED']);
const checks = new Set([
 'real_BetterAuth_mock_OTP_Session_and_account_workspace_provision', 'test_process_network_APIs_deny_external_TCP_TLS_DNS',
 'unchanged_compiled_main_starts_A_default_and_explicit_B',
 ...['invalid_signature', 'wrong_tenant', 'wrong_site', 'wrong_client', 'wrong_subject', 'wrong_resource', 'wrong_scope'].map(s => 'proof_' + s),
 'single_pending_negative_proofs_then_valid_activation', 'actual_signed_site_Consent_invalid_signature_denied_valid_proof_activates_Grant',
 'real_A_rejects_persistence_and_preserves_ordinary_session_path', 'other_site_native_guarded_path_preserved',
 'B_INVALID_CSRF', 'B_SPOOFED_BINDING', 'B_INVALID_PERSISTENT_CHOICE', 'B_WRONG_ORIGIN',
 'real_form_CSRF_origin_spoofed_binding_and_truthy_approval_denied',
 ...['receipt', 'provider', 'code'].map(s => 'real_service_' + s + '_save_failure_does_not_issue_Code'),
 'duplicate_submission_no_second_receipt_or_Code', 'real_service_explicit_receipt_B_Code_to_A_RT_A_B_after_ProviderSession_expiry'
]);
const fail = code => { throw Object.assign(Error('R26_EVIDENCE_DENIED'), { code }); };
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
export function projectIntegration(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.passed !== 'boolean') fail('REPORT_INVALID');
 const out = { passed: value.passed, stage: stages.has(value.stage) ? value.stage : 'NOT_CONFIRMED',
  category: categories.has(value.category) ? value.category : 'NOT_CONFIRMED',
  assertion: assertions.has(value.assertion) ? value.assertion : 'NOT_CONFIRMED',
  modeAttribution: 'NOT_RECORDED', rawOutputSuppressed: true };
 for (const [name, max] of [['authRequests',20],['tokenRequests',30],['mockDeliveriesObserved',2]])
  if (integer(value[name],max)) out[name] = value[name];
 for (const name of ['protocolAssertionsPass','childEvidencePass','deadlineExceeded'])
  if (typeof value[name] === 'boolean') out[name] = value[name];
 if (Array.isArray(value.checks)) {
  if (value.checks.length > 37) fail('REPORT_INVALID');
  out.checks = value.checks.map(row => ({ name: checks.has(row?.name) ? row.name : 'NOT_CONFIRMED', passed: row?.passed === true }));
  out.completedKnownCheckCount = out.checks.filter(row => row.name !== 'NOT_CONFIRMED' && row.passed).length;
 }
 if (Array.isArray(value.diagnostics)) {
  if (value.diagnostics.length > 5) fail('REPORT_INVALID');
  out.tokenDiagnostics = value.diagnostics.filter(row => row?.operation === 'token').map(row => ({
   operation: 'token', ...(Number.isInteger(row.status) && row.status >= 100 && row.status <= 599 ? { status: row.status } : {}),
   category: oauthErrors.has(row.category) ? row.category : 'NOT_CONFIRMED'
  }));
 }
 if (value.cleanup && typeof value.cleanup === 'object') out.cleanup = {
  childrenStopped: value.cleanup.childrenStopped === true,
  forcedOwnedChildTermination: value.cleanup.forcedOwnedChildTermination === true
 };
 return out;
}
export function projectReports(integration, driver) {
 const primary = projectIntegration(integration);
 if (primary.passed !== false || primary.stage !== 'expired_code' || driver?.passed !== false || driver?.step !== 'matrix'
  || driver?.stage !== 'compiled_service_matrix' || driver?.matrix === undefined) fail('REPORT_CONTEXT_MISMATCH');
 const nested = projectIntegration(driver.matrix);
 if (JSON.stringify(primary) !== JSON.stringify(nested)) fail('REPORT_CONFLICT');
 return { integration: primary, driver: { passed: false, stage: driver.stage,
  category: categories.has(driver.category) ? driver.category : 'NOT_CONFIRMED',
  assertion: assertions.has(driver.assertion) ? driver.assertion : 'NOT_CONFIRMED' }, reportsAgree: true,
  earliestAssertionConfirmed: assertions.has(integration.assertion), exactRuntimeCauseConfirmed: false };
}
async function readReport(file) {
 let handle;
 try {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) fail('UNSAFE_FILE');
  if (before.size <= 0 || before.size > maxBytes) fail('REPORT_SIZE_DENIED');
  handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const actual = await handle.stat();
  if (!actual.isFile() || actual.size !== before.size || actual.ino !== before.ino || actual.dev !== before.dev) fail('REPORT_CHANGED');
  // Bounded allocation/read even if an external writer ignores the prior size.
  const buffer = Buffer.alloc(maxBytes + 1); let count = 0;
  while (count < buffer.length) { const r = await handle.read(buffer,count,buffer.length-count,null); if (!r.bytesRead) break; count += r.bytesRead; }
  if (count <= 0 || count > maxBytes) fail('REPORT_SIZE_DENIED');
  const after = await handle.stat();
  if (count !== actual.size || after.size !== actual.size || after.mtimeMs !== actual.mtimeMs || after.ctimeMs !== actual.ctimeMs) fail('REPORT_CHANGED');
  const bytes = buffer.subarray(0,count); let value;
  try { value=JSON.parse(bytes.toString('utf8')); } catch { fail('REPORT_JSON_INVALID'); }
  return { value, bytes: count, sha256: createHash('sha256').update(bytes).digest('hex') };
 } catch(error) {
  if (error?.code === 'ENOENT') fail('REPORT_MISSING');
  if (error?.code === 'EACCES' || error?.code === 'EPERM') fail('REPORT_ACCESS_DENIED');
  throw error;
 } finally { await handle?.close(); }
}
export async function extract(root='/evidence') {
 const dir=path.join(root,sourceDirectory);
 for (const p of [root,dir]) { const s=await lstat(p); if (!s.isDirectory() || s.isSymbolicLink()) fail('UNSAFE_DIRECTORY'); }
 const reports=[];
 for (const name of reportFiles) reports.push(await readReport(path.join(dir,name)));
 return { passed: true, purpose: 'R24_EXISTING_REPORT_EXTRACTION_ONLY',
  nodeVersion: process.version, uid: typeof process.getuid === 'function' ? process.getuid() : null,
  sourceDirectory, files: reports.map((r,i)=>({name:reportFiles[i],bytes:r.bytes,sha256:r.sha256})),
  ...projectReports(reports[0].value,reports[1].value),
  protocolAcceptancePass: false, serviceReproductionPerformed: false, productionAccessed: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 try { console.log(JSON.stringify(await extract())); }
 catch(error) {
  const allowed=['REPORT_INVALID','REPORT_CONTEXT_MISMATCH','REPORT_CONFLICT','UNSAFE_FILE','UNSAFE_DIRECTORY','REPORT_SIZE_DENIED',
   'REPORT_CHANGED','REPORT_JSON_INVALID','REPORT_MISSING','REPORT_ACCESS_DENIED'];
  console.log(JSON.stringify({passed:false,category:allowed.includes(error?.code)?error.code:'EXTRACTION_NOT_CONFIRMED',rawOutputSuppressed:true,productionAccessed:false}));
  process.exitCode=1;
 }
}
