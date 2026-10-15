import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve4, resolve6 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { URL } from 'node:url';
import ipaddr from 'ipaddr.js';
import { calculateJwkThumbprint, compactVerify, decodeProtectedHeader, importJWK, type JWK } from 'jose';
import { z } from 'zod';
import {
  CanonicalResourceSchema,
  McpScopeSetSchema,
  OAuthClientIdSchema,
  OpaqueIdSchema,
  type CanonicalResource,
  type McpScope
} from '@wepuu/contracts';

export const PAIRING_PROTOCOL_VERSION = '1';
export const PAIRING_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
export const SITE_PROOF_TTL_SECONDS = 60;
export const MAX_SITE_PROOF_BYTES = 16 * 1_024;

export type PairingDiagnosticStage =
  | 'dns' | 'destination' | 'network' | 'response' | 'proof' | 'state' | 'persistence' | 'unknown';

export type PairingDiagnosticCode =
  | 'dns.failed' | 'destination.unsafe' | 'network.failed' | 'network.timeout' | 'tls.failed'
  | 'http.401' | 'http.403' | 'http.429' | 'http.4xx' | 'http.5xx' | 'http.other'
  | 'response.content_type_invalid' | 'response.too_large' | 'response.json_invalid' | 'response.schema_invalid'
  | 'proof.key_invalid' | 'proof.signature_invalid' | 'proof.header_invalid' | 'proof.claims_invalid'
  | 'pairing.state_invalid' | 'pairing.tenant_access_denied' | 'pairing.persistence_failed' | 'unknown';

const CLAIMS_DIAGNOSTIC_DETAILS = [
  'claims.json_invalid', 'claims.schema_invalid', 'claims.time_expired', 'claims.time_future',
  'claims.time_window_invalid', 'claims.issuer_mismatch', 'claims.tenant_mismatch',
  'claims.resource_mismatch', 'claims.challenge_mismatch', 'claims.site_binding_mismatch',
  'claims.platform_key_binding_mismatch', 'claims.other_binding_mismatch', 'unknown'
] as const;
export type PairingDiagnosticDetail = typeof CLAIMS_DIAGNOSTIC_DETAILS[number];

export class PairingDiagnosticError extends Error {
  readonly stage: PairingDiagnosticStage;
  readonly code: PairingDiagnosticCode;
  readonly detail?: PairingDiagnosticDetail;

  constructor(stage: PairingDiagnosticStage, code: PairingDiagnosticCode, cause?: unknown, detail?: PairingDiagnosticDetail) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'PairingDiagnosticError';
    this.stage = stage;
    this.code = code;
    if (stage === 'proof' && code === 'proof.claims_invalid' && detail !== undefined) {
      this.detail = CLAIMS_DIAGNOSTIC_DETAILS.includes(detail) ? detail : 'unknown';
    }
  }
}

export function pairingDiagnostic(error: unknown): Readonly<{
  stage: PairingDiagnosticStage; code: PairingDiagnosticCode; detail?: PairingDiagnosticDetail
}> {
  return error instanceof PairingDiagnosticError
    ? {
      stage: error.stage, code: error.code,
      ...(error.stage === 'proof' && error.code === 'proof.claims_invalid' && error.detail !== undefined
        ? { detail: CLAIMS_DIAGNOSTIC_DETAILS.includes(error.detail) ? error.detail : 'unknown' } : {})
    }
    : { stage: 'unknown', code: 'unknown' };
}

function diagnostic(stage: PairingDiagnosticStage, code: PairingDiagnosticCode, cause?: unknown): PairingDiagnosticError {
  return cause instanceof PairingDiagnosticError ? cause : new PairingDiagnosticError(stage, code, cause);
}

const SitePublicJwkSchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().min(40).max(64),
  kid: OpaqueIdSchema,
  alg: z.literal('EdDSA').optional(),
  use: z.literal('sig').optional()
}).strict();

