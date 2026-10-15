import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ACCOUNT_AUTH_CLIENT_IP_HEADER,
  ACCOUNT_AUTH_DELIVERY_ID_HEADER,
  accountAuthHeaders,
  normalizeAccountEmail,
  type AccountAuth,
  type OtpDeliveryOutcome
} from '@wepuu/account-auth';
import {
  AccountPrincipalSchema,
  CanonicalResourceSchema,
  McpScopeSetSchema,
  OAuthClientIdSchema,
  OpaqueIdSchema,
  PlatformError,
  TenantContextSchema,
  type AccountPrincipal,
  type GrantView,
  type McpScope,
  type SiteView,
  type TenantContext,
  type TenantMembershipView,
  type TenantView
} from '@wepuu/contracts';
import {
  SecurityEventRepository,
  GrantViewRepository,
  SiteRepository,
  TenantRepository,
  type Database,
  type SecurityEventView
} from '@wepuu/database';
import type { OAuthConsentBootstrapClaims } from '@wepuu/key-custody';
import { pairingDiagnostic, type PairingDiagnosticCode, type PairingDiagnosticStage } from '@wepuu/pairing';
import type { SecurityAuditEvent, SecurityAuditSink } from '@wepuu/security-audit';
import {
  loadPublicDeploymentConfig,
  renderInteractionPage,
  UI_CSP,
  UI_STYLES,
  type DeploymentReadinessReport,
  type PublicDeploymentConfig
} from '@wepuu/platform-ui';
import { ContentFreeMetrics } from './operations.js';
import {
  renderAccount,
  renderAccountBootstrapRetry,
  renderActivity,
  renderCompatibility,
  renderEmailLogin,
  renderEmailVerification,
  renderGrantDetail,
  renderGrants,
  renderOverview,
  renderReadiness,
  renderSiteDetail,
  renderSites,
  type TenantPageModel
} from './ui.js';

const TenantParamsSchema = z.object({ tenantId: z.uuid() });
const ObjectParamsSchema = TenantParamsSchema.extend({ objectId: OpaqueIdSchema });
const SiteParamsSchema = TenantParamsSchema.extend({ siteId: OpaqueIdSchema });
const GrantParamsSchema = TenantParamsSchema.extend({ grantId: OpaqueIdSchema });
const ActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  outcome: z.enum(['success', 'denied', 'error']).optional()
}).strict();
const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u);
const AccountLoginQuerySchema = z.object({ return_to: z.string().max(2_048).optional() }).strict();
const ConsoleRequestQuerySchema = z.object({ request: z.string().regex(/^console_[A-Za-z0-9_-]{32}$/u) }).strict();
const ConsoleExchangeSchema = z.object({
  request: z.string().regex(/^console_[A-Za-z0-9_-]{32}$/u),
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/u)
}).strict();
const ConsoleLogoutSchema = z.object({
  csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  request: z.string().regex(/^console_[A-Za-z0-9_-]{32}$/u)
}).strict();
const LoginTransactionSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const LoginMutationBaseSchema = z.object({
  csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  transaction: LoginTransactionSchema
}).strict();
const EmailSendFormSchema = LoginMutationBaseSchema.extend({
  email: z.string().min(3).max(320)
}).strict();
const EmailVerifyFormSchema = EmailSendFormSchema.extend({
  otp: z.string().regex(/^\d{6}$/u)
}).strict();
const PairingBodySchema = z.object({
  resource: z.string().min(1).max(2_048),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u)
}).strict();
const GrantStartBodySchema = z.object({
  client_id: OAuthClientIdSchema,
  scopes: McpScopeSetSchema
}).strict();
const GrantCompletionBodySchema = z.object({
  proof: z.string().min(1).max(16 * 1_024),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  decision: z.enum(['approved', 'denied'])
}).strict();
const OAuthConsentStartBodySchema = z.object({ request: z.string().min(1).max(8192) }).strict();
const OAuthConsentBootstrapClaimsSchema = z.object({
  interactionUid: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/u),
  clientId: OAuthClientIdSchema,
  resource: CanonicalResourceSchema,
  scopes: McpScopeSetSchema,
  subjectId: OpaqueIdSchema,
  jwtId: z.string().regex(/^[A-Za-z0-9_-]{32}$/u)
}).strict();
const SESSION_COOKIE = '__Host-wepuu_session';
const CSRF_COOKIE = '__Host-wepuu_csrf';
const CONSOLE_SESSION_COOKIE = '__Host-wepuu_console';
const CONSOLE_LOGIN_COOKIE_PREFIX = '__Host-wepuu_console_login_';
const UiFormSchema = z.object({
  csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  idempotency_key: IdempotencyKeySchema
}).strict();

export interface AccountIdentityProvider {
  authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined>;
}

