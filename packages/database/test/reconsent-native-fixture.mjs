// Synthetic test data only. Crypto/key-version lookup is delegated to the existing codec.
const deny = () => { throw Error('R20_FIXTURE_INPUT_DENIED'); };
export function nativeFixturePayload(binding) {
  const fields = ['grantId', 'accountId', 'clientId', 'resource', 'sessionUid'];
  if (!binding || Object.keys(binding).sort().join(',') !== [...fields].sort().join(',')
    || fields.some(f => typeof binding[f] !== 'string' || binding[f].length === 0)) deny();
  let url; try { url = new URL(binding.resource); } catch { deny(); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.example.test') || url.username || url.password) deny();
  return Object.freeze({ kind: 'RefreshToken', grantId: binding.grantId, accountId: binding.accountId,
    clientId: binding.clientId, resource: binding.resource, sessionUid: binding.sessionUid, scope: 'mcp:read offline_access' });
}
export function fixtureParent(codec, model, rawId) {
  if (!['AuthorizationCode', 'RefreshToken'].includes(model) || typeof rawId !== 'string' || !rawId) deny();
  const candidates = codec.candidates(rawId);
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 2) deny();
  const keys = candidates.map(key => {
    if (!Number.isSafeInteger(key.version) || key.version < 1 || key.version > 65535 || !(key.digest instanceof Uint8Array) || key.digest.length !== 32) deny();
    return `${String(key.version)}:${Buffer.from(key.digest).toString('hex')}`;
  });
  if (new Set(keys).size !== keys.length) deny();
  return { model, keys };
}