const SiteProofClaimsSchema = z.object({
  kind: z.enum(['pairing', 'consent']),
  protocol_version: z.literal(PAIRING_PROTOCOL_VERSION),
  iss: z.string().min(1).max(253),
  platform_issuer: z.url(),
  tenant_id: z.uuid(),
  site_id: OpaqueIdSchema.optional(),
  pairing_attempt_id: OpaqueIdSchema.optional(),
  platform_signing_key_sha256: z.string().regex(/^[A-Za-z0-9_-]{43}$/u).optional(),
  platform_signing_kid: OpaqueIdSchema.optional(),
  grant_id: OpaqueIdSchema.optional(),
  subject_id: OpaqueIdSchema.optional(),
  client_id: OAuthClientIdSchema.optional(),
  resource: CanonicalResourceSchema,
  aud: CanonicalResourceSchema.optional(),
  scope: McpScopeSetSchema.optional(),
  decision: z.enum(['approved', 'denied']).optional(),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u),
  iat: z.number().int(),
  exp: z.number().int()
}).strict();

export type SiteProofClaims = z.infer<typeof SiteProofClaimsSchema>;
export type SitePublicJwk = z.infer<typeof SitePublicJwkSchema>;

export interface ExpectedSiteProof {
  readonly kind: SiteProofClaims['kind'];
  readonly platformIssuer: string;
  readonly tenantId: string;
  readonly resource: CanonicalResource;
  readonly challenge: string;
  readonly pairingAttemptId?: string;
  readonly siteId?: string;
  readonly platformSigningKeySha256?: string;
  readonly platformSigningKid?: string;
  readonly grantId?: string;
  readonly clientId?: string;
  readonly subjectId?: string;
  readonly scopes?: readonly string[];
  readonly decision?: 'approved' | 'denied';
  readonly now?: Date;
}

export interface VerifiedSiteProof {
  readonly claims: SiteProofClaims;
  readonly publicJwk: SitePublicJwk;
  readonly thumbprint: string;
}

export function canonicalizeResource(input: string): CanonicalResource {
  const parsed = new URL(input);
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('invalid_resource');
  }
  if (parsed.port !== '' && parsed.port !== '443') throw new Error('resource_port_not_allowed');
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.port = '';
  if (parsed.pathname === '/' || parsed.pathname.endsWith('/')) throw new Error('resource_path_not_canonical');
  return CanonicalResourceSchema.parse(parsed.href);
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 0) return false;
  const parsed = ipaddr.process(address);
  return parsed.range() === 'unicast';
}

export async function resolvePublicAddresses(hostname: string, resolver: {
  readonly resolve4?: (value: string) => Promise<readonly string[]>;
  readonly resolve6?: (value: string) => Promise<readonly string[]>;
} = {}): Promise<readonly string[]> {
  if (isIP(hostname) !== 0) {
    if (!isPublicAddress(hostname)) throw diagnostic('destination', 'destination.unsafe');
    return [hostname];
  }
  const [v4Result, v6Result] = await Promise.allSettled([
    (resolver.resolve4 ?? resolve4)(hostname), (resolver.resolve6 ?? resolve6)(hostname)
  ]);
  const v4 = v4Result.status === 'fulfilled' ? v4Result.value : [];
  const v6 = v6Result.status === 'fulfilled' ? v6Result.value : [];
  const addresses = [...new Set([...v4, ...v6])];
  if (addresses.length === 0) throw diagnostic('dns', 'dns.failed');
  if (addresses.some((address) => !isPublicAddress(address))) throw diagnostic('destination', 'destination.unsafe');
  return addresses.sort();
}

export function createPinnedAddressLookup(pinnedAddress: string): LookupFunction {
  const family = isIP(pinnedAddress);
  if (family === 0) throw new Error('pinned_address_invalid');
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: pinnedAddress, family }]);
      return;
    }
    callback(null, pinnedAddress, family);
  };
}

class ClaimsValidationError extends Error {
  constructor(readonly detail: PairingDiagnosticDetail) { super(detail); }
}

function exactClaim(actual: string | undefined, expected: string | undefined, detail: PairingDiagnosticDetail): void {
  if (actual !== expected) throw new ClaimsValidationError(detail);
}

