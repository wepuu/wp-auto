import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  Database,
  PostgresAccountRegistry,
  PostgresAccountSessionStore,
  PostgresAuthorizationGrantRepository,
  PostgresGrantClaimsResolver,
  PostgresOAuthRateLimiter,
  PostgresOAuthClientRepository,
  PostgresRevocationOutbox,
  PostgresResourceRegistry,
  PostgresSigningKeyRepository,
  createOidcAdapterFactory,
  rateLimitSubjectCodecFromEnvironment,
  secretArtifactCodecFromEnvironment
} from '@wepuu/database';
import {
  AwsKmsKeyCustody,
  createAwsKmsRevocationEventSigner,
  type KeyCustody
} from '@wepuu/key-custody';
import { allowRegisteredNativeLoopbackPort, createAuthorizationProvider } from '@wepuu/oauth-provider';
import { HttpsRevocationDelivery, RevocationWorker } from './revocation-worker.js';
import {
  escapeHtml,
  loadPublicDeploymentConfig,
  renderInteractionPage,
  UI_CSP,
  UI_STYLES
} from '@wepuu/platform-ui';

const SESSION_COOKIE = '__Host-wepuu_session';
const mcpScopes = new Set([
  'mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'
]);
const CsrfPayloadSchema = z.object({
  uid: z.string().min(8).max(256),
  accountId: z.string().min(8).max(128),
  grantId: z.string().min(8).max(128),
  expiresAt: z.number().int().positive(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/u)
}).strict();

const ServiceConfigSchema = z.object({
  issuer: z.url().refine((value) => value.startsWith('https://')),
  databaseUrl: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  cookieKeys: z.array(z.string().min(32)).min(2)
}).strict();

export type AuthorizationServiceConfig = z.infer<typeof ServiceConfigSchema>;

export function authorizationServiceConfigFromEnvironment(environment: NodeJS.ProcessEnv): AuthorizationServiceConfig {
  return ServiceConfigSchema.parse({
    issuer: environment['WEPUU_ISSUER'],
    databaseUrl: environment['WEPUU_DATABASE_URL'],
    host: environment['WEPUU_AUTH_HOST'] ?? '127.0.0.1',
    port: Number(environment['WEPUU_AUTH_PORT'] ?? '3001'),
    cookieKeys: JSON.parse(environment['WEPUU_COOKIE_KEYS_JSON'] ?? '[]') as unknown
  });
}

export interface RunningAuthorizationService {
  readonly server: Server;
  close(): Promise<void>;
}

function requestCookie(request: IncomingMessage, name: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined || header.length > 4_096) return undefined;
  for (const part of header.split(';')) {
    const [candidate, ...value] = part.trim().split('=');
    if (candidate === name) return value.join('=');
  }
  return undefined;
}

function interactionScopes(params: Record<string, unknown>): readonly string[] | undefined {
  if (typeof params['scope'] !== 'string') return undefined;
  const scopes = [...new Set(params['scope'].split(' ').filter((scope) => mcpScopes.has(scope)))].sort();
  return scopes.length === 0 ? undefined : scopes;
}

export function interactionResource(params: Record<string, unknown>): string | undefined {
  const resource = params['resource'];
  if (typeof resource === 'string') return resource;
  if (!Array.isArray(resource) || resource.length === 0 || resource.length > 4) return undefined;
  const first: unknown = resource[0];
  return typeof first === 'string'
    && resource.every((candidate) => typeof candidate === 'string' && candidate === first)
    ? first
    : undefined;
}

export function normalizeAuthorizationResources(authorizationUrl: URL): boolean {
  const resources = authorizationUrl.searchParams.getAll('resource');
  if (resources.length <= 1) return resources.every((resource) => resource.length > 0);
  const [first] = resources;
  if (first === undefined || first.length === 0 || resources.length > 4
      || !resources.every((resource) => resource === first)) {
    return false;
  }
  authorizationUrl.searchParams.delete('resource');
  authorizationUrl.searchParams.append('resource', first);
  return true;
}

