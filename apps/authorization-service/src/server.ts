import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { accountAuthFromEnvironment, accountAuthHeaders } from '@wepuu/account-auth';
import {
  Database,
  PostgresAccountAuthLinkStore,
  PostgresAccountRegistry,
  PostgresAuthorizationGrantRepository,
  PostgresGrantClaimsResolver,
  PostgresOAuthRateLimiter,
  PostgresOAuthClientRepository,
  PostgresRevocationOutbox,
  PostgresResourceRegistry,
  PostgresSigningKeyRepository,
  PostgresPersistentReceiptStore,
  createOidcAdapterFactory,
  rateLimitSubjectCodecFromEnvironment,
  secretArtifactCodecFromEnvironment
} from '@wepuu/database';
import {
  JoseOAuthConsentBootstrapVerifier,
  localPkcs8KeyCustodyFromEnvironment,
  signingKeyDescriptorFromPublicJwk,
  type KeyCustody
} from '@wepuu/key-custody';
import { allowRegisteredNativeLoopbackPort, createAuthorizationProvider, GrantDiagnosticError,
  grantFailureDiagnostic, PersistentAuthorizationPolicy, PersistentReadOnlyRuntime, type GrantDiagnosticStage } from '@wepuu/oauth-provider';
import { PersistentConsentController } from './persistent-consent.js';
import { HttpsRevocationDelivery, RevocationWorker } from './revocation-worker.js';
import {
  escapeHtml,
  loadPublicDeploymentConfig,
  renderInteractionPage,
  UI_CSP,
  UI_STYLES
} from '@wepuu/platform-ui';

export const INTERACTION_REFERRER_POLICY = 'strict-origin';
export const CONSENT_SUBMISSION_SCRIPT = `(() => {
  for (const form of document.querySelectorAll('form[data-wepuu-consent]')) {
    form.addEventListener('submit', (event) => {
      if (form.dataset.submitting === 'true') {
        event.preventDefault();
        return;
      }
      const submitter = event.submitter;
      if (!(submitter instanceof HTMLButtonElement)
          || submitter.name !== 'decision'
          || (submitter.value !== 'approve' && submitter.value !== 'deny')) {
        event.preventDefault();
        return;
      }
      const decision = document.createElement('input');
      decision.type = 'hidden';
      decision.name = 'decision';
      decision.value = submitter.value;
      form.append(decision);
      form.dataset.submitting = 'true';
      for (const button of form.querySelectorAll('button[type="submit"]')) {
        button.setAttribute('aria-disabled', 'true');
      }
      const status = form.querySelector('[data-wepuu-submit-status]');
      if (status instanceof HTMLElement) status.hidden = false;
    });
  }
})();`;
const consentScriptHash = createHash('sha256').update(CONSENT_SUBMISSION_SCRIPT, 'utf8').digest('base64');
export const CONSENT_INTERACTION_CSP = UI_CSP.replace(
  "script-src 'self'",
  `script-src 'self' 'sha256-${consentScriptHash}'`
);

type ProviderRequestContext = Readonly<{
  oidc?: Readonly<{
    route?: unknown;
    params?: Readonly<Record<string, unknown>>;
    entities?: Readonly<Record<string, unknown>>;
  }>;
}>;

export function providerGrantRevocationReason(
  context: ProviderRequestContext | undefined
): 'refresh_replay' | 'token_revoked' {
  const refreshToken = context?.oidc?.entities?.['RefreshToken'];
  const consumed = typeof refreshToken === 'object' && refreshToken !== null
    ? (refreshToken as { consumed?: unknown }).consumed
    : undefined;
  return context?.oidc?.route === 'token'
    && context.oidc.params?.['grant_type'] === 'refresh_token'
    && typeof consumed === 'number'
    && Number.isSafeInteger(consumed)
    && consumed > 0
    ? 'refresh_replay'
    : 'token_revoked';
}

export function createGrantRevocationContext(): Readonly<{
  run<T>(context: ProviderRequestContext, callback: () => T): T;
  resolve(): 'refresh_replay' | 'token_revoked';
}> {
  const storage = new AsyncLocalStorage<ProviderRequestContext>();
  return {
    run: (context, callback) => storage.run(context, callback),
    resolve: () => providerGrantRevocationReason(storage.getStore())
  };
}

