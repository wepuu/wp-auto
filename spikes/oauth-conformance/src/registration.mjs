import { assertRedirectUri } from './profile.mjs';

const MAX_REDIRECTS = 8;
const MAX_CLIENT_NAME = 128;

export function validateDynamicRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_client_metadata');
  if (typeof input.client_name !== 'string' || input.client_name.length > MAX_CLIENT_NAME) throw new Error('invalid_client_metadata');
  if (!Array.isArray(input.redirect_uris) || input.redirect_uris.length === 0 || input.redirect_uris.length > MAX_REDIRECTS) {
    throw new Error('invalid_redirect_uri');
  }
  for (const redirect of input.redirect_uris) {
    let url;
    try {
      url = new URL(redirect);
    } catch {
      throw new Error('invalid_redirect_uri');
    }
    if (url.username || url.password || url.hash) throw new Error('invalid_redirect_uri');
    const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!loopback && url.protocol !== 'https:') throw new Error('invalid_redirect_uri');
    assertRedirectUri(redirect, redirect, { allowLoopbackPort: loopback });
  }
  if (input.token_endpoint_auth_method !== 'none') throw new Error('public_client_required');
  if (input.grant_types && (!Array.isArray(input.grant_types) || input.grant_types.some((grant) => !['authorization_code', 'refresh_token'].includes(grant)))) {
    throw new Error('invalid_grant_type');
  }
  if (input.scope && typeof input.scope !== 'string') throw new Error('invalid_scope');
  return true;
}

export class RegistrationRateLimiter {
  constructor({ limit = 10, windowMs = 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  allow(key, now = Date.now()) {
    const current = this.buckets.get(key);
    if (!current || current.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}
