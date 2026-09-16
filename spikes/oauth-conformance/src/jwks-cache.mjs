import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { assertAccessTokenHeader } from './profile.mjs';

export class BoundedJwksCache {
  constructor(uri, { fetcher = fetch, maxAgeMs = 5 * 60 * 1000, maxRefreshesPerRequest = 1 } = {}) {
    this.uri = new URL(uri).toString();
    this.fetcher = fetcher;
    this.maxAgeMs = maxAgeMs;
    this.maxRefreshesPerRequest = maxRefreshesPerRequest;
    this.entry = undefined;
    this.revokedKids = new Set();
  }

  async refresh(force = false) {
    if (!force && this.entry && this.entry.expiresAt > Date.now()) return this.entry.keys;
    const response = await this.fetcher(this.uri, {
      headers: { accept: 'application/json' },
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`jwks_fetch_failed:${response.status}`);
    const document = await response.json();
    if (!document || !Array.isArray(document.keys)) throw new Error('invalid_jwks');
    this.entry = { keys: document.keys, expiresAt: Date.now() + this.maxAgeMs };
    return document.keys;
  }

  async keyFor(kid, refreshes = 0) {
    if (typeof kid !== 'string' || !kid || this.revokedKids.has(kid)) throw new Error('unknown_or_revoked_kid');
    const keys = await this.refresh();
    let key = keys.find((candidate) => candidate.kid === kid);
    if (!key && refreshes < this.maxRefreshesPerRequest) {
      key = (await this.refresh(true)).find((candidate) => candidate.kid === kid);
    }
    if (!key || this.revokedKids.has(kid)) throw new Error('unknown_or_revoked_kid');
    if (key.kty !== 'RSA' || key.alg !== 'RS256' || key.use === 'enc') throw new Error('invalid_jwks_key');
    return importJWK(key, key.alg ?? 'RS256');
  }

  async verify(token, options = {}) {
    const header = decodeProtectedHeader(token);
    assertAccessTokenHeader(header);
    const { kid } = header;
    try {
      return await jwtVerify(token, await this.keyFor(kid), { ...options, algorithms: ['RS256'] });
    } catch (error) {
      if (error.message !== 'unknown_or_revoked_kid') throw error;
      throw error;
    }
  }

  revokeKid(kid) {
    this.revokedKids.add(kid);
    return this.revokedKids.size;
  }

  invalidate() {
    this.entry = undefined;
  }
}
