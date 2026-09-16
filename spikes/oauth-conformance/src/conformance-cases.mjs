/**
 * Stable provider-neutral case catalog. The HTTP assertions live in the test
 * files and consume this catalog so candidate adapters cannot grow bespoke
 * case names or silently omit a negative test.
 */
export const CONFORMANCE_CASES = Object.freeze([
  ['P01', 'Protected Resource Metadata discovery'],
  ['P02', 'Bearer challenge with resource_metadata'],
  ['P03', 'Authorization Server Metadata discovery'],
  ['P04', 'Authorization Code with PKCE S256'],
  ['P05', 'Token exchange and required claims'],
  ['P06', 'Exact RFC 8707 resource and single audience'],
  ['P07', 'Issuer, time, type, and opaque binding claims'],
  ['P08', 'Scope intersection and advertisement'],
  ['P09', 'Refresh rotation and family generation'],
  ['P10', 'Revocation and immediate denial'],
  ['P11', 'JWKS overlap, cache, and bounded refresh'],
  ['P12', 'Direct client-to-WordPress resource path'],
  ['N01', 'Origin-only audience rejected'],
  ['N02', 'Sibling path and slash variant rejected'],
  ['N03', 'Authorization/token resource mismatch rejected'],
  ['N04', 'Plain or missing PKCE rejected'],
  ['N05', 'Redirect URI mutation rejected'],
  ['N06', 'Issuer mutation rejected'],
  ['N07', 'Audience array rejected'],
  ['N08', 'none or unknown algorithm rejected'],
  ['N09', 'Unknown or revoked kid fails closed'],
  ['N10', 'Expired, future, or overlong time claims rejected'],
  ['N11', 'Authorization-code and refresh replay rejected'],
  ['N12', 'Cross-tenant/site/grant binding rejected'],
  ['N13', 'Query or cookie bearer rejected'],
  ['N14', 'Scope above independent ceiling rejected'],
  ['N15', 'Content and credentials excluded from control-plane traces'],
  ['N16', 'Provider/JWKS outage fails closed']
].map(([id, description]) => Object.freeze({ id, description })));

export const CONFORMANCE_CASE_IDS = Object.freeze(CONFORMANCE_CASES.map(({ id }) => id));

export function caseById(id) {
  const found = CONFORMANCE_CASES.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown_conformance_case:${id}`);
  return found;
}