export async function verifySiteProof(
  compactJws: string,
  publicJwkInput: unknown,
  expected: ExpectedSiteProof
): Promise<VerifiedSiteProof> {
  if (Buffer.byteLength(compactJws, 'utf8') > MAX_SITE_PROOF_BYTES) {
    throw diagnostic('proof', 'proof.signature_invalid');
  }
  let publicJwk: SitePublicJwk;
  let key: Awaited<ReturnType<typeof importJWK>>;
  try {
    publicJwk = SitePublicJwkSchema.parse(publicJwkInput);
    key = await importJWK(publicJwk as JWK, 'EdDSA');
  } catch (error) {
    throw diagnostic('proof', 'proof.key_invalid', error);
  }
  try {
    const header = decodeProtectedHeader(compactJws);
    if (Object.keys(header).sort().join(',') !== 'alg,kid,typ'
      || header.alg !== 'EdDSA' || header.typ !== 'wepuu-site-proof+jwt'
      || header.kid !== publicJwk.kid) throw new Error('invalid');
  } catch (error) {
    throw diagnostic('proof', 'proof.header_invalid', error);
  }
  let verified: Awaited<ReturnType<typeof compactVerify>>;
  try {
    verified = await compactVerify(compactJws, key, { algorithms: ['EdDSA'] });
  } catch (error) {
    throw diagnostic('proof', 'proof.signature_invalid', error);
  }
  try {
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder().decode(verified.payload)) as unknown; }
    catch { throw new ClaimsValidationError('claims.json_invalid'); }
    const parsed = SiteProofClaimsSchema.safeParse(decoded);
    if (!parsed.success) throw new ClaimsValidationError('claims.schema_invalid');
    const claims = parsed.data;
    const now = Math.floor((expected.now ?? new Date()).getTime() / 1_000);
    if (claims.exp <= now) throw new ClaimsValidationError('claims.time_expired');
    if (claims.iat > now + 5) throw new ClaimsValidationError('claims.time_future');
    if (claims.exp - claims.iat > SITE_PROOF_TTL_SECONDS) throw new ClaimsValidationError('claims.time_window_invalid');
    if (claims.kind !== expected.kind) throw new ClaimsValidationError('claims.other_binding_mismatch');
    exactClaim(claims.platform_issuer, expected.platformIssuer, 'claims.issuer_mismatch');
    exactClaim(claims.iss, new URL(expected.resource).hostname, 'claims.issuer_mismatch');
    exactClaim(claims.tenant_id, expected.tenantId, 'claims.tenant_mismatch');
    exactClaim(claims.resource, expected.resource, 'claims.resource_mismatch');
    exactClaim(claims.challenge, expected.challenge, 'claims.challenge_mismatch');
    exactClaim(claims.pairing_attempt_id, expected.pairingAttemptId, 'claims.site_binding_mismatch');
    exactClaim(claims.site_id, expected.siteId, 'claims.site_binding_mismatch');
    exactClaim(claims.platform_signing_key_sha256, expected.platformSigningKeySha256, 'claims.platform_key_binding_mismatch');
    exactClaim(claims.platform_signing_kid, expected.platformSigningKid, 'claims.platform_key_binding_mismatch');
    exactClaim(claims.grant_id, expected.grantId, 'claims.other_binding_mismatch');
    exactClaim(claims.client_id, expected.clientId, 'claims.other_binding_mismatch');
    exactClaim(claims.subject_id, expected.subjectId, 'claims.other_binding_mismatch');
    exactClaim(claims.aud, expected.kind === 'consent' ? expected.resource : undefined, 'claims.other_binding_mismatch');
    exactClaim(claims.decision, expected.decision, 'claims.other_binding_mismatch');
    if (expected.scopes !== undefined) {
      const actualScopes = [...(claims.scope ?? [])];
      const expectedScopes = [...expected.scopes];
      if (actualScopes.length !== expectedScopes.length || actualScopes.some((scope, index) => scope !== expectedScopes[index])) {
        throw new ClaimsValidationError('claims.other_binding_mismatch');
      }
    }
    return { claims, publicJwk, thumbprint: await calculateJwkThumbprint(publicJwk as JWK, 'sha256') };
  } catch (error) {
    // Never attach schema issues, claims, or an arbitrary exception as a diagnostic cause.
    throw new PairingDiagnosticError('proof', 'proof.claims_invalid', undefined,
      error instanceof ClaimsValidationError ? error.detail : 'unknown');
  }
}

export interface SiteProofResponse {
  readonly proof: string;
  readonly publicJwk: SitePublicJwk;
}

