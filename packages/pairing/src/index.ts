import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve4, resolve6 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import ipaddr from 'ipaddr.js';
import { calculateJwkThumbprint, compactVerify, importJWK, type JWK } from 'jose';
import { z } from 'zod';
import { CanonicalResourceSchema, OpaqueIdSchema, type CanonicalResource } from '@wepuu/contracts';

export const PAIRING_PROTOCOL_VERSION = '1';
export const PAIRING_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
export const SITE_PROOF_TTL_SECONDS = 60;
export const MAX_SITE_PROOF_BYTES = 16 * 1_024;

const SitePublicJwkSchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().min(40).max(64),
  kid: OpaqueIdSchema.optional(),
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
  grant_id: OpaqueIdSchema.optional(),
  subject_id: OpaqueIdSchema.optional(),
  client_id: OpaqueIdSchema.optional(),
  resource: CanonicalResourceSchema,
  scope: z.array(z.string().regex(/^mcp:[a-z][a-z0-9_.-]{0,63}$/u)).min(1).max(16).optional(),
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
  readonly grantId?: string;
  readonly clientId?: string;
  readonly subjectId?: string;
  readonly scopes?: readonly string[];
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

export async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  if (isIP(hostname) !== 0) {
    if (!isPublicAddress(hostname)) throw new Error('unsafe_destination');
    return [hostname];
  }
  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch(() => [] as string[]),
    resolve6(hostname).catch(() => [] as string[])
  ]);
  const addresses = [...new Set([...v4, ...v6])];
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error('unsafe_destination');
  }
  return addresses.sort();
}

function exactClaim(actual: string | undefined, expected: string | undefined, name: string): void {
  if (expected !== undefined && actual !== expected) throw new Error(`${name}_mismatch`);
}

export async function verifySiteProof(
  compactJws: string,
  publicJwkInput: unknown,
  expected: ExpectedSiteProof
): Promise<VerifiedSiteProof> {
  if (Buffer.byteLength(compactJws, 'utf8') > MAX_SITE_PROOF_BYTES) throw new Error('proof_too_large');
  const publicJwk = SitePublicJwkSchema.parse(publicJwkInput);
  const key = await importJWK(publicJwk as JWK, 'EdDSA');
  const verified = await compactVerify(compactJws, key, { algorithms: ['EdDSA'] });
  if (verified.protectedHeader.typ !== 'wepuu-site-proof+jwt') throw new Error('proof_typ_invalid');
  const claims = SiteProofClaimsSchema.parse(JSON.parse(new TextDecoder().decode(verified.payload)) as unknown);
  const now = Math.floor((expected.now ?? new Date()).getTime() / 1_000);
  if (claims.exp <= now || claims.iat > now + 5 || claims.exp - claims.iat > SITE_PROOF_TTL_SECONDS) {
    throw new Error('proof_time_invalid');
  }
  if (claims.kind !== expected.kind) throw new Error('proof_kind_mismatch');
  if (claims.platform_issuer !== expected.platformIssuer) throw new Error('issuer_mismatch');
  if (claims.iss !== new URL(expected.resource).hostname) throw new Error('site_issuer_mismatch');
  if (claims.tenant_id !== expected.tenantId) throw new Error('tenant_mismatch');
  if (claims.resource !== expected.resource) throw new Error('resource_mismatch');
  if (claims.challenge !== expected.challenge) throw new Error('challenge_mismatch');
  exactClaim(claims.pairing_attempt_id, expected.pairingAttemptId, 'pairing_attempt');
  exactClaim(claims.grant_id, expected.grantId, 'grant');
  exactClaim(claims.client_id, expected.clientId, 'client');
  exactClaim(claims.subject_id, expected.subjectId, 'subject');
  if (expected.scopes !== undefined) {
    const actualScopes = [...(claims.scope ?? [])].sort();
    const expectedScopes = [...expected.scopes].sort();
    if (actualScopes.length !== expectedScopes.length || actualScopes.some((scope, index) => scope !== expectedScopes[index])) {
      throw new Error('scope_mismatch');
    }
  }
  return {
    claims,
    publicJwk,
    thumbprint: await calculateJwkThumbprint(publicJwk as JWK, 'sha256')
  };
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
  readonly verifier: string;
  readonly challenge: string;
}

export interface SiteVerificationClient {
  verify(input: SiteVerificationRequest): Promise<VerifiedSiteProof>;
}