export function consentInteractionCsp(redirectUri: unknown): string | undefined {
  if (typeof redirectUri !== 'string') return undefined;
  try {
    const target = new URL(redirectUri);
    const allowed = target.protocol === 'https:'
      || (target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port !== '');
    if (!allowed || target.username !== '' || target.password !== '' || target.hash !== '') return undefined;
    return CONSENT_INTERACTION_CSP.replace(
      "form-action 'self'",
      `form-action 'self' ${target.origin}`
    );
  } catch {
    return undefined;
  }
}
const mcpScopeOrder = [
  'mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'
] as const;
const mcpScopes = new Set<string>(mcpScopeOrder);
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
  cookieKeys: z.array(z.string().min(32)).min(2),
  persistent: z.object({
    mode: z.enum(['guard-only', 'explicit-consent']).default('guard-only'),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/u),
    resource: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === 'https:' && url.href === value && url.username === '' && url.password === ''
        && url.search === '' && url.hash === '' && url.pathname === '/wp-json/wp-auto/mcp';
    })
  }).strict()
}).strict();

export type AuthorizationServiceConfig = z.infer<typeof ServiceConfigSchema>;

export function authorizationServiceConfigFromEnvironment(environment: NodeJS.ProcessEnv): AuthorizationServiceConfig {
  return ServiceConfigSchema.parse({
    issuer: environment['WEPUU_ISSUER'],
    databaseUrl: environment['WEPUU_DATABASE_URL'],
    host: environment['WEPUU_AUTH_HOST'] ?? '127.0.0.1',
    port: Number(environment['WEPUU_AUTH_PORT'] ?? '3001'),
    cookieKeys: JSON.parse(environment['WEPUU_COOKIE_KEYS_JSON'] ?? '[]') as unknown,
    persistent: {
      mode: environment['WEPUU_PERSISTENT_AUTHORIZATION_MODE'] ?? 'guard-only',
      clientId: environment['WEPUU_PERSISTENT_CLIENT_ID'],
      resource: environment['WEPUU_PERSISTENT_RESOURCE']
    }
  });
}

export interface RunningAuthorizationService {
  readonly server: Server;
  close(): Promise<void>;
}