export class DenyAllAccountIdentityProvider implements AccountIdentityProvider {
  authenticate(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

export interface AccountSessionStore {
  resolve(sessionHash: Uint8Array): Promise<{ accountId: string; authenticationTime: number } | undefined>;
}

export interface ConsoleAuthStore {
  createLogin(returnPath: string): Promise<{
    readonly requestId: string; readonly browserSecret: string; readonly expiresAt: Date;
  }>;
  authorizeLogin(input: {
    readonly requestId: string; readonly authSessionId: string; readonly accountId: string;
    readonly authExpiresAt: Date;
  }): Promise<{ readonly requestId: string; readonly code: string; readonly expiresAt: Date }>;
  exchangeLogin(input: {
    readonly requestId: string; readonly browserSecret: string; readonly code: string;
  }): Promise<{
    readonly token: string; readonly accountId: string; readonly authenticationTime: number;
    readonly returnPath: string; readonly expiresAt: Date;
  }>;
  resolveSession(sessionHash: Uint8Array): Promise<{
    readonly accountId: string; readonly authenticationTime: number;
  } | undefined>;
  beginLogout(sessionHash: Uint8Array, returnPath: string): Promise<{ readonly requestId: string }>;
  validateLogout(requestId: string, authSessionId: string, consume?: boolean): Promise<string>;
}

export interface AccountAuthLinkStore {
  provision(authUserId: string): Promise<{
    readonly accountId: string;
    readonly homeTenantId: string;
    readonly accountStatus: 'active' | 'suspended' | 'deleted';
  }>;
  resolve(authUserId: string): Promise<{
    readonly accountId: string;
    readonly homeTenantId: string;
    readonly accountStatus: 'active' | 'suspended' | 'deleted';
  } | undefined>;
}

export interface AccountLoginTransactionStore {
  create(returnPath: string, csrf: string): Promise<{
    readonly token: string;
    readonly returnPath: string;
    readonly expiresAt: Date;
  }>;
  bindEmail(token: string, csrf: string, email: string): Promise<void>;
  restart(token: string, csrf: string): Promise<{
    readonly token: string;
    readonly returnPath: string;
    readonly expiresAt: Date;
  }>;
  complete(token: string, csrf: string, authUserId: string): Promise<{
    readonly accountId: string;
    readonly homeTenantId: string;
    readonly accountStatus: 'active' | 'suspended' | 'deleted';
    readonly returnPath: string;
  }>;
}

export class BetterAuthAccountIdentityProvider implements AccountIdentityProvider {
  readonly #auth: Pick<AccountAuth, 'getSession'>;
  readonly #links: AccountAuthLinkStore;
  readonly #provisionMissing: boolean;

  constructor(options: Readonly<{
    auth: Pick<AccountAuth, 'getSession'>;
    links: AccountAuthLinkStore;
    provisionMissing?: boolean;
  }>) {
    this.#auth = options.auth;
    this.#links = options.links;
    this.#provisionMissing = options.provisionMissing ?? false;
  }

  async authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined> {
    const session = await this.#auth.getSession(accountAuthHeaders(request.headers));
    if (session === undefined || session.expiresAt.getTime() <= Date.now()) return undefined;
    const existing = await this.#links.resolve(session.userId);
    const link = existing ?? (this.#provisionMissing ? await this.#links.provision(session.userId) : undefined);
    if (link === undefined || link.accountStatus !== 'active') return undefined;
    return AccountPrincipalSchema.parse({
      accountId: link.accountId,
      authenticationTime: Math.floor(session.createdAt.getTime() / 1_000),
      authenticationMethod: 'email_otp'
    });
  }
}

function requestCookie(request: FastifyRequest, cookieName: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return value.join('=');
  }
  return undefined;
}

function sessionCookie(request: FastifyRequest): string | undefined {
  return requestCookie(request, SESSION_COOKIE);
}

function secureCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${String(Math.max(0, Math.trunc(maxAgeSeconds)))}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function consoleLoginCookieName(requestId: string): string {
  return `${CONSOLE_LOGIN_COOKIE_PREFIX}${requestId}`;
}

function clearCookie(name: string): string {
  return secureCookie(name, '', 0);
}

function csrfCookie(value: string): string {
  return `${CSRF_COOKIE}=${value}; Max-Age=43200; Path=/; Secure; SameSite=Lax`;
}

function sameSecret(first: string, second: string): boolean {
  const left = Buffer.from(first, 'utf8');
  const right = Buffer.from(second, 'utf8');
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export class SessionAccountIdentityProvider implements AccountIdentityProvider {
  readonly #sessions: AccountSessionStore;

  constructor(sessions: AccountSessionStore) {
    this.#sessions = sessions;
  }

  async authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined> {
    const token = sessionCookie(request);
    if (token === undefined || !/^[A-Za-z0-9_-]{43,128}$/u.test(token)) return undefined;
    const session = await this.#sessions.resolve(createHash('sha256').update(token, 'utf8').digest());
    return session === undefined ? undefined : AccountPrincipalSchema.parse({
      accountId: session.accountId,
      authenticationTime: session.authenticationTime,
      authenticationMethod: 'oidc'
    });
  }
}

export class ConsoleSessionAccountIdentityProvider implements AccountIdentityProvider {
  readonly #sessions: Pick<ConsoleAuthStore, 'resolveSession'>;

  constructor(sessions: Pick<ConsoleAuthStore, 'resolveSession'>) {
    this.#sessions = sessions;
  }

  async authenticate(request: FastifyRequest): Promise<AccountPrincipal | undefined> {
    const token = requestCookie(request, CONSOLE_SESSION_COOKIE);
    if (token === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return undefined;
    const session = await this.#sessions.resolveSession(createHash('sha256').update(token, 'utf8').digest());
    return session === undefined ? undefined : AccountPrincipalSchema.parse({
      accountId: session.accountId,
      authenticationTime: session.authenticationTime,
      authenticationMethod: 'email_otp'
    });
  }
}

export interface ControlStore {
  findTenant(context: TenantContext): Promise<TenantView | undefined>;
  listSecurityEvents(
    context: TenantContext,
    limit: number,
    offset?: number,
    outcome?: SecurityEventView['outcome']
  ): Promise<readonly SecurityEventView[]>;
  listSites(context: TenantContext): Promise<readonly SiteView[]>;
  findActiveSite(context: TenantContext, siteId: string): Promise<SiteView | undefined>;
  listGrants(context: TenantContext): Promise<readonly GrantView[]>;
  revokeGrant(context: TenantContext, grantId: string): Promise<boolean>;
  disconnectSite(context: TenantContext, siteId: string): Promise<boolean>;
}

export class PostgresControlStore implements ControlStore {
  readonly #database: Database;
  readonly #tenants = new TenantRepository();
  readonly #events = new SecurityEventRepository();
  readonly #sites = new SiteRepository();
  readonly #grants = new GrantViewRepository();

  constructor(database: Database) {
    this.#database = database;
  }

  async findTenant(context: TenantContext): Promise<TenantView | undefined> {
    return this.#database.withTenant(context, (client) => this.#tenants.findById(client, context.tenantId));
  }

  async listSecurityEvents(
    context: TenantContext,
    limit: number,
    offset = 0,
    outcome?: SecurityEventView['outcome']
  ): Promise<readonly SecurityEventView[]> {
    return this.#database.withTenant(context, (client) => this.#events.list(client, limit, offset, outcome));
  }

  async listSites(context: TenantContext): Promise<readonly SiteView[]> {
    return this.#database.withTenant(context, (client) => this.#sites.list(client));
  }

  async findActiveSite(context: TenantContext, siteId: string): Promise<SiteView | undefined> {
    return this.#database.withTenant(context, (client) => this.#sites.findActive(client, context.tenantId, siteId));
  }

  async listGrants(context: TenantContext): Promise<readonly GrantView[]> {
    return this.#database.withTenant(context, (client) => this.#grants.list(client));
  }

  async revokeGrant(context: TenantContext, grantId: string): Promise<boolean> {
    return this.#database.withTenant(context, (client) => this.#grants.revoke(client, context.tenantId, grantId));
  }

  async disconnectSite(context: TenantContext, siteId: string): Promise<boolean> {
    return this.#database.withTenant(context, (client) => this.#sites.disconnect(client, context.tenantId, siteId));
  }
}

export interface ControlApiOptions {
  readonly identityProvider: AccountIdentityProvider;
  readonly store: ControlStore;
  readonly audit: SecurityAuditSink;
  readonly readiness?: () => Promise<void>;
  readonly accountAuth?: AccountAuth;
  readonly loginTransactions?: AccountLoginTransactionStore;
  readonly consoleAuth?: ConsoleAuthStore;
  readonly consoleIdentityProvider?: AccountIdentityProvider;
  readonly publicOrigin?: string;
  readonly authOrigin?: string;
  readonly appOrigin?: string;
  readonly pairing?: PairingOperations;
  readonly pairingDiagnostics?: PairingDiagnosticSink;
  readonly grants?: GrantOperations;
  readonly oauthIssuer?: string;
  readonly oauthConsentBootstrap?: OAuthConsentBootstrapVerifier;
  readonly workspace?: AccountWorkspaceOperations;
  readonly deployment?: PublicDeploymentConfig;
  readonly deploymentReadiness?: DeploymentReadinessReport;
  readonly operationsMetricsToken?: string;
  readonly metrics?: ContentFreeMetrics;
}

export interface OAuthConsentBootstrapVerifier {
  verify(token: string, expected: Readonly<{
    issuer: string;
    audience: string;
    subjectId: string;
  }>): Promise<OAuthConsentBootstrapClaims>;
}

function validatedReturnTo(value: string | undefined): string {
  const returnTo = value ?? '/app';
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) {
    throw new PlatformError('invalid_request', 400);
  }
  const parsed = new URL(returnTo, 'https://return.invalid');
  if (parsed.origin !== 'https://return.invalid' || parsed.username !== '' || parsed.password !== ''
    || parsed.hash !== '') throw new PlatformError('invalid_request', 400);
  return `${parsed.pathname}${parsed.search}`;
}

async function sendAccountAuthResponse(reply: FastifyReply, response: Response): Promise<unknown> {
  for (const [name, value] of response.headers.entries()) {
    if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const body = response.body === null ? undefined : Buffer.from(await response.arrayBuffer());
  return reply.status(response.status).send(body);
}

function forwardAccountAuthHeaders(reply: FastifyReply, response: Response): void {
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  for (const name of ['retry-after', 'x-retry-after'] as const) {
    const value = response.headers.get(name);
    if (value !== null) reply.header(name, value);
  }
}

export interface AccountWorkspaceOperations {
  ensurePersonalWorkspace(accountId: string): Promise<TenantMembershipView>;
  listMemberships(accountId: string): Promise<readonly TenantMembershipView[]>;
}

export interface PairingOperations {
  pair(context: TenantContext, input: { readonly resource: string; readonly verifier: string }): Promise<{
    readonly siteId: string;
  }>;
}

export interface PairingDiagnosticEvent {
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly stage: PairingDiagnosticStage;
  readonly code: PairingDiagnosticCode;
}

export interface PairingDiagnosticSink {
  write(event: PairingDiagnosticEvent): void | Promise<void>;
}

export interface GrantOperations {
  start(context: TenantContext, input: {
    readonly siteId: string;
    readonly clientId: string;
    readonly scopes: readonly McpScope[];
    readonly idempotencyKey: string;
  }): Promise<{ readonly grantId: string; readonly consentUrl: string; readonly expiresAt: Date }>;
  complete(context: TenantContext, input: {
    readonly grantId: string;
    readonly proof: string;
    readonly challenge: string;
    readonly decision: 'approved' | 'denied';
    readonly idempotencyKey: string;
  }): Promise<void>;
}

const pairingStartScript = `(() => {
  const key = 'wepuu_pairing_payload';
  const status = document.getElementById('status');
  const fromFragment = new URLSearchParams(location.hash.slice(1)).get('payload');
  if (fromFragment !== null) {
    if (fromFragment.length > 4096) { history.replaceState(null, '', '/v1/pairing/start'); status.textContent = 'Invalid pairing request.'; return; }
    sessionStorage.setItem(key, fromFragment);
    history.replaceState(null, '', '/v1/pairing/start');
  }
  const encoded = sessionStorage.getItem(key);
  if (encoded === null) { status.textContent = 'No pending pairing request.'; return; }
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof input !== 'object' || input === null || typeof input.tenant_id !== 'string' || typeof input.resource !== 'string' || typeof input.verifier !== 'string') throw new Error();
    fetch('/v1/tenants/' + encodeURIComponent(input.tenant_id) + '/pairing', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resource: input.resource, verifier: input.verifier })
    }).then((response) => {
      if (response.status === 401) {
        location.assign('/v1/account/login?return_to=%2Fv1%2Fpairing%2Fstart');
        return;
      }
      sessionStorage.removeItem(key);
      status.textContent = response.ok ? 'Pairing completed. You may return to WordPress.' : 'Pairing failed. Return to WordPress and start again.';
    }).catch(() => { sessionStorage.removeItem(key); status.textContent = 'Pairing failed. Return to WordPress and start again.'; });
  } catch { sessionStorage.removeItem(key); status.textContent = 'Invalid pairing request.'; }
})();`;

const consentCompleteScript = `(() => {
  const key = 'wepuu_consent_result';
  const returnKey = 'wepuu_oauth_interaction_return';
  const requestKey = 'wepuu_oauth_consent_request';
  const status = document.getElementById('status');
  const fromFragment = new URLSearchParams(location.hash.slice(1)).get('result');
  if (fromFragment !== null) {
    if (fromFragment.length > 32768) { history.replaceState(null, '', '/v1/consent/complete'); status.textContent = 'Invalid consent result.'; return; }
    sessionStorage.setItem(key, fromFragment);
    history.replaceState(null, '', '/v1/consent/complete');
  }
  const encoded = sessionStorage.getItem(key);
  if (encoded === null) { status.textContent = 'No pending consent result.'; return; }
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof input !== 'object' || input === null || typeof input.tenant_id !== 'string' || typeof input.grant_id !== 'string' || typeof input.proof !== 'string' || typeof input.challenge !== 'string' || typeof input.decision !== 'string' || typeof input.idempotency_key !== 'string') throw new Error();
    fetch('/v1/tenants/' + encodeURIComponent(input.tenant_id) + '/grants/' + encodeURIComponent(input.grant_id) + '/complete', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'idempotency-key': input.idempotency_key },
      body: JSON.stringify({ proof: input.proof, challenge: input.challenge, decision: input.decision })
    }).then((response) => {
      if (response.status === 401) { location.assign('/v1/account/login?return_to=%2Fv1%2Fconsent%2Fcomplete'); return; }
      if (!response.ok) { status.textContent = 'Consent completion failed.'; return; }
      const returnPath = sessionStorage.getItem(returnKey);
      if (returnPath !== null && new RegExp('^/interaction/[A-Za-z0-9_-]{8,256}$').test(returnPath)) {
        const bootstrapRequest = sessionStorage.getItem(requestKey);
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(returnKey);
        sessionStorage.removeItem(requestKey);
        if (input.decision === 'denied' && bootstrapRequest !== null) {
          const form = document.createElement('form');
          form.method = 'post';
          form.action = returnPath;
          for (const [name, value] of [['decision', 'deny'], ['local_consent_request', bootstrapRequest]]) {
            const field = document.createElement('input');
            field.type = 'hidden'; field.name = name; field.value = value; form.appendChild(field);
          }
          document.body.appendChild(form);
          form.submit();
          return;
        }
        if (input.decision === 'approved') { location.assign(returnPath); return; }
        status.textContent = 'Consent denied.';
        return;
      }
      sessionStorage.removeItem(key);
      status.textContent = input.decision === 'approved' ? 'Consent completed.' : 'Consent denied.';
    }).catch(() => { status.textContent = 'Consent completion failed. You may retry this page.'; });
  } catch { sessionStorage.removeItem(key); status.textContent = 'Invalid consent result.'; }
})();`;

const consentStartScript = `(() => {
  const key = 'wepuu_oauth_consent_request';
  const returnKey = 'wepuu_oauth_interaction_return';
  const status = document.getElementById('status');
  const fromFragment = new URLSearchParams(location.hash.slice(1)).get('request');
  if (fromFragment !== null) {
    if (fromFragment.length > 8192) { history.replaceState(null, '', '/v1/consent/start'); status.textContent = 'Invalid authorization request.'; return; }
    sessionStorage.setItem(key, fromFragment);
    history.replaceState(null, '', '/v1/consent/start');
  }
  const request = sessionStorage.getItem(key);
  if (request === null) { status.textContent = 'No pending authorization request.'; return; }
  try {
    fetch('/v1/oauth/consent/start', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request })
    }).then(async (response) => {
      if (response.status === 401) {
        location.assign('/v1/account/login?return_to=%2Fv1%2Fconsent%2Fstart');
        return;
      }
      if (!response.ok) {
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(returnKey);
        status.textContent = 'Authorization setup failed.';
        return;
      }
      const result = await response.json();
      if (typeof result !== 'object' || result === null || typeof result.consent_url !== 'string'
        || typeof result.return_path !== 'string' || !new RegExp('^/interaction/[A-Za-z0-9_-]{8,256}$').test(result.return_path)) throw new Error();
      sessionStorage.setItem(returnKey, result.return_path);
      location.assign(result.consent_url);
    }).catch(() => { status.textContent = 'Authorization setup failed. You may retry this page.'; });
  } catch {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(returnKey);
    status.textContent = 'Invalid authorization request.';
  }
})();`;

const emailOtpScript = `(() => {
  const button = document.querySelector('[data-retry-after]');
  if (!(button instanceof HTMLButtonElement)) return;
  let remaining = Number(button.dataset.retryAfter || '0');
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  button.disabled = true;
  const tick = () => {
    remaining -= 1;
    if (remaining <= 0) {
      button.disabled = false;
      button.textContent = 'Resend code';
      return;
    }
    button.textContent = 'Resend code in ' + String(remaining) + 's';
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
})();`;

const consoleHandoffScript = `(() => {
  const status = document.getElementById('status');
  const parameters = new URLSearchParams(location.hash.slice(1));
  const request = parameters.get('request');
  const code = parameters.get('code');
  history.replaceState(null, '', location.pathname);
  if (!(status instanceof HTMLElement) || request === null || code === null) {
    if (status instanceof HTMLElement) status.textContent = 'This sign-in link is invalid or expired.';
    return;
  }
  fetch('/v1/session/exchange', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request, code })
  }).then(async (response) => {
    if (!response.ok) throw new Error('exchange_failed');
    const body = await response.json();
    if (typeof body.location !== 'string' || !body.location.startsWith('/app')) throw new Error('location_invalid');
    location.replace(body.location);
  }).catch(() => { status.textContent = 'Sign-in could not be completed. Start again from the console.'; });
})();`;

function correlationId(): string {
  return randomBytes(18).toString('base64url');
}

export function buildControlApi(options: ControlApiOptions): FastifyInstance {
  const authOrigin = new URL(options.authOrigin ?? options.publicOrigin ?? 'https://platform.example.test').origin;
  const appOrigin = new URL(options.appOrigin ?? options.publicOrigin ?? authOrigin).origin;
  const splitOrigins = authOrigin !== appOrigin;
  const deployment = options.deployment ?? loadPublicDeploymentConfig({
    WEPUU_DEPLOYMENT_MODE: 'test',
    WEPUU_APP_PUBLIC_ORIGIN: appOrigin,
    WEPUU_CONTROL_PUBLIC_ORIGIN: appOrigin
  }, appOrigin);
  const app = Fastify({
    logger: false,
    bodyLimit: 16 * 1024,
    trustProxy: deployment.trustedProxyCidrs.length === 0 ? false : [...deployment.trustedProxyCidrs],
    logController: new LogController({ disableRequestLogging: true })
  });
  const metrics = options.metrics ?? new ContentFreeMetrics();
  const requestStarts = new WeakMap<object, bigint>();
  app.addHook('onRequest', (request, _reply, done) => {
    requestStarts.set(request, process.hrtime.bigint());
    done();
  });
  app.addHook('onResponse', (request, reply, done) => {
    const startedAt = requestStarts.get(request);
    const elapsed = startedAt === undefined ? 0 : Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    metrics.record(reply.statusCode, elapsed);
    done();
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, typeof body === 'string' ? body : body.toString('utf8'));
    } catch (error) {
      done(error as Error);
    }
  });

  function requestBoundary(request: FastifyRequest): 'auth' | 'app' | 'unknown' {
    if (!splitOrigins) return 'auth';
    const host = request.headers.host?.toLowerCase();
    if (host === new URL(authOrigin).host.toLowerCase()) return 'auth';
    if (host === new URL(appOrigin).host.toLowerCase()) return 'app';
    return 'unknown';
  }

  app.addHook('preHandler', async (request, reply) => {
    if (!splitOrigins) return;
    const path = (request.raw.url ?? '/').split('?', 1)[0] ?? '/';
    const boundary = requestBoundary(request);
    const appAccountRoute = path === '/v1/account/tenants'
      || path === '/v1/account/deployment-readiness';
    const authOnly = (path.startsWith('/v1/account') && !appAccountRoute) || path.startsWith('/v1/pairing')
      || path.startsWith('/v1/consent') || path.startsWith('/v1/oauth')
      || /^\/v1\/tenants\/[^/]+\/pairing$/u.test(path)
      || /^\/v1\/tenants\/[^/]+\/grants\/[^/]+\/complete$/u.test(path);
    const appOnly = path.startsWith('/app') || path.startsWith('/v1/console')
      || path.startsWith('/v1/session') || appAccountRoute
      || (path.startsWith('/v1/tenants') && !authOnly);
    if (path.startsWith('/app') && boundary === 'auth') {
      return reply.status(303).header('cache-control', 'no-store')
        .header('location', new URL(request.raw.url ?? '/app', appOrigin).href).send();
    }
    if (boundary === 'unknown'
        || (appOnly && boundary !== 'app') || (authOnly && boundary !== 'auth')) {
      throw new PlatformError('not_found', 404);
    }
  });

  async function safeAudit(event: SecurityAuditEvent): Promise<void> {
    try {
      await options.audit.write(event);
    } catch {
      // Audit failure must not disclose internals or turn a denied request into an allowed request.
    }
  }

  async function safePairingDiagnostic(event: PairingDiagnosticEvent): Promise<void> {
    try {
      await options.pairingDiagnostics?.write(event);
    } catch {
      // Diagnostic output is best-effort and must never alter fail-closed behavior.
    }
  }

  async function requestContext(request: FastifyRequest): Promise<TenantContext> {
    const principal = await identityProviderFor(request).authenticate(request);
    const parsed = TenantParamsSchema.safeParse(request.params);
    const requestCorrelationId = correlationId();
    if (principal === undefined) {
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: 'account.authentication_denied',
        outcome: 'denied',
        reason: 'identity_missing',
        correlationId: requestCorrelationId,
        ...(parsed.success ? { tenantId: parsed.data.tenantId } : {}),
        service: 'control-api',
        serviceVersion: '0.5.0'
      });
      throw new PlatformError('unauthenticated', 401);
    }
    const identity = AccountPrincipalSchema.parse(principal);
    if (!parsed.success) throw new PlatformError('invalid_request', 400);
    return TenantContextSchema.parse({
      tenantId: parsed.data.tenantId,
      accountId: identity.accountId,
      correlationId: requestCorrelationId
    });
  }