export interface SiteVerificationRequest {
  readonly resource: CanonicalResource;
  readonly platformIssuer: string;
  readonly tenantId: string;
  readonly pairingAttemptId: string;
  readonly siteId: string;
  readonly platformSigningKeyPem: string;
  readonly platformSigningKid: string;
  readonly verifier: string;
  readonly challenge: string;
}

export interface SiteVerificationClient {
  verify(input: SiteVerificationRequest): Promise<VerifiedSiteProof>;
}

export type SiteRequest = (url: URL, body: Uint8Array, pinnedAddress: string) => Promise<SiteProofResponse>;

const SiteProofResponseSchema = z.object({ proof: z.string(), publicJwk: SitePublicJwkSchema }).strict();

function httpDiagnostic(status: number): PairingDiagnosticError {
  if (status === 401) return diagnostic('response', 'http.401');
  if (status === 403) return diagnostic('response', 'http.403');
  if (status === 429) return diagnostic('response', 'http.429');
  if (status >= 400 && status < 500) return diagnostic('response', 'http.4xx');
  if (status >= 500 && status < 600) return diagnostic('response', 'http.5xx');
  return diagnostic('response', 'http.other');
}

const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

function networkDiagnostic(error: unknown): PairingDiagnosticError {
  if (error instanceof PairingDiagnosticError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;
  if (code !== undefined && (TLS_ERROR_CODES.has(code) || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_'))) {
    return diagnostic('network', 'tls.failed', error);
  }
  return diagnostic('network', 'network.failed', error);
}

export function createSiteProofRequest(options: {
  readonly ca?: string | Buffer;
  readonly timeoutMs?: number;
} = {}): SiteRequest {
  return (url, body, pinnedAddress) => requestSiteProof(url, body, pinnedAddress, options);
}

async function requestSiteProof(
  url: URL,
  body: Uint8Array,
  pinnedAddress: string,
  options: { readonly ca?: string | Buffer; readonly timeoutMs?: number } = {}
): Promise<SiteProofResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = (value: SiteProofResponse): void => {
      if (!settled) { settled = true; resolve(value); }
    };
    const fail = (error: unknown): void => {
      if (!settled) { settled = true; reject(error instanceof Error ? error : diagnostic('unknown', 'unknown', error)); }
    };
    const request = httpsRequest({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port === '' ? 443 : Number(url.port),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      servername: url.hostname,
      headers: { 'content-type': 'application/json', 'content-length': String(body.byteLength), accept: 'application/json' },
      lookup: createPinnedAddressLookup(pinnedAddress),
      ...(options.ca === undefined ? {} : { ca: options.ca })
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        fail(httpDiagnostic(response.statusCode ?? 0));
        return;
      }
      if (!(response.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        response.resume();
        fail(diagnostic('response', 'response.content_type_invalid'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_SITE_PROOF_BYTES) {
          fail(diagnostic('response', 'response.too_large'));
          response.destroy();
        }
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        let decoded: unknown;
        try {
          decoded = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        } catch (error) {
          fail(diagnostic('response', 'response.json_invalid', error));
          return;
        }
        const parsed = SiteProofResponseSchema.safeParse(decoded);
        if (!parsed.success) fail(diagnostic('response', 'response.schema_invalid', parsed.error));
        else succeed(parsed.data);
      });
    });
    request.setTimeout(options.timeoutMs ?? 5_000, () => {
      const error = diagnostic('network', 'network.timeout');
      fail(error);
      request.destroy(error);
    });
    request.once('error', (error) => { fail(networkDiagnostic(error)); });
    request.end(body);
  });
}

export class HttpsSiteVerificationClient implements SiteVerificationClient {
  readonly #request: SiteRequest;
  readonly #resolve: (hostname: string) => Promise<readonly string[]>;

  constructor(options: { request?: SiteRequest; resolve?: (hostname: string) => Promise<readonly string[]> } = {}) {
    this.#request = options.request ?? createSiteProofRequest();
    this.#resolve = options.resolve ?? resolvePublicAddresses;
  }

