const FORBIDDEN_CLAIMS = new Set([
  'wp_user_id',
  'wordpress_user_id',
  'username',
  'email',
  'role',
  'roles',
  'capabilities',
  'password',
  'application_password',
  'content',
  'post_content',
  'media_url',
  'seo',
  'tool_arguments',
  'tool_results'
]);

const REQUIRED_CLAIMS = {
  iss: 'string',
  aud: 'string',
  sub: 'string',
  site_id: 'string',
  grant_id: 'string',
  scope: 'string',
  iat: 'number',
  nbf: 'number',
  exp: 'number',
  jti: 'string'
};

const ALLOWED_ALGORITHMS = new Set(['RS256']);

export function assertAccessTokenHeader(header, { typ = 'at+jwt' } = {}) {
  if (!header || typeof header !== 'object' || !ALLOWED_ALGORITHMS.has(header.alg) || header.typ !== typ || typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new Error('invalid_token_header');
  }
  return true;
}

export const DEFAULT_SCOPES = Object.freeze([
  'mcp:read',
  'mcp:content.write',
  'mcp:media.write',
  'mcp:taxonomy.write',
  'mcp:seo.write'
]);

export function canonicalResource(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('invalid_resource');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_resource');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error('invalid_resource');
  }

  if (parsed.hostname.length === 0 || parsed.port && parsed.port !== '443') {
    throw new Error('invalid_resource');
  }

  return parsed.href;
}

export function assertExactAudience(aud, resource) {
  const expected = canonicalResource(resource);
  if (typeof aud !== 'string' || aud !== expected) {
    throw new Error('invalid_audience');
  }
  return true;
}

export function assertAuthorizationTokenResource(authorizationResource, tokenResource) {
  const authorization = canonicalResource(authorizationResource);
  const token = canonicalResource(tokenResource);
  if (authorization !== token) {
    throw new Error('invalid_target');
  }
  return authorization;
}

export function assertRedirectUri(registered, returned, { allowLoopbackPort = false } = {}) {
  if (typeof registered !== 'string' || typeof returned !== 'string') {
    throw new Error('invalid_redirect_uri');
  }
  if (registered === returned) return true;
  if (!allowLoopbackPort) throw new Error('invalid_redirect_uri');

  let a;
  let b;
  try {
    a = new URL(registered);
    b = new URL(returned);
  } catch {
    throw new Error('invalid_redirect_uri');
  }
  const isLoopback = (url) => url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === 'localhost');

  if (!isLoopback(a) || !isLoopback(b)) throw new Error('invalid_redirect_uri');
  if (a.hostname !== b.hostname || a.pathname !== b.pathname || a.search !== b.search || a.hash !== b.hash) {
    throw new Error('invalid_redirect_uri');
  }
  return true;
}

export function assertPkceS256(method, challenge) {
  if (method !== 'S256' || typeof challenge !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(challenge)) {
    throw new Error('invalid_pkce');
  }
  return true;
}

export function assertBearerHeaderOnly({ authorizationHeader, query, cookie }) {
  if (typeof authorizationHeader !== 'string' || !/^Bearer [^\s]+$/.test(authorizationHeader)) {
    throw new Error('invalid_token_transport');
  }
  if (query?.access_token || cookie?.access_token) {
    throw new Error('invalid_token_transport');
  }
  return true;
}

export function validateAccessTokenClaims(claims, { issuer, resource, now = Math.floor(Date.now() / 1000), skew = 60 } = {}) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('invalid_claims');
  for (const key of Object.keys(claims)) {
    if (FORBIDDEN_CLAIMS.has(key)) throw new Error('forbidden_claim');
  }
  for (const [key, type] of Object.entries(REQUIRED_CLAIMS)) {
    if (typeof claims[key] !== type || (type === 'string' && claims[key].length === 0)) {
      throw new Error(`missing_or_invalid_${key}`);
    }
  }
  if (issuer !== undefined && claims.iss !== issuer) throw new Error('invalid_issuer');
  if (resource !== undefined) assertExactAudience(claims.aud, resource);
  if (claims.nbf > now + skew || claims.iat > now + skew || claims.exp <= now - skew || claims.nbf > claims.iat || claims.nbf > claims.exp) {
    throw new Error('invalid_time');
  }
  if (claims.exp - claims.iat > 900) throw new Error('access_token_too_long');
  const scopes = claims.scope.split(/\s+/u).filter(Boolean);
  if (scopes.length === 0 || scopes.some((scope) => !DEFAULT_SCOPES.includes(scope))) throw new Error('invalid_scope_claim');
  return true;
}

export function assertGrantBinding(claims, { tenantId, siteId, grantId, subject } = {}) {
  if (!claims || typeof claims !== 'object') throw new Error('invalid_grant_binding');
  const expected = { tenant_id: tenantId, site_id: siteId, grant_id: grantId, sub: subject };
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && (typeof claims[key] !== 'string' || claims[key] !== value)) {
      throw new Error(`invalid_${key}`);
    }
  }
  return true;
}

export function intersectScopes(requested, ...ceilings) {
  if (!Array.isArray(requested) || requested.some((scope) => !DEFAULT_SCOPES.includes(scope))) {
    throw new Error('invalid_scope');
  }
  const allowed = new Set(requested);
  for (const ceiling of ceilings) {
    if (!Array.isArray(ceiling)) throw new Error('invalid_scope');
    const next = new Set(ceiling);
    for (const scope of allowed) if (!next.has(scope)) allowed.delete(scope);
  }
  return [...allowed].sort();
}

export function rotateRefreshFamily(state, presentedGeneration) {
  if (!state || state.status !== 'active' || presentedGeneration !== state.generation) {
    return { status: 'revoked', reason: 'refresh_reuse_or_invalid_generation' };
  }
  return { status: 'rotated', generation: state.generation + 1 };
}

export function assertNoContentFields(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ['post_content', 'tool_arguments', 'tool_results', 'media_url', 'email', 'password']) {
    if (serialized.includes(forbidden)) throw new Error('forbidden_control_plane_data');
  }
  return true;
}
