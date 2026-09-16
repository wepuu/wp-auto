import { ProviderAdapter } from './adapter.mjs';
import { validateDynamicRegistration } from './registration.mjs';
import { canonicalResource } from './profile.mjs';

function httpsOrigin(value) {
  const url = new URL(value.startsWith('http') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('invalid_auth0_domain');
  }
  return url.href;
}

export class Auth0Adapter extends ProviderAdapter {
  constructor(options = {}) {
    super('auth0', 'managed-tenant');
    // Respect explicit undefined values in tests so a caller can assert the
    // fail-closed path even when the parent process has an ambient tenant.
    this.domain = Object.hasOwn(options, 'domain') ? options.domain : process.env.AUTH0_DOMAIN;
    this.clientId = Object.hasOwn(options, 'clientId') ? options.clientId : process.env.AUTH0_CLIENT_ID;
    this.managementToken = Object.hasOwn(options, 'managementToken') ? options.managementToken : process.env.AUTH0_MGMT_TOKEN;
    this.resource = Object.hasOwn(options, 'resource') ? options.resource : process.env.CONFORMANCE_RESOURCE;
    this.createdClientIds = new Set();
    this.issuer = undefined;
    this.configuration = undefined;
  }

  async start() {
    if (!this.domain) throw new Error('AUTH0_DOMAIN is required');
    if (!this.clientId) throw new Error('AUTH0_CLIENT_ID is required');
    if (!this.resource) throw new Error('CONFORMANCE_RESOURCE is required');
    this.resource = canonicalResource(this.resource);
    this.issuer = httpsOrigin(this.domain);
    const response = await fetch(`${this.issuer}.well-known/openid-configuration`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`auth0_metadata_failed:${response.status}`);
    this.configuration = await response.json();
    if (this.configuration.issuer !== this.issuer) throw new Error('auth0_issuer_mismatch');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'registration_endpoint', 'revocation_endpoint']) {
      if (typeof this.configuration[key] !== 'string' || !this.configuration[key].startsWith(this.issuer)) {
        throw new Error(`auth0_metadata_contract_failed:${key}`);
      }
    }
    if (this.configuration.authorization_response_iss_parameter_supported !== true) {
      throw new Error('auth0_rfc9207_issuer_response_required');
    }
    if (!this.configuration.code_challenge_methods_supported?.includes('S256')) {
      throw new Error('auth0_pkce_s256_required');
    }
    return this.configuration;
  }

  async stop() {
    this.configuration = undefined;
    this.issuer = undefined;
  }

  async cleanup() {
    if (this.createdClientIds.size > 0 && !this.managementToken) {
      throw new Error('auth0_cleanup_requires_management_token');
    }
    for (const clientId of this.createdClientIds) {
      await this.deleteClient(clientId);
    }
    this.createdClientIds.clear();
    await this.stop();
  }

  async metadata() {
    if (!this.configuration) throw new Error('adapter_not_started');
    return this.configuration;
  }

  async registerClient(input) {
    validateDynamicRegistration(input);
    const metadata = await this.metadata();
    if (!metadata.registration_endpoint) throw new Error('auth0_dcr_unavailable');
    const response = await fetch(metadata.registration_endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.client_id) this.createdClientIds.add(body.client_id);
    return { status: response.status, body };
  }

  async deleteClient(clientId) {
    if (!this.managementToken) throw new Error('AUTH0_MGMT_TOKEN is required for client cleanup');
    if (!this.issuer) throw new Error('adapter_not_started');
    const response = await fetch(`${this.issuer}api/v2/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${this.managementToken}`, accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`auth0_client_cleanup_failed:${response.status}`);
    return { status: response.status };
  }

  async issueAuthorizationCode(input) {
    const metadata = await this.metadata();
    const url = new URL(metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({ ...input, resource: input.resource ?? this.resource })) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return { url: url.toString() };
  }

  async exchangeToken(input) {
    const metadata = await this.metadata();
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...input, resource: input.resource ?? this.resource })
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async refreshToken(input) {
    return this.exchangeToken({ ...input, grant_type: 'refresh_token' });
  }

  async revoke(input) {
    const metadata = await this.metadata();
    if (!metadata.revocation_endpoint) throw new Error('auth0_revocation_unavailable');
    const response = await fetch(metadata.revocation_endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(input)
    });
    if (!response.ok) throw new Error(`auth0_revocation_failed:${response.status}`);
  }

  async rotateKeys() {
    if (!this.managementToken) throw new Error('AUTH0_MGMT_TOKEN is required for key rotation');
    const response = await fetch(`${this.issuer}api/v2/keys/signing/rotate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.managementToken}`, accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`auth0_key_rotation_failed:${response.status}`);
    return response.json().catch(() => ({}));
  }
}
