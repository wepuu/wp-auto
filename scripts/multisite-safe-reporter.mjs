export const targetName = 'real Authorization HTTP binds same-client sequential and interleaved resources to separate Grants';
const assertions = new Set(['local_request_origin','test_cleanup_connections_closed','mock_otp_send','mock_otp_delivered',
  'mock_otp_login','session_cookie_created','one_interaction','authorization_redirect_expected','consent_page','consent_csrf',
  'consent_redirect','callback_issuer','callback_state','authorization_code_present','exchange_invalid_grant','exchange_invalid_target',
  'exchange_access_denied','exchange_invalid_request','exchange_unknown','signing_key','grant_binding','site_binding','tenant_binding',
  'subject_binding','client_binding','scope_binding','new_site_does_not_load_other_site_grant','stale_session_bound_code_denied',
  'cross_resource_exchange_denied','no_cross_resource_token','reconsent_does_not_update_business_grants','business_grants_remain_active',
  'separate_provider_grants_saved','corrupt_provider_binding_denied','test_refresh_created','invalid_grant_status','no_token_on_denial',
  'refresh_rotation','cross_resource_refresh_denied','no_refresh_resource_switch','rfc7009_success','one_event_per_grant']);
export function safeFailure(error) {
  const result = [], seen = new Set();
  function visit(e, depth) {
    if (!e || typeof e !== 'object' || depth > 5 || seen.has(e) || result.length >= 8) return;
    seen.add(e);
    const text = String(e.message ?? '').split('\n')[0].trim();
    const location = String(e.stack ?? '').match(/(?:\/workspace\/)?(packages\/database\/test\/multi-site-provider\.test\.ts):(\d+):(\d+)/u);
    const sqlstate = typeof e.code === 'string' && /^(?:[0-9]{2}|[0-9][A-Z])[A-Z0-9]{3}$/u.test(e.code) ? e.code : undefined;
    const category = e.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : sqlstate ? 'SQL_FAILURE'
      : e.failureType === 'testTimeoutFailure' ? 'TIMEOUT' : e.failureType === 'hookFailed' ? 'HOOK_FAILED' : 'NOT_CONFIRMED';
    if (category !== 'NOT_CONFIRMED' || location || assertions.has(text)) result.push({ category,
      ...(assertions.has(text) ? { assertion: text } : {}), ...(sqlstate ? { sqlstate } : {}),
      ...(location ? { file: location[1], line: Number(location[2]), column: Number(location[3]) } : {}) });
    visit(e.cause, depth + 1);
    if (Array.isArray(e.errors)) for (const nested of e.errors.slice(0, 8)) visit(nested, depth + 1);
  }
  visit(error, 0);
  return result.length ? result : [{ category: 'NOT_CONFIRMED' }];
}
export async function collectEvents(source) {
  const outcomes = []; let incomplete = false;
  for await (const event of source) {
    if (!['test:pass','test:fail'].includes(event.type)) continue;
    const d = event.data;
    if (d?.name !== targetName) {
      if (event.type === 'test:fail') incomplete = true;
      continue;
    }
    const state = d.skip ? 'SKIP' : d.todo ? 'TODO' : event.type === 'test:pass' ? 'PASS' : 'FAIL';
    outcomes.push({ state, durationMs: Number.isFinite(d.details?.duration_ms) ? d.details.duration_ms : null,
      ...(state === 'FAIL' ? { failures: safeFailure(d.details?.error) } : {}) });
  }
  return { passed: outcomes.length === 1 && outcomes[0].state === 'PASS' && !incomplete,
    targetExecuted: outcomes.length === 1 && ['PASS','FAIL'].includes(outcomes[0].state), outcomes,
    additionalFailureObserved: incomplete, rawOutputSuppressed: true };
}
export default async function* reporter(source) {
  const result = await collectEvents(source);
  if (!result.passed) process.exitCode = 1;
  yield JSON.stringify(result) + '\n';
}