  async verify(input: SiteVerificationRequest): Promise<VerifiedSiteProof> {
    const resource = canonicalizeResource(input.resource);
    const resourceUrl = new URL(resource);
    const endpoint = new URL('/wp-json/wp-auto/v1/pairing/proof', resourceUrl.origin);
    let addresses: readonly string[];
    try {
      addresses = await this.#resolve(resourceUrl.hostname);
    } catch (error) {
      throw error instanceof PairingDiagnosticError ? error : diagnostic('dns', 'dns.failed', error);
    }
    const pinnedAddress = addresses[0];
    if (pinnedAddress === undefined) throw diagnostic('dns', 'dns.failed');
    if (!isPublicAddress(pinnedAddress)) throw diagnostic('destination', 'destination.unsafe');
    const body = Buffer.from(JSON.stringify({
      protocol_version: PAIRING_PROTOCOL_VERSION,
      tenant_id: input.tenantId,
      pairing_attempt_id: input.pairingAttemptId,
      site_id: input.siteId,
      platform_signing_key_pem: input.platformSigningKeyPem,
      platform_signing_kid: input.platformSigningKid,
      verifier: input.verifier,
      challenge: input.challenge,
      platform_issuer: input.platformIssuer,
      resource
    }));
    const response = await this.#request(endpoint, body, pinnedAddress);
    return verifySiteProof(response.proof, response.publicJwk, {
      kind: 'pairing',
      platformIssuer: input.platformIssuer,
      tenantId: input.tenantId,
      resource,
      challenge: input.challenge,
      pairingAttemptId: input.pairingAttemptId,
      siteId: input.siteId,
      platformSigningKeySha256: createHash('sha256').update(input.platformSigningKeyPem, 'utf8').digest('base64url'),
      platformSigningKid: input.platformSigningKid
    });
  }
}

export interface PairingAttemptRecord {
  readonly tenantId: string;
  readonly id: string;
  readonly resource: CanonicalResource;
  readonly verifierHash: Uint8Array;
  readonly status: 'pending' | 'verifying';
  readonly expiresAt: Date;
}

export interface PairingRepository {
  createAttempt(record: PairingAttemptRecord & { readonly initiatorAccountId: string; readonly correlationId: string }): Promise<void>;
  findAttemptForUpdate(tenantId: string, attemptId: string): Promise<PairingAttemptRecord | undefined>;
  markVerifying(tenantId: string, attemptId: string): Promise<boolean>;
  fail(tenantId: string, attemptId: string, reason: string): Promise<void>;
  complete(
    record: PairingAttemptRecord,
    proof: VerifiedSiteProof,
    siteId: string,
    idempotencyKey: string
  ): Promise<void>;
}