  async function authenticatedPrincipal(request: FastifyRequest): Promise<AccountPrincipal> {
    const principal = await identityProviderFor(request).authenticate(request);
    if (principal === undefined) throw new PlatformError('unauthenticated', 401);
    return AccountPrincipalSchema.parse(principal);
  }

  function identityProviderFor(request: FastifyRequest): AccountIdentityProvider {
    if (splitOrigins && requestBoundary(request) === 'app') {
      if (options.consoleIdentityProvider === undefined) throw new PlatformError('temporarily_unavailable', 503);
      return options.consoleIdentityProvider;
    }
    return options.identityProvider;
  }

  function uiCsrf(request: FastifyRequest): { readonly value: string; readonly setCookie?: string } {
    const existing = requestCookie(request, CSRF_COOKIE);
    if (existing !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(existing)) return { value: existing };
    const value = randomBytes(32).toString('base64url');
    return { value, setCookie: csrfCookie(value) };
  }

  function validateUiMutation(request: FastifyRequest): z.infer<typeof UiFormSchema> {
    if (request.headers.origin !== appOrigin) {
      throw new PlatformError('forbidden', 403);
    }
    const formInput = typeof request.body === 'string'
      ? Object.fromEntries(new URLSearchParams(request.body))
      : request.body;
    const form = UiFormSchema.safeParse(formInput);
    const cookie = requestCookie(request, CSRF_COOKIE);
    if (!form.success || cookie === undefined || !sameSecret(cookie, form.data.csrf)) {
      throw new PlatformError('forbidden', 403);
    }
    return form.data;
  }

