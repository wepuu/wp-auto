import * as oidc from 'oidc-provider';
import { createMemoryAdapter } from 'oidc-provider/lib/adapters/memory_adapter.js';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { ProviderAdapter, TEST_PROFILE } from './adapter.mjs';
import { assertRedirectUri } from './profile.mjs';

export const TEST_ISSUER = 'https://auth.example.test';
export const TEST_RESOURCE = 'https://site-a.example.test/wp-json/wp-auto/mcp';
export const TEST_CLIENT_ID = 'codex-test-client';
export const TEST_REDIRECT_URI = 'http://127.0.0.1/callback';
export const TEST_KEY_ID = 'phase-2-0-1-rs256-primary';

export function createTestJwks(keyId = TEST_KEY_ID) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid: keyId, use: 'sig', alg: 'RS256' }] };
}

export function assertConfiguredResource(resourceIndicator, resource = TEST_RESOURCE) {
  if (resourceIndicator !== resource) throw new oidc.errors.InvalidTarget();
  return true;
}

async function allowNativeLoopbackRedirect(provider, requestUrl) {
  if (requestUrl.searchParams.get('client_id') !== TEST_CLIENT_ID) return;
  const redirectUri = requestUrl.searchParams.get('redirect_uri');
  try {
    assertRedirectUri(TEST_REDIRECT_URI, redirectUri, { allowLoopbackPort: true });
  } catch {
    return;
  }

  const client = await provider.Client.find(TEST_CLIENT_ID);
  if (!client.redirectUris.includes(redirectUri)) client.redirectUris.push(redirectUri);
}

export function createProvider({ issuer = TEST_ISSUER, resource = TEST_RESOURCE, jwks = createTestJwks(), adapter = createMemoryAdapter(), clients } = {}) {
  const provider = new oidc.Provider(issuer, {
    jwks,
    ...(adapter ? { adapter } : {}),
    clients: clients ?? [
      {
        client_id: TEST_CLIENT_ID,
        redirect_uris: [TEST_REDIRECT_URI],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none'
      }
    ],
    scopes: ['openid', 'offline_access', 'mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'],
    pkce: {
      methods: ['S256'],
      required: () => true
    },
    features: {
      registration: { enabled: true },
      revocation: { enabled: true, allowedPolicy: async () => true },
      devInteractions: { enabled: false },
      resourceIndicators: {
        enabled: true,
        getResourceServerInfo(_ctx, resourceIndicator) {
          assertConfiguredResource(resourceIndicator, resource);
          return {
            scope: 'mcp:read mcp:content.write mcp:media.write mcp:taxonomy.write mcp:seo.write',
            audience: resourceIndicator,
            accessTokenFormat: 'jwt'
          };
        }
      },
      clientIdMetadataDocument: {
        enabled: true,
        ack: 'draft-02'
      }
    },
    ttl: {
      AccessToken: TEST_PROFILE.accessTokenTtl,
      AuthorizationCode: TEST_PROFILE.authorizationCodeTtl,
      RefreshToken: TEST_PROFILE.refreshAbsoluteTtl,
      Interaction: 300,
      Session: 600,
      Grant: TEST_PROFILE.refreshAbsoluteTtl,
      IdToken: TEST_PROFILE.accessTokenTtl
    },
    claims: {
      openid: ['sub']
    },
    extraTokenClaims: async () => ({
      nbf: Math.floor(Date.now() / 1000),
      tenant_id: 'tenant_opaque',
      site_id: 'site_opaque',
      grant_id: 'grant_opaque'
    }),
    findAccount: async (_ctx, accountId) => ({
      accountId,
      claims: async () => ({ sub: accountId })
    }),
    interactions: {
      url(_ctx, interaction) {
        return `/interaction/${interaction.uid}`;
      }
    },
    cookies: {
      keys: ['phase-2-0-1-test-cookie-key']
    }
  });

  return provider;
}

export class OidcProviderAdapter extends ProviderAdapter {
  constructor(options = {}) {
    super('node-oidc-provider', '9.12.2');
    this.options = options;
    this.instance = undefined;
  }

  async start() {
    this.instance = await listenProvider(this.options);
    return this.instance;
  }

  async stop() {
    if (this.instance) await this.instance.close();
    this.instance = undefined;
  }

  async metadata() {
    if (!this.instance) throw new Error('adapter_not_started');
    const response = await fetch(`${this.instance.issuer}/.well-known/openid-configuration`);
    return response.json();
  }