export function secretHash(secret: string): Uint8Array {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export class PairingService {
  readonly #repository: PairingRepository;
  readonly #verifier: SiteVerificationClient;
  readonly #platformIssuer: string;
  readonly #platformSigningKeyPem: string;
  readonly #platformSigningKid: string;
  readonly #now: () => Date;

  constructor(options: {
    repository: PairingRepository;
    verifier: SiteVerificationClient;
    platformIssuer: string;
    platformSigningKeyPem: string;
    platformSigningKid: string;
    now?: () => Date;
  }) {
    this.#repository = options.repository;
    this.#verifier = options.verifier;
    this.#platformIssuer = options.platformIssuer;
    if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/u.test(options.platformSigningKeyPem)
      || options.platformSigningKeyPem.length > 8_192) throw new Error('platform_signing_key_invalid');
    this.#platformSigningKeyPem = options.platformSigningKeyPem;
    this.#platformSigningKid = OpaqueIdSchema.parse(options.platformSigningKid);
    this.#now = options.now ?? (() => new Date());
  }

  async begin(input: {
    tenantId: string;
    attemptId: string;
    accountId: string;
    correlationId: string;
    resource: string;
    verifier: string;
  }): Promise<{ readonly expiresAt: Date }> {
    if (!/^[A-Za-z0-9_-]{43,128}$/u.test(input.verifier)) throw new Error('invalid_verifier');
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + PAIRING_ATTEMPT_TTL_MS);
    const record = {
      tenantId: input.tenantId,
      id: OpaqueIdSchema.parse(input.attemptId),
      initiatorAccountId: OpaqueIdSchema.parse(input.accountId),
      correlationId: OpaqueIdSchema.parse(input.correlationId),
      resource: canonicalizeResource(input.resource),
      verifierHash: secretHash(input.verifier),
      status: 'pending' as const,
      expiresAt
    };
    try {
      await this.#repository.createAttempt(record);
    } catch (error) {
      throw diagnostic('persistence', 'pairing.persistence_failed', error);
    }
    return { expiresAt };
  }

  async verify(input: {
    tenantId: string;
    attemptId: string;
    verifier: string;
    siteId: string;
    idempotencyKey: string;
  }): Promise<VerifiedSiteProof> {
    let attempt: PairingAttemptRecord | undefined;
    try {
      attempt = await this.#repository.findAttemptForUpdate(input.tenantId, input.attemptId);
    } catch (error) {
      throw diagnostic('persistence', 'pairing.persistence_failed', error);
    }
    if (attempt === undefined || attempt.expiresAt <= this.#now()) throw diagnostic('state', 'pairing.state_invalid');
    const candidate = secretHash(input.verifier);
    if (candidate.byteLength !== attempt.verifierHash.byteLength || !timingSafeEqual(candidate, attempt.verifierHash)) {
      throw diagnostic('state', 'pairing.state_invalid');
    }
    let marked: boolean;
    try {
      marked = await this.#repository.markVerifying(input.tenantId, input.attemptId);
    } catch (error) {
      throw diagnostic('persistence', 'pairing.persistence_failed', error);
    }
    if (!marked) throw diagnostic('state', 'pairing.state_invalid');
    try {
      const proof = await this.#verifier.verify({
        resource: attempt.resource,
        platformIssuer: this.#platformIssuer,
        tenantId: attempt.tenantId,
        pairingAttemptId: attempt.id,
        siteId: input.siteId,
        platformSigningKeyPem: this.#platformSigningKeyPem,
        platformSigningKid: this.#platformSigningKid,
        verifier: input.verifier,
        challenge: randomBytes(32).toString('base64url')
      });
      try {
        await this.#repository.complete(attempt, proof, OpaqueIdSchema.parse(input.siteId), input.idempotencyKey);
      } catch (error) {
        throw diagnostic('persistence', 'pairing.persistence_failed', error);
      }
      return proof;
    } catch (error) {
      try {
        await this.#repository.fail(input.tenantId, input.attemptId, 'verification_failed');
      } catch (persistenceError) {
        throw diagnostic('persistence', 'pairing.persistence_failed', new AggregateError([error, persistenceError]));
      }
      throw error instanceof PairingDiagnosticError ? error : diagnostic('unknown', 'unknown', error);
    }
  }
}

export interface PendingGrantRecord {
  readonly tenantId: string;
  readonly id: string;
  readonly siteId: string;
  readonly subjectId: string;
  readonly clientId: string;
  readonly scopes: readonly McpScope[];
  readonly resource: CanonicalResource;
  readonly publicJwk: SitePublicJwk;
  readonly challengeHash: Uint8Array;
  readonly expiresAt: Date;
  readonly status: 'pending';
  readonly completionReplay?: boolean;
}

export interface GrantRepository {
  createPending(record: Omit<PendingGrantRecord, 'publicJwk' | 'status'> & {
    readonly consentVersion: string;
    readonly idempotencyKey: string;
    readonly requestDigest: Uint8Array;
    readonly createdAt: Date;
  }): Promise<{ readonly id: string; readonly createdAt: Date; readonly expiresAt: Date }>;
  findPending(tenantId: string, grantId: string, idempotencyKey: string): Promise<PendingGrantRecord | undefined>;
  activate(tenantId: string, grantId: string, idempotencyKey: string, proofThumbprint: string): Promise<void>;
  deny(tenantId: string, grantId: string, idempotencyKey: string, proofThumbprint: string): Promise<void>;
  revoke(tenantId: string, grantId: string, reason: string): Promise<boolean>;
}

export interface ConsentRequestSigner {
  sign(payload: Readonly<Record<string, unknown>>): Promise<string>;
}

export class GrantService {
  readonly #repository: GrantRepository;
  readonly #signer: ConsentRequestSigner;
  readonly #platformIssuer: string;
  readonly #now: () => Date;
  readonly #challengeFactory: (input: Readonly<Record<string, unknown>>) => string;