function signCsrf(payload: z.infer<typeof CsrfPayloadSchema>, key: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(encoded, 'utf8').digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyCsrf(value: string, key: string): z.infer<typeof CsrfPayloadSchema> | undefined {
  const [encoded, signature, extra] = value.split('.');
  if (encoded === undefined || signature === undefined || extra !== undefined) return undefined;
  const expected = createHmac('sha256', key).update(encoded, 'utf8').digest();
  const observed = Buffer.from(signature, 'base64url');
  if (expected.byteLength !== observed.byteLength || !timingSafeEqual(expected, observed)) return undefined;
  try {
    const parsed = CsrfPayloadSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    return parsed.expiresAt > Math.floor(Date.now() / 1_000) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  let body = '';
  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (body.length > 8_192) throw new Error('interaction_body_too_large');
  }
  return new URLSearchParams(body);
}

function writeInteractionError(response: ServerResponse, status = 400): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end('{"error":"invalid_request"}');
}

function requestSource(request: IncomingMessage): string {
  const remote = request.socket.remoteAddress ?? 'unknown';
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first !== undefined && first.trim().length <= 64) return first.trim();
  }
  return remote.slice(0, 64);
}

export async function startAuthorizationService(
  configInput: AuthorizationServiceConfig,
  environment: NodeJS.ProcessEnv = process.env
): Promise<RunningAuthorizationService> {
  const config = ServiceConfigSchema.parse(configInput);
  const deployment = loadPublicDeploymentConfig(environment, new URL(config.issuer).origin);
  const database = new Database({ connectionString: config.databaseUrl, applicationName: 'wepuu-authorization-service' });
  try {
    const signingKeys = new PostgresSigningKeyRepository(database);
    const lifecycle = await signingKeys.loadUsable();
    const regionFor = (reference: string): string => {
      const region = /^arn:aws(?:-us-gov|-cn)?:kms:([a-z0-9-]+):\d{12}:key\/[0-9a-f-]{36}$/iu.exec(reference)?.[1];
      if (region === undefined) throw new Error('invalid_kms_custody_reference');
      return region;
    };
    const custodyFor = (record: typeof lifecycle.active): AwsKmsKeyCustody => new AwsKmsKeyCustody({
      region: regionFor(record.custodyReference), keyId: record.custodyReference, kid: record.kid
    });
    const activeCustody = custodyFor(lifecycle.active);
    const custody: KeyCustody = {
      describeSigningKey: () => activeCustody.describeSigningKey(),
      async sign(input) {
        if (!await signingKeys.isActive(lifecycle.active.kid)) throw new Error('signing_key_not_active');
        return activeCustody.sign(input);
      }
    };
    const verificationKeys = lifecycle.verification.map((record) => {
      if (record.status === 'active') throw new Error('multiple_active_signing_keys');
      return { custody: custodyFor(record), status: record.status };
    });
    await custody.describeSigningKey();
    for (const record of [lifecycle.active, ...lifecycle.verification]) {
      const descriptor = await custodyFor(record).describeSigningKey();
      if (descriptor.publicJwk.n !== record.publicJwk['n'] || descriptor.publicJwk.e !== record.publicJwk['e']
        || descriptor.publicJwk.kid !== record.kid) throw new Error('kms_public_key_metadata_mismatch');
    }
    const rateLimitCodec = rateLimitSubjectCodecFromEnvironment(environment);
    const clients = await new PostgresOAuthClientRepository(database).loadActivePublicClients();
    const provider = await createAuthorizationProvider({
      issuer: config.issuer,
      cookieKeys: config.cookieKeys,
      keyCustody: custody,
      verificationKeys,
      adapter: createOidcAdapterFactory(database, secretArtifactCodecFromEnvironment(environment), rateLimitCodec),
      resourceRegistry: new PostgresResourceRegistry(database),
      grantClaimsResolver: new PostgresGrantClaimsResolver(database),
      accountRegistry: new PostgresAccountRegistry(database),
      clients
    });
    const sessions = new PostgresAccountSessionStore(database);
    const authorizationGrants = new PostgresAuthorizationGrantRepository(database);
    const rateLimiter = new PostgresOAuthRateLimiter(database, rateLimitCodec);
    const revocationSigner = createAwsKmsRevocationEventSigner({
      region: regionFor(lifecycle.active.custodyReference),
      keyId: lifecycle.active.custodyReference,
      kid: lifecycle.active.kid
    });
    const revocationWorker = new RevocationWorker({
      outbox: new PostgresRevocationOutbox(database),
      signer: {
        async sign(event, now) {
          if (!await signingKeys.isActive(lifecycle.active.kid)) throw new Error('signing_key_not_active');
          return revocationSigner.sign(event, now);
        }
      },
      delivery: new HttpsRevocationDelivery(),
      issuer: config.issuer
    });
    let workerRun: Promise<unknown> | undefined;
    const runWorker = (): void => {
      if (workerRun !== undefined) return;
      workerRun = revocationWorker.runOnce().catch(() => undefined).finally(() => { workerRun = undefined; });
    };
    const workerTimer = setInterval(runWorker, 2_000);
    workerTimer.unref();
    runWorker();
    provider.proxy = true;
    const callback = provider.callback();
    const server = createServer((request, response) => {
      void (async () => {
      const path = new URL(request.url ?? '/', config.issuer).pathname;
      if (request.method === 'GET' && path === '/assets/wepuu-v1.css') {
        response.writeHead(200, {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        });
        response.end(UI_STYLES);
        return;
      }
      if (request.method === 'GET' && path === '/health/live') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end('{"status":"live"}');
        return;
      }
      if (request.method === 'GET' && path === '/health/ready') {
        try {
          await database.withAuthorizationService((client) => client.query('SELECT 1').then(() => undefined));
          if (!await signingKeys.isActive(lifecycle.active.kid)) throw new Error('signing_key_not_active');
          await custody.describeSigningKey();
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end('{"status":"ready"}');
        } catch {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end('{"error":"temporarily_unavailable"}');
        }
        return;
      }
      const endpointPolicy = request.method === 'GET' && path === '/auth'
        ? { name: 'oauth.authorize', limit: 20, windowSeconds: 300 }
        : request.method === 'POST' && path === '/token'
          ? { name: 'oauth.token', limit: 30, windowSeconds: 60 }
          : request.method === 'POST' && path === '/token/revocation'
            ? { name: 'oauth.revoke', limit: 30, windowSeconds: 60 }
            : undefined;
      if (endpointPolicy !== undefined) {
        try {
          if (!await rateLimiter.allow(endpointPolicy, requestSource(request))) {
            response.writeHead(429, {
              'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '60'
            });
            response.end('{"error":"temporarily_unavailable"}');
            return;
          }
        } catch {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end('{"error":"temporarily_unavailable"}');
          return;
        }
      }
      if (path.startsWith('/interaction/')) {
        const details = await provider.interactionDetails(request, response);
        const sessionToken = requestCookie(request, SESSION_COOKIE);
        const session = sessionToken === undefined || !/^[A-Za-z0-9_-]{43,128}$/u.test(sessionToken)
          ? undefined
          : await sessions.resolve(createHash('sha256').update(sessionToken, 'utf8').digest());
        if (session === undefined) {
          response.writeHead(303, {
            location: `/v1/account/oidc/login?return_to=${encodeURIComponent(path)}`,
            'cache-control': 'no-store'
          });
          response.end();
          return;
        }
        if (details.prompt.name === 'login') {
          await provider.interactionFinished(request, response, {
            login: { accountId: session.accountId, ts: session.authenticationTime }
          }, { mergeWithLastSubmission: false });
          return;
        }
        if (details.prompt.name !== 'consent') {
          writeInteractionError(response);
          return;
        }
        const params = details.params as Record<string, unknown>;
        const clientId = typeof params['client_id'] === 'string' ? params['client_id'] : undefined;
        const resource = interactionResource(params);
        const scopes = interactionScopes(params);
        if (clientId === undefined || resource === undefined || scopes === undefined) {
          writeInteractionError(response);
          return;
        }
        const binding = await authorizationGrants.resolveExact({
          subjectId: session.accountId, clientId, resource, scopes
        });
        if (binding === undefined) {
          await provider.interactionFinished(request, response, {
            error: 'access_denied', error_description: 'No exact active consent binding.'
          }, { mergeWithLastSubmission: false });
          return;
        }
        if (request.method === 'GET') {
          const csrf = signCsrf({
            uid: details.uid,
            accountId: session.accountId,
            grantId: binding.grantId,
            expiresAt: Math.floor(Date.now() / 1_000) + 300,
            nonce: randomBytes(24).toString('base64url')
          }, config.cookieKeys[0] ?? '');
          const displayResource = escapeHtml(new URL(resource).hostname);
          const scopeItems = scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join('');
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'content-security-policy': UI_CSP,
            'x-content-type-options': 'nosniff'
          });
          response.end(renderInteractionPage({
            title: `${deployment.productName} authorization`,
            heading: 'Authorize direct MCP access.',
            message: `The client will connect directly to ${displayResource}. WePuu will not receive its tool inputs or results.`,
            content: `<h2>Approved ceiling</h2><ul class="scope-list">${scopeItems}</ul><form method="post"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><div class="actions"><button name="decision" value="approve" type="submit">Approve access</button><button class="danger" name="decision" value="deny" type="submit">Deny</button></div></form>`
          }));
          return;
        }
        if (request.method !== 'POST' || request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
          writeInteractionError(response, 405);
          return;
        }
        if (request.headers.origin !== new URL(config.issuer).origin) {
          writeInteractionError(response, 403);
          return;
        }
        const form = await readForm(request);
        const csrf = verifyCsrf(form.get('csrf') ?? '', config.cookieKeys[0] ?? '');
        if (csrf === undefined || csrf.uid !== details.uid || csrf.accountId !== session.accountId
          || csrf.grantId !== binding.grantId) {
          writeInteractionError(response);
          return;
        }
        if (form.get('decision') !== 'approve') {
          await provider.interactionFinished(request, response, {
            error: 'access_denied', error_description: 'The resource owner denied the request.'
          }, { mergeWithLastSubmission: false });
          return;
        }
        const grant = new provider.Grant({ accountId: session.accountId, clientId });
        Object.assign(grant, { jti: binding.grantId });
        const oidcScopes = typeof params['scope'] === 'string'
          ? params['scope'].split(' ').filter((scope) => scope === 'openid' || scope === 'offline_access')
          : [];
        if (oidcScopes.length > 0) grant.addOIDCScope(oidcScopes.join(' '));
        grant.addResourceScope(resource, scopes.join(' '));
        const savedGrantId = await grant.save();
        if (savedGrantId !== binding.grantId) throw new Error('grant_binding_mismatch');
        await provider.interactionFinished(request, response, {
          consent: { grantId: binding.grantId }
        }, { mergeWithLastSubmission: true });
        return;
      }
      if (request.method === 'GET' && path === '/auth') {
        const authorizationUrl = new URL(request.url ?? '/', config.issuer);
        if (!normalizeAuthorizationResources(authorizationUrl)) {
          writeInteractionError(response);
          return;
        }
        request.url = `${authorizationUrl.pathname}${authorizationUrl.search}`;
        await allowRegisteredNativeLoopbackPort(provider, authorizationUrl);
      }
      try {
        await callback(request, response);
      } catch {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        if (!response.writableEnded) response.end('{"error":"temporarily_unavailable"}');
      }
      })().catch(() => {
        if (!response.headersSent) {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        }
        if (!response.writableEnded) response.end('{"error":"temporarily_unavailable"}');
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });
    return {
      server,
      async close() {
        clearInterval(workerTimer);
        await workerRun;
        await new Promise<void>((resolve, reject) => server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        }));
        await database.close();
      }
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