  async registerClient(input) {
    if (!this.instance) throw new Error('adapter_not_started');
    const { validateDynamicRegistration } = await import('./registration.mjs');
    validateDynamicRegistration(input);
    const metadata = await this.metadata();
    const response = await fetch(metadata.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async issueAuthorizationCode(input) {
    if (!this.instance) throw new Error('adapter_not_started');
    const authorization = new URL(`${this.instance.issuer}/auth`);
    authorization.search = new URLSearchParams({
      ...input,
      resource: input.resource ?? this.options.resource ?? TEST_RESOURCE
    }).toString();
    return { url: authorization.toString() };
  }

  async exchangeToken(input) {
    if (!this.instance) throw new Error('adapter_not_started');
    const response = await fetch(`${this.instance.issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...input,
        resource: input.resource ?? this.options.resource ?? TEST_RESOURCE
      })
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  async refreshToken(input) {
    return this.exchangeToken({ ...input, grant_type: 'refresh_token' });
  }

  async revoke(input) {
    if (!this.instance) throw new Error('adapter_not_started');
    const response = await fetch(`${this.instance.issuer}/token/revocation`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(input)
    });
    if (!response.ok) throw new Error(`revocation_failed:${response.status}`);
  }

  async rotateKeys() {
    throw new Error('key_rotation_requires_provider_restart');
  }
}

export async function listenProvider(options = {}) {
  let port = options.port;
  if (!port) {
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    port = probe.address().port;
    await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  }
  if (options.adapter?.prepare) await options.adapter.prepare();
  const host = options.host ?? '127.0.0.1';
  const localIssuer = `http://127.0.0.1:${port}`;
  const issuer = options.issuer ?? localIssuer;
  const provider = createProvider({ ...options, issuer });
  provider.proxy = options.proxy === true;
  const callback = provider.callback();
  const server = createHttpServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', localIssuer);
    res.once('finish', () => options.onTrace?.({ method: req.method, path: requestUrl.pathname, status: res.statusCode }));
    if (!requestUrl.pathname.startsWith('/interaction/')) {
      try {
        if (req.method === 'GET' && requestUrl.pathname === '/auth') {
          await allowNativeLoopbackRedirect(provider, requestUrl);
        }
        await callback(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = error.statusCode ?? 500;
          res.setHeader('content-type', 'text/plain; charset=utf-8');
        }
        if (!res.writableEnded) res.end('provider request failed');
        options.onError?.(error);
      }
      return;
    }

    try {
      const details = await provider.interactionDetails(req, res);
      if (options.automaticInteractions === false && req.method === 'GET') {
        const prompt = details.prompt.name;
        if (!['login', 'consent'].includes(prompt)) {
          res.statusCode = 501;
          res.end('unsupported interaction');
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WePuu conformance ${prompt}</title><style>body{font:16px system-ui;max-width:40rem;margin:10vh auto;padding:2rem}button{font:inherit;padding:.7rem 1.1rem}</style></head><body><h1>WePuu conformance ${prompt}</h1><p>This synthetic account grants only the scopes shown by the OAuth request. No WordPress credentials or content are used.</p><form method="post" action="${requestUrl.pathname}"><button type="submit">Continue ${prompt}</button></form></body></html>`);
        return;
      }
      if (options.automaticInteractions === false && req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('allow', 'GET, POST');
        res.end();
        return;
      }
      if (details.prompt.name === 'login') {
        await provider.interactionFinished(req, res, {
          login: { accountId: 'phase-2-0-1-test-account' }
        }, { mergeWithLastSubmission: false });
        return;
      }

      if (details.prompt.name !== 'consent') {
        res.statusCode = 501;
        res.end('unsupported interaction');
        return;
      }

      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({ accountId: details.session.accountId, clientId: details.params.client_id });
      if (details.prompt.details.missingOIDCScope) {
        grant.addOIDCScope(details.prompt.details.missingOIDCScope.join(' '));
      }
      if (details.prompt.details.missingResourceScopes) {
        for (const [indicator, scopes] of Object.entries(details.prompt.details.missingResourceScopes)) {
          grant.addResourceScope(indicator, scopes.join(' '));
        }
      }
      await provider.interactionFinished(req, res, {
        consent: { grantId: await grant.save() }
      }, { mergeWithLastSubmission: true });
    } catch (error) {
      res.statusCode = error.statusCode ?? 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(error.message ?? 'interaction error');
    }
  });
  server.listen(port, host);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    provider,
    server,
    issuer,
    localIssuer,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