function interactionScopes(params: Record<string, unknown>): readonly string[] | undefined {
  if (typeof params['scope'] !== 'string') return undefined;
  const scopes = [...new Set(params['scope'].split(' ').filter((scope) => mcpScopes.has(scope)))]
    .sort((left, right) => mcpScopeOrder.indexOf(left as typeof mcpScopeOrder[number])
      - mcpScopeOrder.indexOf(right as typeof mcpScopeOrder[number]));
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

export function signCsrf(payload: z.infer<typeof CsrfPayloadSchema>, key: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(encoded, 'utf8').digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyCsrf(value: string, key: string): z.infer<typeof CsrfPayloadSchema> | undefined {
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

type InteractionRejectionReason =
  | 'invalid_parameters'
  | 'unsupported_prompt'
  | 'method_or_content_type'
  | 'origin_missing'
  | 'origin_null'
  | 'origin_unexpected'
  | 'account_inactive'
  | 'csrf_binding_mismatch'
  | 'oauth_consent_bootstrap_invalid';

export function interactionSubmissionHeaderRejection(input: Readonly<{
  method: string | undefined;
  contentType: string | undefined;
  origin: string | undefined;
  expectedOrigin: string;
}>): Readonly<{ status: 403 | 405; reason: InteractionRejectionReason }> | undefined {
  if (input.method !== 'POST' || input.contentType?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return { status: 405, reason: 'method_or_content_type' };
  }
  if (input.origin === undefined) return { status: 403, reason: 'origin_missing' };
  if (input.origin === 'null') return { status: 403, reason: 'origin_null' };
  if (input.origin !== input.expectedOrigin) return { status: 403, reason: 'origin_unexpected' };
  return undefined;
}

function writeInteractionError(
  response: ServerResponse,
  status = 400,
  reason: InteractionRejectionReason = 'invalid_parameters'
): void {
  console.warn(JSON.stringify({ event: 'oauth.interaction_rejected', reason, status }));
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end('{"error":"invalid_request"}');
}

type OAuthSessionFailureReason =
  | 'authorization_request_expired'
  | 'interaction_cookie_missing'
  | 'interaction_not_found'
  | 'authentication_session_not_found'
  | 'session_principal_changed'
  | 'authorization_cookie_mismatch'
  | 'authentication_session_mismatch';

const oauthSessionFailureReasons = new Map<string, OAuthSessionFailureReason>([
  ['authorization request has expired', 'authorization_request_expired'],
  ['interaction session id cookie not found', 'interaction_cookie_missing'],
  ['interaction session not found', 'interaction_not_found'],
  ['session not found', 'authentication_session_not_found'],
  ['session principal changed', 'session_principal_changed'],
  ['authorization session and cookie identifier mismatch', 'authorization_cookie_mismatch'],
  ['interaction session and authentication session mismatch', 'authentication_session_mismatch']
]);

export function safeOAuthFailure(error: unknown): Readonly<{
  name: string;
  code?: string;
  oauthError?: string;
  reason?: OAuthSessionFailureReason;
}> {
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name)
    ? error.name
    : 'UnknownError';
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const oauthCandidate = typeof error === 'object' && error !== null && 'error' in error
    ? (error as { error?: unknown }).error
    : undefined;
  const sessionDescription = typeof error === 'object' && error !== null && 'error_description' in error
    ? (error as { error_description?: unknown }).error_description
    : undefined;
  const reason = error instanceof Error && error.name === 'SessionNotFound' && typeof sessionDescription === 'string'
    ? oauthSessionFailureReasons.get(sessionDescription)
    : undefined;
  return {
    name,
    ...(typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/u.test(candidate) ? { code: candidate } : {}),
    ...(typeof oauthCandidate === 'string' && /^[a-z][a-z0-9_]{1,63}$/u.test(oauthCandidate)
      ? { oauthError: oauthCandidate }
      : {}),
    ...(reason === undefined ? {} : { reason })
  };
}

export function authorizationErrorDiagnostic(error: unknown): Readonly<{
  event: 'oauth.authorization_error';
  name: string;
  code?: string;
  oauthError?: string;
  reason?: OAuthSessionFailureReason;
}> {
  return { event: 'oauth.authorization_error', ...safeOAuthFailure(error) };
}

export function serverErrorDiagnostic(error: unknown): Readonly<{
  event: 'oauth.server_error';
  name: string;
  code?: string;
  oauthError?: string;
  reason?: OAuthSessionFailureReason;
}> {
  return { event: 'oauth.server_error', ...safeOAuthFailure(error) };
}

type OAuthResumeStage =
  | 'interaction_ended'
  | 'authorization_accepted'
  | 'authorization_success';

export function oauthResumeStageDiagnostic(stage: OAuthResumeStage): Readonly<{
  event: `oauth.${OAuthResumeStage}`;
}> {
  return { event: `oauth.${stage}` };
}

export function consentInteractionResult(
  existingGrantId: string | undefined,
  savedGrantId: string
): Readonly<{ consent: Readonly<{ grantId?: string }> }> {
  // Follow oidc-provider's official interaction example: an existing grant is
  // already bound to the session, so only a newly created grant is returned.
  return existingGrantId === undefined
    ? { consent: { grantId: savedGrantId } }
    : { consent: {} };
}

export function consentBootstrapLocation(request: string): string {
  return `/v1/consent/start#request=${encodeURIComponent(request)}`;
}

export function oauthConsentBootstrapMatches(input: Readonly<{
  interactionUid: string;
  clientId: string;
  resource: string;
  scopes: readonly string[];
}>, expected: Readonly<{
  interactionUid: string;
  clientId: string;
  resource: string;
  scopes: readonly string[];
}>): boolean {
  return input.interactionUid === expected.interactionUid && input.clientId === expected.clientId
    && input.resource === expected.resource
    && input.scopes.length === expected.scopes.length
    && input.scopes.every((scope, index) => scope === expected.scopes[index]);
}

export interface ConsentGrantUpdatePlan {
  readonly existingGrantId?: string;
  readonly oidcScopes: readonly ('openid' | 'offline_access')[];
  readonly oidcClaims: readonly string[];
  readonly resourceScopes: readonly Readonly<{ resource: string; scopes: readonly string[] }>[];
}

function boundedStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 32
      || value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 128)) {
    throw new GrantDiagnosticError('consent_plan', 'grant.scope_mismatch');
  }
  return [...new Set(value as string[])];
}

