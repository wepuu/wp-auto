// Test-only diagnostics. Never retain Code, uid, payload, exception or token values.
import assert from 'node:assert/strict';
export const expiryStages = Object.freeze(['expired_code_authorize', 'expired_code_link', 'expired_code_expire_session', 'expired_code_exchange_A', 'expired_code_exchange_B', 'expired_code_complete']);
export const expiryAssertions = Object.freeze(['EXPIRY_CODE_REQUIRED', 'EXPIRY_LINK_REQUIRED', 'EXPIRY_SESSION_UPDATE_ONE', 'DENIED_STATUS', 'DENIED_ERROR', 'NO_DENIED_AT', 'NO_DENIED_RT']);
const errors = new Set(['invalid_grant', 'invalid_request', 'invalid_target', 'invalid_scope', 'server_error']);
export function projectExpiry(value) {
 const out = {};
 if (Number.isSafeInteger(value?.sessionRowsUpdated) && value.sessionRowsUpdated >= 0) out.sessionRowsUpdated = value.sessionRowsUpdated;
 for (const key of ['codePresent', 'linkPresent']) if (typeof value?.[key] === 'boolean') out[key] = value[key];
 if (Array.isArray(value?.exchanges)) out.exchanges = value.exchanges.slice(0, 2).map(row => ({
  mode: ['A', 'B'].includes(row?.mode) ? row.mode : 'NOT_CONFIRMED',
  completed: row?.completed === true,
  ...(Number.isInteger(row?.status) && row.status >= 100 && row.status <= 599 ? { status: row.status } : {}),
  ...(errors.has(row?.error) ? { error: row.error } : {}),
  ...Object.fromEntries(['accessTokenPresent', 'refreshTokenPresent'].filter(k => typeof row?.[k] === 'boolean').map(k => [k, row[k]]))
 }));
 return out;
}
// Preserve the historical sequential A/B flow, including its non-independent Code
// reuse limitation. A separately approved fixture repair must address independence.
export async function inspectExpiredSession({ authorize, link, expire, exchange, denied, setStage, evidence }) {
 setStage(expiryStages[0]);
 const code = await authorize();
 evidence.codePresent = typeof code?.code === 'string' && code.code.length > 0;
 assert(evidence.codePresent, 'EXPIRY_CODE_REQUIRED');
 setStage(expiryStages[1]);
 const binding = await link(code);
 evidence.linkPresent = binding !== undefined && binding !== null;
 assert(evidence.linkPresent, 'EXPIRY_LINK_REQUIRED');
 setStage(expiryStages[2]);
 const update = await expire(binding);
 evidence.sessionRowsUpdated = update?.rowCount;
 assert.equal(update?.rowCount, 1, 'EXPIRY_SESSION_UPDATE_ONE');
 evidence.exchanges = [];
 for (const mode of ['A', 'B']) {
  setStage('expired_code_exchange_' + mode);
  const row = { mode, completed: false };
  evidence.exchanges.push(row);
  const result = await exchange(code, mode);
  Object.assign(row, { completed: true, status: result.status,
   error: errors.has(result.body?.error) ? result.body.error : 'NOT_CONFIRMED',
   accessTokenPresent: result.body?.access_token !== undefined,
   refreshTokenPresent: result.body?.refresh_token !== undefined });
  denied(result);
 }
 setStage(expiryStages[5]);
}
