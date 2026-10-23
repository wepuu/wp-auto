const errors = new Set(['invalid_request','unauthorized_client','access_denied','unsupported_response_type',
  'invalid_scope','server_error','temporarily_unavailable','invalid_grant','invalid_target',
  'login_required','interaction_required','consent_required']);
const grantCategories = new Set(['grant.binding_mismatch','grant.account_mismatch','grant.client_mismatch',
  'grant.resource_mismatch','grant.scope_mismatch','grant.provider_missing','grant.lookup_failed',
  'grant.save_failed','interaction.finish_failed','unknown']);
const stages = new Set(['interaction','binding','grant_load','consent_plan','grant_save','interaction_finish']);
export function callbackSummary(url) {
  const p = url.searchParams, error = p.get('error');
  return { codePresent:p.has('code'), errorCategory:error === null ? 'NOT_OBSERVED' : errors.has(error) ? error : 'UNCLASSIFIED',
    duplicateCriticalParameters:['code','error','state','iss'].some(k=>p.getAll(k).length>1) };
}
export function providerSummary(value) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.event === 'oauth.grant_failed' && stages.has(value.stage) && grantCategories.has(value.category)) {
    return { event:'provider_failure', providerStage:value.stage, providerCategory:value.category };
  }
  if (['oauth.interaction_ended','oauth.authorization_accepted','oauth.authorization_success'].includes(value.event)) {
    return {event:'provider_stage',providerStage:value.event};
  }
  return undefined;
}
export function safeDiagnostic(value) {
  if (!value || typeof value !== 'object' || value.version!==7 || !Number.isInteger(value.operation)
    || value.operation<0 || value.operation>100 || !['A','B','NONE'].includes(value.resource)
    || !['READ_ONLY','READ_ONLY_OFFLINE','NONE'].includes(value.scope)) return undefined;
  const base={version:7,operation:value.operation,resource:value.resource,scope:value.scope};
  if (value.event==='operation_started') return {...base,event:value.event};
  if (value.event==='callback' && typeof value.codePresent==='boolean' && typeof value.duplicateCriticalParameters==='boolean'
    && (errors.has(value.errorCategory)||['NOT_OBSERVED','UNCLASSIFIED'].includes(value.errorCategory))) {
    return {...base,event:value.event,codePresent:value.codePresent,errorCategory:value.errorCategory,
      duplicateCriticalParameters:value.duplicateCriticalParameters};
  }
  if (value.event==='provider_failure' && stages.has(value.providerStage) && grantCategories.has(value.providerCategory)) {
    return {...base,event:value.event,providerStage:value.providerStage,providerCategory:value.providerCategory};
  }
  if (value.event==='provider_stage' && ['oauth.interaction_ended','oauth.authorization_accepted','oauth.authorization_success'].includes(value.providerStage)) {
    return {...base,event:value.event,providerStage:value.providerStage};
  }
  return undefined;
}