export function consentGrantUpdatePlan(input: Readonly<{
  providerGrantId: unknown;
  platformGrantId: string;
  resource: string;
  scopes: readonly string[];
  promptDetails: Readonly<Record<string, unknown>>;
}>): ConsentGrantUpdatePlan {
  if (input.providerGrantId !== undefined && typeof input.providerGrantId !== 'string') {
    throw new GrantDiagnosticError('consent_plan', 'grant.binding_mismatch');
  }
  if (typeof input.providerGrantId === 'string' && input.providerGrantId !== input.platformGrantId) {
    throw new GrantDiagnosticError('consent_plan', 'grant.binding_mismatch');
  }
  if (input.promptDetails['rar'] !== undefined) throw new GrantDiagnosticError('consent_plan', 'grant.scope_mismatch');

  const oidcScopes = boundedStringArray(input.promptDetails['missingOIDCScope']) ?? [];
  if (oidcScopes.some((scope) => scope !== 'openid' && scope !== 'offline_access')) {
    throw new GrantDiagnosticError('consent_plan', 'grant.scope_mismatch');
  }
  const oidcClaims = boundedStringArray(input.promptDetails['missingOIDCClaims']) ?? [];
  if (oidcClaims.some((claim) => claim !== 'sub')) throw new GrantDiagnosticError('consent_plan', 'grant.scope_mismatch');

  const missingResources = input.promptDetails['missingResourceScopes'];
  const resourceScopes: Array<Readonly<{ resource: string; scopes: readonly string[] }>> = [];
  if (missingResources !== undefined) {
    if (typeof missingResources !== 'object' || missingResources === null || Array.isArray(missingResources)) {
      throw new GrantDiagnosticError('consent_plan', 'grant.resource_mismatch');
    }
    const entries = Object.entries(missingResources);
    if (entries.length !== 1 || entries[0]?.[0] !== input.resource) throw new GrantDiagnosticError('consent_plan', 'grant.resource_mismatch');
    const missing = boundedStringArray(entries[0][1]);
    if (missing === undefined || missing.some((scope) => !input.scopes.includes(scope))) {
      throw new GrantDiagnosticError('consent_plan', 'grant.scope_mismatch');
    }
    resourceScopes.push({ resource: input.resource, scopes: missing });
  }

  return {
    ...(typeof input.providerGrantId === 'string' ? { existingGrantId: input.providerGrantId } : {}),
    oidcScopes: oidcScopes as readonly ('openid' | 'offline_access')[],
    oidcClaims,
    resourceScopes
  };
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
  let accountAuth: Awaited<ReturnType<typeof accountAuthFromEnvironment>> | undefined;
  try {
    await database.assertCandidateMigrationIntegrity();
    const persistentStore = new PostgresPersistentReceiptStore(database, secretArtifactCodecFromEnvironment(environment));
    await persistentStore.assertCompatible();
    const persistentPolicy = new PersistentAuthorizationPolicy(config.persistent.mode);
    const configuredAccountAuth = await accountAuthFromEnvironment(environment, {
      applicationName: 'wepuu-authorization-account-auth',
      databaseRole: 'wepuu_account_auth_reader'
    });
    accountAuth = configuredAccountAuth;
    const signingKeys = new PostgresSigningKeyRepository(database);
    const lifecycle = await signingKeys.loadUsable();
    if (lifecycle.active.custodyProvider !== 'local-pkcs8') throw new Error('local_active_signing_key_required');
    const activeCustody = await localPkcs8KeyCustodyFromEnvironment(
      environment, lifecycle.active.custodyReference, lifecycle.active.kid
    );
    const oauthConsentBootstrapSigner = activeCustody.oauthConsentBootstrapSigner();
    const custody: KeyCustody = {
      describeSigningKey: () => activeCustody.describeSigningKey(),
      async sign(input) {
        if (!await signingKeys.isActive(lifecycle.active.kid)) throw new Error('signing_key_not_active');
        return activeCustody.sign(input);
      }
    };
    const verificationKeys = await Promise.all(lifecycle.verification.map(async (record) => {
      if (record.status === 'active') throw new Error('multiple_active_signing_keys');
      return {
        descriptor: await signingKeyDescriptorFromPublicJwk(record.publicJwk, record.custodyProvider !== 'aws-kms'),
        status: record.status
      };
    }));
    const activeDescriptor = await custody.describeSigningKey();
    const oauthConsentBootstrapVerifier = new JoseOAuthConsentBootstrapVerifier(
      activeDescriptor.publicKey, activeDescriptor.kid
    );
    if (activeDescriptor.publicJwk.n !== lifecycle.active.publicJwk['n']
      || activeDescriptor.publicJwk.e !== lifecycle.active.publicJwk['e']) throw new Error('local_public_key_metadata_mismatch');
    const rateLimitCodec = rateLimitSubjectCodecFromEnvironment(environment);
    const clients = await new PostgresOAuthClientRepository(database).loadActivePublicClients();
    if (clients.filter(client => client.clientId === config.persistent.clientId).length !== 1
      || !(await new PostgresResourceRegistry(database).resolve(config.persistent.resource))?.scopes.includes('mcp:read')) {
      throw new Error('persistent_target_not_registered');
    }
    const providerRequestContext = createGrantRevocationContext();
    const authorizationGrants = new PostgresAuthorizationGrantRepository(database);
    const persistentRuntime = new PersistentReadOnlyRuntime({
      policy: persistentPolicy, clientId: config.persistent.clientId, resource: config.persistent.resource,
      store: persistentStore, lookups: persistentStore.lookups(),
      async resolveBinding(subjectId, grantId) {
        const binding = await persistentStore.resolveApprovedBinding({ subjectId,
          clientId: config.persistent.clientId, resource: config.persistent.resource });
        return binding?.grantId === grantId ? binding : undefined;
      }
    });
    const provider = await createAuthorizationProvider({
      persistentReadOnly: persistentRuntime,
      issuer: config.issuer,
      cookieKeys: config.cookieKeys,
      keyCustody: custody,
      verificationKeys,
      adapter: createOidcAdapterFactory(
        database,
        secretArtifactCodecFromEnvironment(environment),
        rateLimitCodec,
        providerRequestContext.resolve
      ),
      resourceRegistry: new PostgresResourceRegistry(database),
      grantClaimsResolver: new PostgresGrantClaimsResolver(database),
      accountRegistry: new PostgresAccountRegistry(database),
      resourceGrantResolver: authorizationGrants,
      clients
    });
    provider.use(async (context, next): Promise<void> => {
      await providerRequestContext.run(
        context as unknown as ProviderRequestContext,
        async (): Promise<void> => { await next(); }
      );
    });
    const accountAuthLinks = new PostgresAccountAuthLinkStore(database);
    const rateLimiter = new PostgresOAuthRateLimiter(database, rateLimitCodec);
    const revocationSigner = activeCustody.revocationEventSigner();
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
    provider.on('authorization.error', (_context, error) => {
      console.warn(JSON.stringify(grantFailureDiagnostic(error)));
    });
    provider.on('server_error', (_context, error) => {
      console.error(JSON.stringify(grantFailureDiagnostic(error)));
    });
    // These events deliberately record only the protocol stage. They make a
    // stalled authorization resume observable without logging request
    // parameters, interaction identifiers, cookies, tokens, or tenant data.
    provider.on('interaction.ended', () => {
      console.info(JSON.stringify(oauthResumeStageDiagnostic('interaction_ended')));
    });
    provider.on('authorization.accepted', () => {
      console.info(JSON.stringify(oauthResumeStageDiagnostic('authorization_accepted')));
    });
    provider.on('authorization.success', () => {
      console.info(JSON.stringify(oauthResumeStageDiagnostic('authorization_success')));
    });
    provider.proxy = true;
    const callback = provider.callback();
    const server = createServer((request, response) => {
      persistentRuntime.runRequest(response, () => {
      let diagnosticStage: GrantDiagnosticStage = 'interaction';
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
        const accountSession = await configuredAccountAuth.getSession(accountAuthHeaders(request.headers));
        if (accountSession === undefined || accountSession.expiresAt.getTime() <= Date.now()) {
          response.writeHead(303, {
            location: `/v1/account/login?return_to=${encodeURIComponent(path)}`,
            'cache-control': 'no-store'
          });
          response.end();
          return;
        }
        const link = await accountAuthLinks.resolve(accountSession.userId);
        if (link === undefined) {
          response.writeHead(303, {
            location: `/v1/account/login?return_to=${encodeURIComponent(path)}`,
            'cache-control': 'no-store'
          });
          response.end();
          return;
        }
        if (link.accountStatus !== 'active') {
          writeInteractionError(response, 403, 'account_inactive');
          return;
        }
        const session = {
          accountId: link.accountId,
          authenticationTime: Math.floor(accountSession.createdAt.getTime() / 1_000)
        };
        if (details.prompt.name === 'login') {
          diagnosticStage = 'interaction_finish';
          await provider.interactionFinished(request, response, {
            login: { accountId: session.accountId, ts: session.authenticationTime }
          }, { mergeWithLastSubmission: false });
          return;
        }
        if (details.prompt.name !== 'consent') {
          writeInteractionError(response, 400, 'unsupported_prompt');
          return;
        }
        const params = details.params as Record<string, unknown>;
        const clientId = typeof params['client_id'] === 'string' ? params['client_id'] : undefined;
        const resource = interactionResource(params);
        const scopes = interactionScopes(params);
        const interactionCsp = consentInteractionCsp(params['redirect_uri']);
        if (clientId === undefined || resource === undefined || scopes === undefined
          || interactionCsp === undefined) {
          writeInteractionError(response);
          return;
        }
        let submittedForm: URLSearchParams | undefined;
        if (request.method === 'POST') {
          const headerRejection = interactionSubmissionHeaderRejection({
            method: request.method,
            contentType: request.headers['content-type'],
            origin: request.headers.origin,
            expectedOrigin: new URL(config.issuer).origin
          });
          if (headerRejection !== undefined) {
            writeInteractionError(response, headerRejection.status, headerRejection.reason);
            return;
          }
          submittedForm = await readForm(request);
          const localConsentRequest = submittedForm.get('local_consent_request');
          if (submittedForm.get('decision') === 'deny' && localConsentRequest !== null) {
            let bootstrapValid = false;
            try {
              const claims = await oauthConsentBootstrapVerifier.verify(localConsentRequest, {
                issuer: config.issuer,
                audience: `${new URL(config.issuer).origin}/v1/oauth/consent/start`,
                subjectId: session.accountId
              });
              if (!oauthConsentBootstrapMatches(claims, {
                interactionUid: details.uid, clientId, resource, scopes
              })) {
                throw new Error('oauth_consent_bootstrap_mismatch');
              }
              bootstrapValid = true;
            } catch {
              writeInteractionError(response, 400, 'oauth_consent_bootstrap_invalid');
            }
            if (bootstrapValid) {
              diagnosticStage = 'interaction_finish';
              await provider.interactionFinished(request, response, {
                error: 'access_denied', error_description: 'The resource owner denied the request.'
              }, { mergeWithLastSubmission: false });
            }
            return;
          }
        }
        diagnosticStage = 'binding';
        const persistentEligible = clientId === config.persistent.clientId && resource === config.persistent.resource
          && params['scope'] === 'mcp:read' && scopes.length === 1 && scopes[0] === 'mcp:read';
        if (submittedForm?.has('persistent') === true && !persistentEligible) {
          writeInteractionError(response); return;
        }
        const binding = persistentEligible ? await persistentStore.resolveApprovedBinding({
          subjectId: session.accountId, clientId, resource
        }) : await authorizationGrants.resolveExact({
          subjectId: session.accountId, clientId, resource, scopes
        });
        if (binding === undefined) {
          const bootstrapRequest = await oauthConsentBootstrapSigner.sign({
            issuer: config.issuer,
            audience: `${new URL(config.issuer).origin}/v1/oauth/consent/start`,
            subjectId: session.accountId,
            interactionUid: details.uid,
            clientId,
            resource,
            scopes
          });
          response.writeHead(303, {
            location: consentBootstrapLocation(bootstrapRequest),
            'cache-control': 'no-store'
          });
          response.end();
          return;
        }
        const persistentConsent = persistentEligible ? new PersistentConsentController({
          origin: new URL(config.issuer).origin, csrfKey: config.cookieKeys[0] ?? '', policy: persistentPolicy,
          async resolve(uid, accountId) {
            if (uid !== details.uid || accountId !== session.accountId) return undefined;
            const current = await persistentStore.resolveApprovedBinding({ subjectId: accountId, clientId, resource });
            return current?.grantId === binding.grantId ? current : undefined;
          },
          approve: input => persistentStore.createConsent(input)
        }) : undefined;
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
          const consentFields = persistentConsent === undefined
            ? `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">`
            : await persistentConsent.fields(details.uid, session.accountId);
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            // A no-referrer policy serializes Origin as null for a basic HTML
            // form POST. strict-origin preserves the exact same-origin Origin
            // required below without disclosing an interaction path.
            'referrer-policy': INTERACTION_REFERRER_POLICY,
            'content-security-policy': interactionCsp,
            'x-content-type-options': 'nosniff'
          });
          response.end(renderInteractionPage({
            title: `${deployment.productName} authorization`,
            heading: 'Authorize direct MCP access.',
            message: `The client will connect directly to ${displayResource}. WePuu will not receive its tool inputs or results.`,
            content: `<h2>Approved ceiling</h2><ul class="scope-list">${scopeItems}</ul><form method="post" data-wepuu-consent>${consentFields}<div class="actions"><button name="decision" value="approve" type="submit">Approve access</button><button class="danger" name="decision" value="deny" type="submit">Deny</button></div><p data-wepuu-submit-status role="status" hidden>Authorizing…</p></form><script>${CONSENT_SUBMISSION_SCRIPT}</script>`
          }));
          return;
        }
        const form = submittedForm;
        if (form === undefined) {
          writeInteractionError(response, 405, 'method_or_content_type');
          return;
        }
        const csrf = verifyCsrf(form.get('csrf') ?? '', config.cookieKeys[0] ?? '');
        if (csrf === undefined || csrf.uid !== details.uid || csrf.accountId !== session.accountId
          || csrf.grantId !== binding.grantId) {
          writeInteractionError(response, 400, 'csrf_binding_mismatch');
          return;
        }
        if (persistentConsent !== undefined) {
          try {
            await persistentConsent.submit(details.uid, session.accountId, { method: request.method,
              contentType: request.headers['content-type'], origin: request.headers.origin }, form);
          } catch { writeInteractionError(response); return; }
        }
        if (form.get('decision') !== 'approve') {
          diagnosticStage = 'interaction_finish';
          await provider.interactionFinished(request, response, {
            error: 'access_denied', error_description: 'The resource owner denied the request.'
          }, { mergeWithLastSubmission: false });
          return;
        }
        diagnosticStage = 'consent_plan';
        const update = consentGrantUpdatePlan({
          providerGrantId: details.grantId,
          platformGrantId: binding.grantId,
          resource,
          scopes,
          promptDetails: details.prompt.details
        });
        diagnosticStage = 'grant_load';
        const grant = update.existingGrantId === undefined
          ? new provider.Grant({ accountId: session.accountId, clientId })
          : await provider.Grant.find(update.existingGrantId);
        if (grant === undefined) throw new GrantDiagnosticError('grant_load', 'grant.provider_missing');
        if (update.existingGrantId === undefined) Object.assign(grant, { jti: binding.grantId });
        if (update.oidcScopes.length > 0) grant.addOIDCScope(update.oidcScopes.join(' '));
        if (update.oidcClaims.length > 0) grant.addOIDCClaims([...update.oidcClaims]);
        for (const missing of update.resourceScopes) {
          grant.addResourceScope(missing.resource, missing.scopes.join(' '));
        }
        diagnosticStage = 'grant_save';
        const savedGrantId = await grant.save();
        if (savedGrantId !== binding.grantId) throw new GrantDiagnosticError('grant_save', 'grant.binding_mismatch');
        diagnosticStage = 'interaction_finish';
        await provider.interactionFinished(
          request,
          response,
          consentInteractionResult(update.existingGrantId, savedGrantId),
          { mergeWithLastSubmission: true }
        );
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
      } catch (error) {
        console.error(JSON.stringify(grantFailureDiagnostic(error, diagnosticStage)));
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        if (!response.writableEnded) response.end('{"error":"temporarily_unavailable"}');
      }
      })().catch((error: unknown) => {
        console.error(JSON.stringify(grantFailureDiagnostic(error, diagnosticStage)));
        if (!response.headersSent) {
          response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        }
        if (!response.writableEnded) response.end('{"error":"temporarily_unavailable"}');
      });
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
        await configuredAccountAuth.close();
        await database.close();
      }
    };
  } catch (error) {
    await accountAuth?.close();
    await database.close();
    throw error;
  }
}