  function loginFormInput(request: FastifyRequest): Record<string, unknown> {
    if (request.headers.origin !== authOrigin) {
      throw new PlatformError('forbidden', 403);
    }
    if (typeof request.body === 'string') return Object.fromEntries(new URLSearchParams(request.body));
    if (typeof request.body === 'object' && request.body !== null) return request.body as Record<string, unknown>;
    throw new PlatformError('invalid_request', 400);
  }

  function validateLoginMutation<T extends z.ZodType>(request: FastifyRequest, schema: T): z.infer<T> {
    const input = loginFormInput(request);
    const csrf = z.string().regex(/^[A-Za-z0-9_-]{43}$/u).safeParse(input['csrf']);
    const cookie = requestCookie(request, CSRF_COOKIE);
    if (!csrf.success || cookie === undefined || !sameSecret(cookie, csrf.data)) {
      throw new PlatformError('forbidden', 403);
    }
    const form = schema.safeParse(input);
    if (!form.success) throw new PlatformError('invalid_request', 400);
    return form.data;
  }

  async function accountAuthPost(
    request: FastifyRequest,
    path: '/email-otp/send-verification-otp' | '/sign-in/email-otp',
    body: Record<string, string>,
    deliveryId?: string
  ): Promise<Response> {
    if (options.accountAuth === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const headers = new Headers({
      origin: authOrigin,
      'content-type': 'application/json',
      [ACCOUNT_AUTH_CLIENT_IP_HEADER]: request.ip
    });
    if (deliveryId !== undefined) headers.set(ACCOUNT_AUTH_DELIVERY_ID_HEADER, deliveryId);
    if (request.headers.cookie !== undefined) headers.set('cookie', request.headers.cookie);
    if (request.headers['user-agent'] !== undefined) headers.set('user-agent', request.headers['user-agent']);
    return options.accountAuth.handle(new Request(new URL(`/api/auth${path}`, authOrigin), {
      method: 'POST', headers, body: JSON.stringify(body)
    }));
  }

  function headersWithResponseCookies(request: FastifyRequest, response: Response): Headers {
    const cookieValues = [request.headers.cookie ?? '', ...response.headers.getSetCookie()
      .map((cookie) => cookie.split(';', 1)[0] ?? '')].filter((value) => value !== '');
    return new Headers(cookieValues.length === 0 ? {} : { cookie: cookieValues.join('; ') });
  }

  async function completeLogin(
    transaction: string,
    csrf: string,
    sessionHeaders: Headers
  ): Promise<string> {
    if (options.accountAuth === undefined || options.loginTransactions === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const session = await options.accountAuth.getSession(sessionHeaders);
    if (session === undefined || session.expiresAt.getTime() <= Date.now()) {
      throw new PlatformError('unauthenticated', 401);
    }
    const completed = await options.loginTransactions.complete(transaction, csrf, session.userId);
    if (completed.accountStatus !== 'active') throw new PlatformError('forbidden', 403);
    return completed.returnPath;
  }

  function hasOperationsAccess(request: FastifyRequest): boolean {
    const token = options.operationsMetricsToken;
    const authorization = request.headers.authorization;
    if (token === undefined || token.length < 32 || authorization === undefined || !authorization.startsWith('Bearer ')) {
      return false;
    }
    return sameSecret(token, authorization.slice('Bearer '.length));
  }

  async function membershipsFor(request: FastifyRequest): Promise<{
    readonly principal: AccountPrincipal;
    readonly memberships: readonly TenantMembershipView[];
  }> {
    const principal = await authenticatedPrincipal(request);
    if (options.workspace === undefined) throw new PlatformError('temporarily_unavailable', 503);
    return { principal, memberships: await options.workspace.listMemberships(principal.accountId) };
  }

  async function uiMembershipsFor(request: FastifyRequest, reply: FastifyReply): Promise<{
    readonly principal: AccountPrincipal;
    readonly memberships: readonly TenantMembershipView[];
  } | undefined> {
    try {
      return await membershipsFor(request);
    } catch (error) {
      if (error instanceof PlatformError && error.code === 'unauthenticated') {
        const target = new URL(request.raw.url ?? '/app', appOrigin);
        const returnTo = `${target.pathname}${target.search}`;
        await reply.status(303).header('cache-control', 'no-store')
          .header('location', splitOrigins
            ? `/v1/console/login?return_to=${encodeURIComponent(returnTo)}`
            : `/v1/account/login?return_to=${encodeURIComponent(returnTo)}`).send();
        return undefined;
      }
      throw error;
    }
  }

  async function tenantPageModel(
    request: FastifyRequest,
    activity?: { readonly page: number; readonly outcome?: SecurityEventView['outcome'] }
  ): Promise<TenantPageModel> {
    const { principal, memberships } = await membershipsFor(request);
    const params = TenantParamsSchema.safeParse(request.params);
    if (!params.success) throw new PlatformError('invalid_request', 400);
    const membership = memberships.find((candidate) => candidate.tenantId === params.data.tenantId);
    if (membership === undefined) throw new PlatformError('not_found', 404);
    const context = TenantContextSchema.parse({
      tenantId: membership.tenantId,
      accountId: principal.accountId,
      correlationId: correlationId()
    });
    if (await options.store.findTenant(context) === undefined) throw new PlatformError('not_found', 404);
    const pageSize = 20;
    const eventLimit = activity === undefined ? 50 : pageSize + 1;
    const eventOffset = activity === undefined ? 0 : (activity.page - 1) * pageSize;
    const [sites, grants, eventRows] = await Promise.all([
      options.store.listSites(context), options.store.listGrants(context),
      options.store.listSecurityEvents(context, eventLimit, eventOffset, activity?.outcome)
    ]);
    const csrf = uiCsrf(request);
    if (csrf.setCookie !== undefined) {
      (request as FastifyRequest & { wepuuCsrfCookie?: string }).wepuuCsrfCookie = csrf.setCookie;
    }
    const events = activity === undefined ? eventRows : eventRows.slice(0, pageSize);
    return {
      deployment, membership, sites, grants, events, csrfToken: csrf.value,
      ...(activity === undefined ? {} : {
        activity: { ...activity, hasNext: eventRows.length > pageSize }
      })
    };
  }

  function htmlHeaders(reply: FastifyReply, setCookie?: string): FastifyReply {
    reply.header('cache-control', 'no-store')
      // Native same-origin form POSTs need a tuple Origin for the exact-Origin
      // CSRF gate. Fetch serializes it as `null` under `no-referrer`.
      .header('referrer-policy', 'same-origin')
      .header('content-security-policy', UI_CSP)
      .header('x-content-type-options', 'nosniff')
      .header('x-frame-options', 'DENY');
    if (setCookie !== undefined) reply.header('set-cookie', setCookie);
    return reply;
  }

  app.get('/assets/wepuu-v1.css', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/css; charset=utf-8')
    .send(UI_STYLES));

  app.get('/assets/pairing-v1.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(pairingStartScript));

  app.get('/assets/consent-complete-v1.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(consentCompleteScript));

  app.get('/assets/consent-complete-v2.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(consentCompleteScript));

  app.get('/assets/consent-start-v1.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(consentStartScript));

  app.get('/assets/email-otp-v1.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(emailOtpScript));

  app.get('/assets/console-handoff-v1.js', async (_request, reply) => reply
    .header('cache-control', 'public, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(consoleHandoffScript));

  const live = async (_request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
    reply.header('cache-control', 'no-store').send({ status: 'live' });
  const ready = async (_request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    try {
      if (options.readiness === undefined) throw new Error('readiness_not_configured');
      await options.readiness();
      return await reply.header('cache-control', 'no-store').send({ status: 'ready' });
    } catch {
      return await reply.status(503).header('cache-control', 'no-store').send({ error: 'temporarily_unavailable' });
    }
  };
  app.get('/health/live', live);
  app.get('/health/ready', ready);
  app.get('/livez', live);
  app.get('/readyz', ready);

  app.get('/internal/metrics', async (request, reply) => {
    if (!hasOperationsAccess(request)) throw new PlatformError('not_found', 404);
    let remaining: number | undefined;
    try { remaining = await options.accountAuth?.otpBudgetRemaining?.(); }
    catch { throw new PlatformError('temporarily_unavailable', 503); }
    return reply.header('cache-control', 'no-store')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(metrics.render(remaining));
  });

  app.get('/v1/pairing/start', async (_request, reply) => {
    return htmlHeaders(reply)
      .type('text/html; charset=utf-8')
      .send(renderInteractionPage({
        title: 'WePuu site pairing',
        heading: 'Connect this WordPress site.',
        message: 'Verifying the site proof. WordPress content does not pass through WePuu.',
        content: '<p id="status" role="status">Verifying the site…</p><script src="/assets/pairing-v1.js" defer></script>'
      }));
  });

  app.get('/v1/consent/complete', async (_request, reply) => {
    return htmlHeaders(reply)
      .type('text/html; charset=utf-8')
      .send(renderInteractionPage({
        title: 'WePuu consent',
        heading: 'Finish WordPress consent.',
        message: 'The site is confirming the local user and approved scope ceiling.',
        content: '<p id="status" role="status">Completing consent…</p><script src="/assets/consent-complete-v2.js" defer></script>'
      }));
  });

  app.get('/v1/consent/start', async (_request, reply) => {
    return htmlHeaders(reply)
      .type('text/html; charset=utf-8')
      .send(renderInteractionPage({
        title: 'WePuu authorization setup',
        heading: 'Confirm access in WordPress.',
        message: 'Preparing an exact site and scope binding before OAuth consent.',
        content: '<p id="status" role="status">Preparing authorization…</p><script src="/assets/consent-start-v1.js" defer></script>'
      }));
  });

  app.get('/v1/console/login', async (request, reply) => {
    if (options.consoleAuth === undefined) throw new PlatformError('temporarily_unavailable', 503);
    const query = AccountLoginQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    const returnPath = validatedReturnTo(query.data.return_to);
    if (!returnPath.startsWith('/app')) throw new PlatformError('invalid_request', 400);
    const transaction = await options.consoleAuth.createLogin(returnPath);
    const maxAge = Math.max(1, Math.floor((transaction.expiresAt.getTime() - Date.now()) / 1_000));
    const authorizeUrl = new URL('/v1/account/console/authorize', authOrigin);
    authorizeUrl.searchParams.set('request', transaction.requestId);
    return reply.status(303).header('cache-control', 'no-store')
      .header('set-cookie', secureCookie(
        consoleLoginCookieName(transaction.requestId), transaction.browserSecret, maxAge
      ))
      .header('location', authorizeUrl.href).send();
  });

  app.get('/v1/account/console/authorize', async (request, reply) => {
    if (options.consoleAuth === undefined || options.accountAuth === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const query = ConsoleRequestQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    const session = await options.accountAuth.getSession(accountAuthHeaders(request.headers));
    if (session === undefined || session.expiresAt.getTime() <= Date.now()) {
      const returnPath = `/v1/account/console/authorize?request=${encodeURIComponent(query.data.request)}`;
      return reply.status(303).header('cache-control', 'no-store')
        .header('location', `/v1/account/login?return_to=${encodeURIComponent(returnPath)}`).send();
    }
    const principal = await options.identityProvider.authenticate(request);
    if (principal === undefined) throw new PlatformError('forbidden', 403);
    const handoff = await options.consoleAuth.authorizeLogin({
      requestId: query.data.request,
      authSessionId: session.sessionId,
      accountId: principal.accountId,
      authExpiresAt: session.expiresAt
    });
    const callback = new URL('/v1/session/callback', appOrigin);
    callback.hash = new URLSearchParams({ request: handoff.requestId, code: handoff.code }).toString();
    return reply.status(303).header('cache-control', 'no-store').header('location', callback.href).send();
  });

  app.get('/v1/session/callback', async (_request, reply) => htmlHeaders(reply)
    .type('text/html; charset=utf-8')
    .send(renderInteractionPage({
      title: 'WePuu console sign-in',
      heading: 'Opening your workspace.',
      message: 'Completing a one-time secure handoff from the identity service.',
      content: '<p id="status" role="status">Completing sign-in&hellip;</p><script src="/assets/console-handoff-v1.js" defer></script>'
    })));

  app.post('/v1/session/exchange', async (request, reply) => {
    if (options.consoleAuth === undefined || request.headers.origin !== appOrigin) {
      throw new PlatformError('forbidden', 403);
    }
    const body = ConsoleExchangeSchema.safeParse(request.body);
    const browserSecret = body.success
      ? requestCookie(request, consoleLoginCookieName(body.data.request))
      : undefined;
    if (!body.success || browserSecret === undefined) throw new PlatformError('invalid_request', 400);
    try {
      const session = await options.consoleAuth.exchangeLogin({
        requestId: body.data.request,
        browserSecret,
        code: body.data.code
      });
      const maxAge = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1_000));
      return await reply.header('cache-control', 'no-store')
        .header('set-cookie', [
          secureCookie(CONSOLE_SESSION_COOKIE, session.token, maxAge),
          clearCookie(consoleLoginCookieName(body.data.request))
        ]).send({ location: session.returnPath });
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.get('/v1/account/console/logout', async (request, reply) => {
    if (options.consoleAuth === undefined || options.accountAuth === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const query = ConsoleRequestQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    const session = await options.accountAuth.getSession(accountAuthHeaders(request.headers));
    if (session === undefined) {
      return reply.status(303).header('cache-control', 'no-store').header('location', appOrigin).send();
    }
    await options.consoleAuth.validateLogout(query.data.request, session.sessionId);
    const csrf = uiCsrf(request);
    return htmlHeaders(reply, csrf.setCookie).type('text/html; charset=utf-8').send(renderInteractionPage({
      title: 'Sign out of WePuu',
      heading: 'Sign out on this browser?',
      message: 'This ends both the console session and its authoritative identity session.',
      content: `<form class="auth-form" method="post" action="/v1/account/console/logout"><input type="hidden" name="csrf" value="${csrf.value}"><input type="hidden" name="request" value="${query.data.request}"><button type="submit">Sign out</button></form>`
    }));
  });

  app.post('/v1/account/console/logout', async (request, reply) => {
    if (options.consoleAuth === undefined || options.accountAuth === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const form = validateLoginMutation(request, ConsoleLogoutSchema);
    const session = await options.accountAuth.getSession(accountAuthHeaders(request.headers));
    if (session === undefined) throw new PlatformError('unauthenticated', 401);
    const returnPath = await options.consoleAuth.validateLogout(form.request, session.sessionId, true);
    const response = await options.accountAuth.signOut(accountAuthHeaders(request.headers));
    const location = new URL(returnPath, appOrigin);
    return reply.status(303).header('cache-control', 'no-store')
      .header('set-cookie', [...response.headers.getSetCookie(), clearCookie(CSRF_COOKIE)])
      .header('location', location.href).send();
  });

  app.get('/v1/account/login', async (request, reply) => {
    if (options.accountAuth === undefined
      || options.loginTransactions === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const query = AccountLoginQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    const returnTo = validatedReturnTo(query.data.return_to);
    const csrf = uiCsrf(request);
    const transaction = await options.loginTransactions.create(returnTo, csrf.value);
    const session = await options.accountAuth.getSession(accountAuthHeaders(request.headers));
    if (session !== undefined && session.expiresAt.getTime() > Date.now()) {
      try {
        const completed = await options.loginTransactions.complete(transaction.token, csrf.value, session.userId);
        return await reply.status(303).header('cache-control', 'no-store')
          .header('location', completed.returnPath)
          .header('set-cookie', csrf.setCookie ?? csrfCookie(csrf.value)).send();
      } catch {
        return htmlHeaders(reply.status(503), csrf.setCookie).type('text/html; charset=utf-8')
          .send(renderAccountBootstrapRetry({ csrfToken: csrf.value, transactionToken: transaction.token }));
      }
    }
    return htmlHeaders(reply, csrf.setCookie).type('text/html; charset=utf-8')
      .send(renderEmailLogin({ csrfToken: csrf.value, transactionToken: transaction.token }));
  });

  const sendEmailCode = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    if (options.accountAuth === undefined || options.loginTransactions === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const form = validateLoginMutation(request, EmailSendFormSchema);
    let email: string;
    try {
      email = normalizeAccountEmail(form.email);
    } catch {
      return htmlHeaders(reply.status(400)).type('text/html; charset=utf-8').send(renderEmailLogin({
        csrfToken: form.csrf,
        transactionToken: form.transaction,
        message: 'Enter a valid email address.'
      }));
    }
    await options.loginTransactions.bindEmail(form.transaction, form.csrf, email);
    const deliveryId = randomBytes(18).toString('base64url');
    const response = await accountAuthPost(request, '/email-otp/send-verification-otp', {
      email, type: 'sign-in'
    }, deliveryId);
    const outcome = options.accountAuth.takeDeliveryOutcome(deliveryId);
    forwardAccountAuthHeaders(reply, response);
    const retryHeader = response.headers.get('x-retry-after') ?? response.headers.get('retry-after');
    const retryAfter = retryHeader === null ? 60 : Math.max(0, Number.parseInt(retryHeader, 10) || 60);
    if (response.status === 429) {
      return htmlHeaders(reply.status(429)).type('text/html; charset=utf-8').send(renderEmailVerification({
        csrfToken: form.csrf, transactionToken: form.transaction, email, delivery: 'unknown',
        retryAfterSeconds: retryAfter,
        message: 'Please wait before requesting another code.'
      }));
    }
    if (outcome === 'rejected') {
      return htmlHeaders(reply.status(503)).type('text/html; charset=utf-8').send(renderEmailVerification({
        csrfToken: form.csrf, transactionToken: form.transaction, email, delivery: 'rejected',
        message: 'We could not send a code right now.'
      }));
    }
    if (!response.ok || outcome === undefined) throw new PlatformError('temporarily_unavailable', 503);
    const delivery: OtpDeliveryOutcome = outcome;
    return htmlHeaders(reply.status(delivery === 'unknown' ? 202 : 200)).type('text/html; charset=utf-8')
      .send(renderEmailVerification({
        csrfToken: form.csrf, transactionToken: form.transaction, email,
        delivery: delivery === 'unknown' ? 'unknown' : 'accepted'
      }));
  };

  app.post('/v1/account/email/send', sendEmailCode);
  app.post('/v1/account/email/resend', sendEmailCode);

  app.post('/v1/account/email/change', async (request, reply) => {
    if (options.loginTransactions === undefined) throw new PlatformError('temporarily_unavailable', 503);
    const form = validateLoginMutation(request, LoginMutationBaseSchema);
    const restarted = await options.loginTransactions.restart(form.transaction, form.csrf);
    return htmlHeaders(reply).type('text/html; charset=utf-8')
      .send(renderEmailLogin({ csrfToken: form.csrf, transactionToken: restarted.token }));
  });

  app.post('/v1/account/email/verify', async (request, reply) => {
    if (options.accountAuth === undefined || options.loginTransactions === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    const form = validateLoginMutation(request, EmailVerifyFormSchema);
    let email: string;
    try {
      email = normalizeAccountEmail(form.email);
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
    await options.loginTransactions.bindEmail(form.transaction, form.csrf, email);

    const currentSession = await options.accountAuth.getSession(accountAuthHeaders(request.headers));
    if (currentSession !== undefined && currentSession.expiresAt.getTime() > Date.now()) {
      const returnPath = await completeLogin(
        form.transaction, form.csrf, accountAuthHeaders(request.headers)
      );
      return reply.status(303).header('cache-control', 'no-store').header('location', returnPath).send();
    }

    const response = await accountAuthPost(request, '/sign-in/email-otp', { email, otp: form.otp });
    forwardAccountAuthHeaders(reply, response);
    if (!response.ok) {
      const retryHeader = response.headers.get('x-retry-after') ?? response.headers.get('retry-after');
      const retryAfter = retryHeader === null ? 0 : Math.max(0, Number.parseInt(retryHeader, 10) || 0);
      return htmlHeaders(reply.status(response.status === 429 ? 429 : 400)).type('text/html; charset=utf-8')
        .send(renderEmailVerification({
          csrfToken: form.csrf, transactionToken: form.transaction, email, delivery: 'accepted',
          ...(retryAfter === 0 ? {} : { retryAfterSeconds: retryAfter }),
          message: response.status === 429
            ? 'Too many verification attempts. Please wait and try again.'
            : 'The code is invalid or expired. Request a new code if needed.'
        }));
    }
    const sessionHeaders = headersWithResponseCookies(request, response);
    try {
      const returnPath = await completeLogin(form.transaction, form.csrf, sessionHeaders);
      return await reply.status(303).header('cache-control', 'no-store').header('location', returnPath).send();
    } catch {
      return htmlHeaders(reply.status(503)).type('text/html; charset=utf-8')
        .send(renderAccountBootstrapRetry({ csrfToken: form.csrf, transactionToken: form.transaction }));
    }
  });

  app.post('/v1/account/bootstrap', async (request, reply) => {
    const form = validateLoginMutation(request, LoginMutationBaseSchema);
    try {
      const returnPath = await completeLogin(
        form.transaction, form.csrf, accountAuthHeaders(request.headers)
      );
      return await reply.status(303).header('cache-control', 'no-store').header('location', returnPath).send();
    } catch {
      return htmlHeaders(reply.status(503)).type('text/html; charset=utf-8')
        .send(renderAccountBootstrapRetry({ csrfToken: form.csrf, transactionToken: form.transaction }));
    }
  });

  app.all('/api/auth/*', async (_request, reply) => reply.status(404)
    .header('cache-control', 'no-store').send({ error: 'not_found' }));

  app.get('/v1/account/session', async (request, reply) => {
    const principal = await identityProviderFor(request).authenticate(request);
    if (principal === undefined) {
      return reply.status(401).header('cache-control', 'no-store').send({ error: 'unauthenticated' });
    }
    return reply.header('cache-control', 'no-store').send({ authenticated: true });
  });

  app.get('/v1/account/tenants', async (request, reply) => {
    const { memberships } = await membershipsFor(request);
    return reply.header('cache-control', 'no-store').send({ tenants: memberships });
  });

  app.post('/v1/account/logout', async (request, reply) => {
    if (options.accountAuth === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== authOrigin) throw new PlatformError('forbidden', 403);
    return sendAccountAuthResponse(reply, await options.accountAuth.signOut(accountAuthHeaders(request.headers)));
  });

  app.get('/', async (request, reply) => reply.status(303).header('cache-control', 'no-store')
    .header('location', requestBoundary(request) === 'auth' && splitOrigins ? appOrigin : '/app').send());

  app.get('/app', async (request, reply) => {
    const account = await uiMembershipsFor(request, reply);
    if (account === undefined) return;
    let memberships = account.memberships;
    if (memberships.length === 0) {
      if (options.workspace === undefined) throw new PlatformError('temporarily_unavailable', 503);
      await options.workspace.ensurePersonalWorkspace(account.principal.accountId);
      memberships = await options.workspace.listMemberships(account.principal.accountId);
    }
    const target = memberships.find((membership) => membership.isHome) ?? memberships[0];
    if (target === undefined) throw new PlatformError('temporarily_unavailable', 503);
    return reply.status(303).header('cache-control', 'no-store')
      .header('location', `/app/tenants/${encodeURIComponent(target.tenantId)}`).send();
  });

  const tenantPage = async (
    request: FastifyRequest,
    reply: FastifyReply,
    renderer: (model: TenantPageModel) => string
  ): Promise<unknown> => {
    if (await uiMembershipsFor(request, reply) === undefined) return undefined;
    const model = await tenantPageModel(request);
    const setCookie = (request as FastifyRequest & { wepuuCsrfCookie?: string }).wepuuCsrfCookie;
    return htmlHeaders(reply, setCookie).type('text/html; charset=utf-8').send(renderer(model));
  };

  app.get('/app/tenants/:tenantId', async (request, reply) => tenantPage(request, reply, renderOverview));
  app.get('/app/tenants/:tenantId/sites', async (request, reply) => tenantPage(request, reply, renderSites));
  app.get('/app/tenants/:tenantId/grants', async (request, reply) => tenantPage(request, reply, renderGrants));
  app.get('/app/tenants/:tenantId/activity', async (request, reply) => {
    if (await uiMembershipsFor(request, reply) === undefined) return;
    const query = ActivityQuerySchema.safeParse(request.query);
    if (!query.success) throw new PlatformError('invalid_request', 400);
    const activity = query.data.outcome === undefined
      ? { page: query.data.page }
      : { page: query.data.page, outcome: query.data.outcome };
    const model = await tenantPageModel(request, activity);
    const setCookie = (request as FastifyRequest & { wepuuCsrfCookie?: string }).wepuuCsrfCookie;
    return htmlHeaders(reply, setCookie).type('text/html; charset=utf-8').send(renderActivity(model));
  });
  app.get('/app/tenants/:tenantId/sites/:objectId', async (request, reply) => {
    if (await uiMembershipsFor(request, reply) === undefined) return;
    const params = ObjectParamsSchema.safeParse(request.params);
    if (!params.success) throw new PlatformError('invalid_request', 400);
    const model = await tenantPageModel(request);
    if (!model.sites.some((site) => site.id === params.data.objectId)) throw new PlatformError('not_found', 404);
    const setCookie = (request as FastifyRequest & { wepuuCsrfCookie?: string }).wepuuCsrfCookie;
    return htmlHeaders(reply, setCookie).type('text/html; charset=utf-8')
      .send(renderSiteDetail(model, params.data.objectId));
  });
  app.get('/app/tenants/:tenantId/grants/:objectId', async (request, reply) => {
    if (await uiMembershipsFor(request, reply) === undefined) return;
    const params = ObjectParamsSchema.safeParse(request.params);
    if (!params.success) throw new PlatformError('invalid_request', 400);
    const model = await tenantPageModel(request);
    if (!model.grants.some((grant) => grant.id === params.data.objectId)) throw new PlatformError('not_found', 404);
    const setCookie = (request as FastifyRequest & { wepuuCsrfCookie?: string }).wepuuCsrfCookie;
    return htmlHeaders(reply, setCookie).type('text/html; charset=utf-8')
      .send(renderGrantDetail(model, params.data.objectId));
  });

  app.get('/app/account', async (request, reply) => {
    const account = await uiMembershipsFor(request, reply);
    if (account === undefined) return;
    const csrf = uiCsrf(request);
    return htmlHeaders(reply, csrf.setCookie).type('text/html; charset=utf-8').send(renderAccount({
      deployment, memberships: account.memberships, csrfToken: csrf.value
    }));
  });

  app.get('/app/compatibility', async (request, reply) => {
    if (await uiMembershipsFor(request, reply) === undefined) return;
    return htmlHeaders(reply).type('text/html; charset=utf-8').send(renderCompatibility({ deployment }));
  });

  app.get('/app/readiness', async (request, reply) => {
    if (await uiMembershipsFor(request, reply) === undefined) return;
    const report = options.deploymentReadiness ?? { ready: false, checks: [] };
    return htmlHeaders(reply).type('text/html; charset=utf-8').send(renderReadiness({ deployment, report }));
  });

  app.get('/v1/account/deployment-readiness', async (request, reply) => {
    await authenticatedPrincipal(request);
    return reply.header('cache-control', 'no-store').send(options.deploymentReadiness ?? { ready: false, checks: [] });
  });

  app.post('/app/logout', async (request, reply) => {
    validateUiMutation(request);
    if (splitOrigins) {
      if (options.consoleAuth === undefined) throw new PlatformError('temporarily_unavailable', 503);
      const token = requestCookie(request, CONSOLE_SESSION_COOKIE);
      if (token === undefined) throw new PlatformError('unauthenticated', 401);
      const transaction = await options.consoleAuth.beginLogout(
        createHash('sha256').update(token, 'utf8').digest(), '/app'
      );
      const logoutUrl = new URL('/v1/account/console/logout', authOrigin);
      logoutUrl.searchParams.set('request', transaction.requestId);
      return reply.status(303).header('cache-control', 'no-store')
        .header('set-cookie', [clearCookie(CONSOLE_SESSION_COOKIE), clearCookie(CSRF_COOKIE)])
        .header('location', logoutUrl.href).send();
    }
    if (options.accountAuth === undefined) throw new PlatformError('temporarily_unavailable', 503);
    const response = await options.accountAuth.signOut(accountAuthHeaders(request.headers));
    const cookies = [...response.headers.getSetCookie(), clearCookie(CSRF_COOKIE)];
    return reply.status(303).header('cache-control', 'no-store')
      .header('set-cookie', cookies).header('location', '/app').send();
  });

  app.post('/app/tenants/:tenantId/grants/:objectId/revoke', async (request, reply) => {
    validateUiMutation(request);
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    if (!params.success) throw new PlatformError('invalid_request', 400);
    await options.store.revokeGrant(context, params.data.objectId);
    return reply.status(303).header('cache-control', 'no-store')
      .header('location', `/app/tenants/${encodeURIComponent(context.tenantId)}/grants`).send();
  });

  app.post('/app/tenants/:tenantId/sites/:objectId/disconnect', async (request, reply) => {
    validateUiMutation(request);
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    if (!params.success) throw new PlatformError('invalid_request', 400);
    await options.store.disconnectSite(context, params.data.objectId);
    return reply.status(303).header('cache-control', 'no-store')
      .header('location', `/app/tenants/${encodeURIComponent(context.tenantId)}/sites`).send();
  });

  app.get('/v1/tenants/:tenantId', async (request, reply) => {
    const context = await requestContext(request);
    const tenant = await options.store.findTenant(context);
    if (tenant === undefined) {
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: 'tenant.access_denied',
        outcome: 'denied',
        reason: 'membership_missing',
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        actorId: context.accountId,
        service: 'control-api',
        serviceVersion: '0.5.0'
      });
      throw new PlatformError('not_found', 404);
    }
    return reply.header('cache-control', 'no-store').send({ tenant });
  });

  app.post('/v1/tenants/:tenantId/pairing', async (request, reply) => {
    if (options.pairing === undefined || options.workspace === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== authOrigin) throw new PlatformError('forbidden', 403);
    const context = await requestContext(request);
    const body = PairingBodySchema.safeParse(request.body);
    if (!body.success) throw new PlatformError('invalid_request', 400);
    const membership = (await options.workspace.listMemberships(context.accountId))
      .find((candidate) => candidate.tenantId === context.tenantId);
    if (membership === undefined || (membership.role !== 'owner' && membership.role !== 'administrator')) {
      const occurredAt = new Date().toISOString();
      await safePairingDiagnostic({
        occurredAt,
        correlationId: context.correlationId,
        stage: 'state',
        code: 'pairing.tenant_access_denied'
      });
      await safeAudit({
        occurredAt,
        eventName: 'tenant.access_denied',
        outcome: 'denied',
        reason: 'membership_missing',
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        actorId: context.accountId,
        service: 'control-api',
        serviceVersion: '0.5.0'
      });
      throw new PlatformError('invalid_request', 400);
    }
    try {
      const result = await options.pairing.pair(context, body.data);
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'pairing.verified', outcome: 'success', reason: 'none',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        siteId: result.siteId, service: 'control-api', serviceVersion: '0.5.0'
      });
      return await reply.header('cache-control', 'no-store').send({ site_id: result.siteId, status: 'active' });
    } catch (error) {
      const classified = pairingDiagnostic(error);
      await safePairingDiagnostic({
        occurredAt: new Date().toISOString(),
        correlationId: context.correlationId,
        stage: classified.stage,
        code: classified.code
      });
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'pairing.denied', outcome: 'denied', reason: 'proof_invalid',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        service: 'control-api', serviceVersion: '0.5.0'
      });
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.get('/v1/tenants/:tenantId/security-events', async (request, reply) => {
    const context = await requestContext(request);
    const events = await options.store.listSecurityEvents(context, 50);
    return reply.header('cache-control', 'no-store').send({ events });
  });

  app.post('/v1/oauth/consent/start', async (request, reply) => {
    if (options.grants === undefined || options.oauthIssuer === undefined
      || options.oauthConsentBootstrap === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== authOrigin) throw new PlatformError('forbidden', 403);
    const body = OAuthConsentStartBodySchema.safeParse(request.body);
    if (!body.success) throw new PlatformError('invalid_request', 400);
    const { principal, memberships } = await membershipsFor(request);
    let claims: z.infer<typeof OAuthConsentBootstrapClaimsSchema>;
    try {
      claims = OAuthConsentBootstrapClaimsSchema.parse(await options.oauthConsentBootstrap.verify(body.data.request, {
        issuer: options.oauthIssuer,
        audience: `${authOrigin}/v1/oauth/consent/start`,
        subjectId: principal.accountId
      }));
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
    const matches: Array<{ readonly context: TenantContext; readonly site: SiteView }> = [];
    for (const membership of memberships) {
      const context = TenantContextSchema.parse({
        tenantId: membership.tenantId,
        accountId: principal.accountId,
        correlationId: correlationId()
      });
      const sites = await options.store.listSites(context);
      for (const site of sites) {
        if (site.status === 'active' && site.resource === claims.resource) matches.push({ context, site });
      }
    }
    if (matches.length !== 1) throw new PlatformError('invalid_request', 400);
    const match = matches[0];
    if (match === undefined) throw new PlatformError('invalid_request', 400);
    const returnPath = `/interaction/${claims.interactionUid}`;
    const idempotencyKey = `oauth_${createHash('sha256')
      .update(`${principal.accountId}\u0000${claims.interactionUid}`, 'utf8').digest('base64url')}`;
    try {
      const result = await options.grants.start(match.context, {
        siteId: match.site.id,
        clientId: claims.clientId,
        scopes: claims.scopes,
        idempotencyKey
      });
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'grant.created', outcome: 'success', reason: 'none',
        correlationId: match.context.correlationId, tenantId: match.context.tenantId,
        actorId: principal.accountId, siteId: match.site.id, clientId: claims.clientId,
        grantId: result.grantId, service: 'control-api', serviceVersion: '0.5.0'
      });
      return await reply.status(201).header('cache-control', 'no-store').send({
        consent_url: result.consentUrl,
        expires_at: result.expiresAt.toISOString(),
        return_path: returnPath
      });
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.get('/v1/tenants/:tenantId/sites', async (request, reply) => {
    const context = await requestContext(request);
    return reply.header('cache-control', 'no-store').send({ sites: await options.store.listSites(context) });
  });

  app.get('/v1/tenants/:tenantId/grants', async (request, reply) => {
    const context = await requestContext(request);
    return reply.header('cache-control', 'no-store').send({ grants: await options.store.listGrants(context) });
  });

  app.post('/v1/tenants/:tenantId/sites/:siteId/grants', async (request, reply) => {
    if (options.grants === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== (requestBoundary(request) === 'app' ? appOrigin : authOrigin)) {
      throw new PlatformError('forbidden', 403);
    }
    const context = await requestContext(request);
    const params = SiteParamsSchema.safeParse(request.params);
    const body = GrantStartBodySchema.safeParse(request.body);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !body.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    try {
      const result = await options.grants.start(context, {
        siteId: params.data.siteId,
        clientId: body.data.client_id,
        scopes: body.data.scopes,
        idempotencyKey: idempotencyKey.data
      });
      await safeAudit({
        occurredAt: new Date().toISOString(), eventName: 'grant.created', outcome: 'success', reason: 'none',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        siteId: params.data.siteId, clientId: body.data.client_id, grantId: result.grantId,
        service: 'control-api', serviceVersion: '0.5.0'
      });
      return await reply.status(201).header('cache-control', 'no-store').send({
        grant_id: result.grantId,
        consent_url: result.consentUrl,
        expires_at: result.expiresAt.toISOString()
      });
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.post('/v1/tenants/:tenantId/grants/:grantId/complete', async (request, reply) => {
    if (options.grants === undefined) {
      throw new PlatformError('temporarily_unavailable', 503);
    }
    if (request.headers.origin !== authOrigin) throw new PlatformError('forbidden', 403);
    const context = await requestContext(request);
    const params = GrantParamsSchema.safeParse(request.params);
    const body = GrantCompletionBodySchema.safeParse(request.body);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !body.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    try {
      await options.grants.complete(context, {
        grantId: params.data.grantId,
        proof: body.data.proof,
        challenge: body.data.challenge,
        decision: body.data.decision,
        idempotencyKey: idempotencyKey.data
      });
      await safeAudit({
        occurredAt: new Date().toISOString(),
        eventName: body.data.decision === 'approved' ? 'grant.created' : 'grant.revoked',
        outcome: body.data.decision === 'approved' ? 'success' : 'denied',
        reason: body.data.decision === 'approved' ? 'none' : 'consent_denied',
        correlationId: context.correlationId, tenantId: context.tenantId, actorId: context.accountId,
        grantId: params.data.grantId, service: 'control-api', serviceVersion: '0.5.0'
      });
      return await reply.status(204).header('cache-control', 'no-store').send();
    } catch {
      throw new PlatformError('invalid_request', 400);
    }
  });

  app.post('/v1/tenants/:tenantId/grants/:objectId/revoke', async (request, reply) => {
    if (request.headers.origin !== appOrigin) {
      throw new PlatformError('forbidden', 403);
    }
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    await options.store.revokeGrant(context, params.data.objectId);
    return reply.status(204).header('cache-control', 'no-store').send();
  });

  app.post('/v1/tenants/:tenantId/sites/:objectId/disconnect', async (request, reply) => {
    if (request.headers.origin !== appOrigin) {
      throw new PlatformError('forbidden', 403);
    }
    const context = await requestContext(request);
    const params = ObjectParamsSchema.safeParse(request.params);
    const idempotencyKey = IdempotencyKeySchema.safeParse(request.headers['idempotency-key']);
    if (!params.success || !idempotencyKey.success) throw new PlatformError('invalid_request', 400);
    await options.store.disconnectSite(context, params.data.objectId);
    return reply.status(204).header('cache-control', 'no-store').send();
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).header('cache-control', 'no-store').send({ error: 'not_found' });
  });

  app.setErrorHandler((error, request, reply) => {
    const uiRequest = request.raw.url?.startsWith('/app') === true;
    if (error instanceof PlatformError) {
      if (uiRequest) {
        const heading = error.status === 404 ? 'That record is not available.'
          : error.status === 403 ? 'This action is not allowed.' : 'The control plane could not complete this request.';
        void htmlHeaders(reply.status(error.status)).type('text/html; charset=utf-8').send(renderInteractionPage({
          title: 'WePuu control plane', heading,
          message: error.status >= 500 ? 'The service is temporarily unavailable. No authorization state was changed.' : 'Return to the workspace and try a valid action.',
          content: '<p><a class="button" href="/app">Return to workspace</a></p>'
        }));
        return;
      }
      void reply.status(error.status).header('cache-control', 'no-store').send({ error: error.code });
      return;
    }
    if (uiRequest) {
      void htmlHeaders(reply.status(500)).type('text/html; charset=utf-8').send(renderInteractionPage({
        title: 'WePuu control plane', heading: 'The control plane is temporarily unavailable.',
        message: 'No authorization state was changed. Return to the workspace and retry.',
        content: '<p><a class="button" href="/app">Return to workspace</a></p>'
      }));
      return;
    }
    void reply.status(500).header('cache-control', 'no-store').send({ error: 'temporarily_unavailable' });
  });

  return app;
}
