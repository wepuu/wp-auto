// Synthetic test data only. Crypto/key-version lookup is delegated to the existing codec.
/** @type {() => never} */
const deny = () => { throw Error('R20_FIXTURE_INPUT_DENIED'); };
/**
 * Values remain unverified until the existing exact-key/string checks below.
 * @param {{ grantId?: unknown; accountId?: unknown; clientId?: unknown; resource?: unknown; sessionUid?: unknown; [key: string]: unknown; } | null | undefined} binding
 * @returns {Readonly<import('./reconsent-native-fixture.mjs').NativeFixtureBinding & { kind: 'RefreshToken'; scope: 'mcp:read offline_access' }>}
 */
export function nativeFixturePayload(binding) {
  const fields = ['grantId', 'accountId', 'clientId', 'resource', 'sessionUid'];
  if (!binding || Object.keys(binding).sort().join(',') !== [...fields].sort().join(',')
    || fields.some(f => typeof binding[f] !== 'string' || binding[f].length === 0)) deny();
  let url; try { url = new URL(/** @type {string} */ (binding.resource)); } catch { deny(); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.example.test') || url.username || url.password) deny();
  return Object.freeze({ kind: 'RefreshToken', grantId: /** @type {string} */ (binding.grantId), accountId: /** @type {string} */ (binding.accountId),
    clientId: /** @type {string} */ (binding.clientId), resource: /** @type {string} */ (binding.resource), sessionUid: /** @type {string} */ (binding.sessionUid), scope: 'mcp:read offline_access' });
}
/**
 * The codec is the existing reviewed producer; retain every defensive runtime check.
 * @param {Pick<import('../src/index.js').SecretArtifactCodec, 'candidates'>} codec
 * @param {string} model
 * @param {unknown} rawId
 * @returns {{ model: 'AuthorizationCode' | 'RefreshToken'; keys: string[] }}
 */
export function fixtureParent(codec, model, rawId) {
  if (!['AuthorizationCode', 'RefreshToken'].includes(model) || typeof rawId !== 'string' || !rawId) deny();
  const candidates = codec.candidates(rawId);
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 2) deny();
  const keys = candidates.map(/** @param {import('../src/index.js').SecretArtifactLookup} key */ key => {
    if (!Number.isSafeInteger(key.version) || key.version < 1 || key.version > 65535 || !(key.digest instanceof Uint8Array) || key.digest.length !== 32) deny();
    return `${String(key.version)}:${Buffer.from(key.digest).toString('hex')}`;
  });
  if (new Set(keys).size !== keys.length) deny();
  return /** @type {{ model: 'AuthorizationCode' | 'RefreshToken'; keys: string[] }} */ ({ model, keys });
}