  constructor(options: {
    repository: GrantRepository;
    signer: ConsentRequestSigner;
    platformIssuer: string;
    now?: () => Date;
    challengeFactory?: (input: Readonly<Record<string, unknown>>) => string;
  }) {
    this.#repository = options.repository;
    this.#signer = options.signer;
    this.#platformIssuer = options.platformIssuer;
    this.#now = options.now ?? (() => new Date());
    this.#challengeFactory = options.challengeFactory ?? (() => randomBytes(32).toString('base64url'));
  }

  async begin(input: {
    tenantId: string;
    grantId: string;
    siteId: string;
    subjectId: string;
    clientId: string;
    scopes: readonly McpScope[];
    resource: string;
    consentVersion: string;
    idempotencyKey: string;
  }): Promise<{ readonly grantId: string; readonly request: string; readonly challenge: string; readonly expiresAt: Date }> {
    const scopes = McpScopeSetSchema.parse(input.scopes);
    const resource = canonicalizeResource(input.resource);
    const immutableInput = {
      tenantId: input.tenantId, siteId: input.siteId, subjectId: input.subjectId,
      clientId: input.clientId, scopes, resource, consentVersion: input.consentVersion,
      idempotencyKey: input.idempotencyKey
    };
    const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(this.#challengeFactory(immutableInput));
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1_000);
    const created = await this.#repository.createPending({
      tenantId: input.tenantId,
      id: OpaqueIdSchema.parse(input.grantId),
      siteId: OpaqueIdSchema.parse(input.siteId),
      subjectId: OpaqueIdSchema.parse(input.subjectId),
      clientId: z.string().regex(/^[A-Za-z0-9._~-]{8,256}$/u).parse(input.clientId),
      scopes,
      resource,
      challengeHash: secretHash(challenge),
      expiresAt,
      consentVersion: z.string().regex(/^\d+$/u).parse(input.consentVersion),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u).parse(input.idempotencyKey),
      requestDigest: createHash('sha256').update(JSON.stringify(immutableInput), 'utf8').digest(),
      createdAt: now
    });
    const request = await this.#signer.sign({
      kind: 'consent_request',
      protocol_version: PAIRING_PROTOCOL_VERSION,
      iss: this.#platformIssuer,
      tenant_id: input.tenantId,
      site_id: input.siteId,
      grant_id: created.id,
      subject_id: input.subjectId,
      client_id: input.clientId,
      aud: resource,
      resource,
      scope: scopes,
      challenge,
      iat: Math.floor(created.createdAt.getTime() / 1_000),
      exp: Math.floor(created.expiresAt.getTime() / 1_000)
    });
    return { grantId: created.id, request, challenge, expiresAt: created.expiresAt };
  }

  async complete(input: {
    tenantId: string;
    grantId: string;
    proof: string;
    challenge: string;
    decision: 'approved' | 'denied';
    idempotencyKey: string;
  }): Promise<VerifiedSiteProof> {
    const grant = await this.#repository.findPending(input.tenantId, input.grantId, input.idempotencyKey);
    if (grant === undefined || (!grant.completionReplay && grant.expiresAt <= this.#now())) throw new Error('grant_not_pending');
    const challengeHash = secretHash(input.challenge);
    if (challengeHash.byteLength !== grant.challengeHash.byteLength || !timingSafeEqual(challengeHash, grant.challengeHash)) {
      throw new Error('consent_challenge_invalid');
    }
    const proof = await verifySiteProof(input.proof, grant.publicJwk, {
      kind: 'consent',
      platformIssuer: this.#platformIssuer,
      tenantId: grant.tenantId,
      siteId: grant.siteId,
      resource: grant.resource,
      challenge: input.challenge,
      grantId: grant.id,
      clientId: grant.clientId,
      subjectId: grant.subjectId,
      scopes: grant.scopes,
      decision: input.decision,
      now: this.#now()
    });
    if (input.decision === 'approved') {
      await this.#repository.activate(grant.tenantId, grant.id, input.idempotencyKey, proof.thumbprint);
    } else {
      await this.#repository.deny(grant.tenantId, grant.id, input.idempotencyKey, proof.thumbprint);
    }
    return proof;
  }
}