export type SiteRequest = (url: URL, body: Uint8Array, pinnedAddress: string) => Promise<SiteProofResponse>;

async function requestSiteProof(url: URL, body: Uint8Array, pinnedAddress: string): Promise<SiteProofResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      servername: url.hostname,
      headers: { 'content-type': 'application/json', 'content-length': String(body.byteLength), accept: 'application/json' },
      lookup: (_hostname, _options, callback) => {
        callback(null, pinnedAddress, isIP(pinnedAddress));
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('site_proof_status_invalid'));
        return;
      }
      if (!(response.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        response.resume();
        reject(new Error('site_proof_content_type_invalid'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_SITE_PROOF_BYTES) response.destroy(new Error('site_proof_too_large'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const parsed = z.object({ proof: z.string(), publicJwk: SitePublicJwkSchema }).strict()
            .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
          resolve(parsed);
        } catch {
          reject(new Error('site_proof_response_invalid'));
        }
      });
    });
    request.setTimeout(5_000, () => request.destroy(new Error('site_proof_timeout')));
    request.once('error', reject);
    request.end(body);
  });
}

export class HttpsSiteVerificationClient implements SiteVerificationClient {
  readonly #request: SiteRequest;
  readonly #resolve: (hostname: string) => Promise<readonly string[]>;

  constructor(options: { request?: SiteRequest; resolve?: (hostname: string) => Promise<readonly string[]> } = {}) {
    this.#request = options.request ?? requestSiteProof;
    this.#resolve = options.resolve ?? resolvePublicAddresses;
  }

  async verify(input: SiteVerificationRequest): Promise<VerifiedSiteProof> {
    const resource = canonicalizeResource(input.resource);
    const resourceUrl = new URL(resource);
    const endpoint = new URL('/wp-json/wp-auto/v1/pairing/proof', resourceUrl.origin);
    const addresses = await this.#resolve(resourceUrl.hostname);
    const pinnedAddress = addresses[0];
    if (pinnedAddress === undefined || !isPublicAddress(pinnedAddress)) throw new Error('unsafe_destination');
    const body = Buffer.from(JSON.stringify({
      protocol_version: PAIRING_PROTOCOL_VERSION,
      pairing_attempt_id: input.pairingAttemptId,
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
      pairingAttemptId: input.pairingAttemptId
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
  readonly #now: () => Date;

  constructor(options: {
    repository: PairingRepository;
    verifier: SiteVerificationClient;
    platformIssuer: string;
    now?: () => Date;
  }) {
    this.#repository = options.repository;
    this.#verifier = options.verifier;
    this.#platformIssuer = options.platformIssuer;
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
    await this.#repository.createAttempt({
      tenantId: input.tenantId,
      id: OpaqueIdSchema.parse(input.attemptId),
      initiatorAccountId: OpaqueIdSchema.parse(input.accountId),
      correlationId: OpaqueIdSchema.parse(input.correlationId),
      resource: canonicalizeResource(input.resource),
      verifierHash: secretHash(input.verifier),
      status: 'pending',
      expiresAt
    });
    return { expiresAt };
  }

  async verify(input: {
    tenantId: string;
    attemptId: string;
    verifier: string;
    siteId: string;
    idempotencyKey: string;
  }): Promise<VerifiedSiteProof> {
    const attempt = await this.#repository.findAttemptForUpdate(input.tenantId, input.attemptId);
    if (attempt === undefined || attempt.expiresAt <= this.#now()) throw new Error('pairing_attempt_invalid');
    const candidate = secretHash(input.verifier);
    if (candidate.byteLength !== attempt.verifierHash.byteLength || !timingSafeEqual(candidate, attempt.verifierHash)) {
      throw new Error('pairing_verifier_invalid');
    }
    if (!(await this.#repository.markVerifying(input.tenantId, input.attemptId))) throw new Error('pairing_replay');
    try {
      const proof = await this.#verifier.verify({
        resource: attempt.resource,
        platformIssuer: this.#platformIssuer,
        tenantId: attempt.tenantId,
        pairingAttemptId: attempt.id,
        verifier: input.verifier,
        challenge: randomBytes(32).toString('base64url')
      });
      await this.#repository.complete(attempt, proof, OpaqueIdSchema.parse(input.siteId), input.idempotencyKey);
      return proof;
    } catch (error) {
      await this.#repository.fail(input.tenantId, input.attemptId, 'verification_failed');
      throw error;
    }
  }
}

export interface PendingGrantRecord {
  readonly tenantId: string;
  readonly id: string;
  readonly siteId: string;
  readonly subjectId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly resource: CanonicalResource;
  readonly publicJwk: SitePublicJwk;
  readonly challengeHash: Uint8Array;
  readonly expiresAt: Date;
  readonly status: 'pending';
}

export interface GrantRepository {
  createPending(record: Omit<PendingGrantRecord, 'publicJwk' | 'status'> & { readonly consentVersion: string }): Promise<void>;
  findPending(tenantId: string, grantId: string): Promise<PendingGrantRecord | undefined>;
  activate(tenantId: string, grantId: string, idempotencyKey: string, proofThumbprint: string): Promise<void>;
  revoke(tenantId: string, grantId: string, reason: string): Promise<boolean>;
}

export interface ConsentRequestSigner {
  sign(payload: Readonly<Record<string, unknown>>): Promise<string>;
}

const RequestedScopeSchema = z.array(z.string().regex(/^mcp:[a-z][a-z0-9_.-]{0,63}$/u)).min(1).max(16)
  .refine((scopes) => new Set(scopes).size === scopes.length, 'duplicate_scope');

export class GrantService {
  readonly #repository: GrantRepository;
  readonly #signer: ConsentRequestSigner;
  readonly #platformIssuer: string;
  readonly #now: () => Date;

  constructor(options: {
    repository: GrantRepository;
    signer: ConsentRequestSigner;
    platformIssuer: string;
    now?: () => Date;
  }) {
    this.#repository = options.repository;
    this.#signer = options.signer;
    this.#platformIssuer = options.platformIssuer;
    this.#now = options.now ?? (() => new Date());
  }

  async begin(input: {
    tenantId: string;
    grantId: string;
    siteId: string;
    subjectId: string;
    clientId: string;
    scopes: readonly string[];
    resource: string;
    consentVersion: string;
  }): Promise<{ readonly request: string; readonly challenge: string; readonly expiresAt: Date }> {
    const scopes = RequestedScopeSchema.parse(input.scopes);
    const resource = canonicalizeResource(input.resource);
    const challenge = randomBytes(32).toString('base64url');
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1_000);
    await this.#repository.createPending({
      tenantId: input.tenantId,
      id: OpaqueIdSchema.parse(input.grantId),
      siteId: OpaqueIdSchema.parse(input.siteId),
      subjectId: OpaqueIdSchema.parse(input.subjectId),
      clientId: z.string().regex(/^[A-Za-z0-9._~-]{8,256}$/u).parse(input.clientId),
      scopes,
      resource,
      challengeHash: secretHash(challenge),
      expiresAt,
      consentVersion: z.string().regex(/^\d+$/u).parse(input.consentVersion)
    });
    const request = await this.#signer.sign({
      kind: 'consent_request',
      protocol_version: PAIRING_PROTOCOL_VERSION,
      iss: this.#platformIssuer,
      tenant_id: input.tenantId,
      site_id: input.siteId,
      grant_id: input.grantId,
      subject_id: input.subjectId,
      client_id: input.clientId,
      resource,
      scope: scopes,
      challenge,
      iat: Math.floor(now.getTime() / 1_000),
      exp: Math.floor(expiresAt.getTime() / 1_000)
    });
    return { request, challenge, expiresAt };
  }

  async complete(input: {
    tenantId: string;
    grantId: string;
    proof: string;
    challenge: string;
    idempotencyKey: string;
  }): Promise<VerifiedSiteProof> {
    const grant = await this.#repository.findPending(input.tenantId, input.grantId);
    if (grant === undefined || grant.expiresAt <= this.#now()) throw new Error('grant_not_pending');
    const challengeHash = secretHash(input.challenge);
    if (challengeHash.byteLength !== grant.challengeHash.byteLength || !timingSafeEqual(challengeHash, grant.challengeHash)) {
      throw new Error('consent_challenge_invalid');
    }
    const proof = await verifySiteProof(input.proof, grant.publicJwk, {
      kind: 'consent',
      platformIssuer: this.#platformIssuer,
      tenantId: grant.tenantId,
      resource: grant.resource,
      challenge: input.challenge,
      grantId: grant.id,
      clientId: grant.clientId,
      subjectId: grant.subjectId,
      scopes: grant.scopes,
      now: this.#now()
    });
    await this.#repository.activate(grant.tenantId, grant.id, input.idempotencyKey, proof.thumbprint);
    return proof;
  }
}
