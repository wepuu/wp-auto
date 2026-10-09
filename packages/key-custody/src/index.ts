import { lstat, readFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey, sign as rsaSign, type JsonWebKey, type KeyObject } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { calculateJwkThumbprint, SignJWT } from 'jose';
import { z } from 'zod';

const KidSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const publicMembers = ['kty', 'n', 'e', 'kid', 'alg', 'use'] as const;
const privateMembers = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'] as const;

export interface SigningKeyDescriptor {
  readonly kid: string;
  readonly algorithm: 'RS256';
  readonly publicKey: KeyObject;
  readonly publicJwk: Readonly<JsonWebKey & { kid: string; alg: 'RS256'; use: 'sig' }>;
}

export interface KeyCustody {
  describeSigningKey(): Promise<SigningKeyDescriptor>;
  sign(signingInput: Uint8Array): Promise<Uint8Array>;
}

export class KeyCustodyUnavailableError extends Error {
  constructor() {
    super('key_custody_unavailable');
    this.name = 'KeyCustodyUnavailableError';
  }
}

const KeyringSchema = z.object({
  keys: z.array(z.object({
    slot: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
    privateKeyFile: z.string().min(1).max(4096),
    passphraseFile: z.string().min(1).max(4096)
  }).strict()).min(1).max(8)
}).strict();

export type LocalKeyring = z.infer<typeof KeyringSchema>;

async function readProtectedFile(path: string, production: boolean, maximumBytes: number): Promise<Buffer> {
  if (!isAbsolute(path)) throw new KeyCustodyUnavailableError();
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximumBytes) {
      throw new KeyCustodyUnavailableError();
    }
    if (production && process.platform !== 'win32') {
      if ((metadata.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
        throw new KeyCustodyUnavailableError();
      }
    }
    return await readFile(path);
  } catch {
    throw new KeyCustodyUnavailableError();
  }
}

function canonicalPublicJwk(publicKey: KeyObject, kid: string): SigningKeyDescriptor['publicJwk'] {
  const exported = publicKey.export({ format: 'jwk' });
  if (exported.kty !== 'RSA' || typeof exported.n !== 'string' || typeof exported.e !== 'string') throw new KeyCustodyUnavailableError();
  const jwk = Object.freeze({ kty: 'RSA', n: exported.n, e: exported.e, kid, alg: 'RS256', use: 'sig' } as const);
  return jwk;
}

export async function signingKeyDescriptorFromPublicJwk(
  input: Readonly<Record<string, unknown>>,
  requireThumbprintKid = true
): Promise<SigningKeyDescriptor> {
  try {
    if (privateMembers.some((member) => input[member] !== undefined)
      || input['kty'] !== 'RSA' || input['alg'] !== 'RS256' || input['use'] !== 'sig') {
      throw new KeyCustodyUnavailableError();
    }
    const kid = KidSchema.parse(input['kid']);
    const publicJwk = Object.fromEntries(publicMembers.map((member) => [member, input[member]])) as JsonWebKey;
    const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });
    const canonical = canonicalPublicJwk(publicKey, kid);
    if (requireThumbprintKid && await calculateJwkThumbprint(canonical, 'sha256') !== kid) throw new KeyCustodyUnavailableError();
    return Object.freeze({ kid, algorithm: 'RS256', publicKey, publicJwk: canonical });
  } catch {
    throw new KeyCustodyUnavailableError();
  }
}

export class LocalPkcs8KeyCustody implements KeyCustody {
  readonly #privateKey: KeyObject;
  readonly #descriptor: SigningKeyDescriptor;

  private constructor(privateKey: KeyObject, descriptor: SigningKeyDescriptor) {
    this.#privateKey = privateKey;
    this.#descriptor = descriptor;
  }

  static async load(input: Readonly<{
    privateKeyFile: string;
    passphraseFile: string;
    production?: boolean;
    expectedKid?: string;
  }>): Promise<LocalPkcs8KeyCustody> {
    try {
      const [pem, passphraseBytes] = await Promise.all([
        readProtectedFile(input.privateKeyFile, input.production === true, 32_768),
        readProtectedFile(input.passphraseFile, input.production === true, 1_024)
      ]);
      const passphrase = passphraseBytes.toString('utf8').replace(/\r?\n$/u, '');
      if (passphrase.length < 16) throw new KeyCustodyUnavailableError();
      if (!/^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n/u.test(pem.toString('ascii'))) {
        throw new KeyCustodyUnavailableError();
      }
      const privateKey = createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8', passphrase });
      if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa'
        || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) throw new KeyCustodyUnavailableError();
      const publicKey = createPublicKey(privateKey);
      const provisional = canonicalPublicJwk(publicKey, 'provisional');
      const kid = await calculateJwkThumbprint(provisional, 'sha256');
      if (input.expectedKid !== undefined && KidSchema.parse(input.expectedKid) !== kid) throw new KeyCustodyUnavailableError();
      const descriptor = Object.freeze({
        kid, algorithm: 'RS256' as const, publicKey, publicJwk: canonicalPublicJwk(publicKey, kid)
      });
      return new LocalPkcs8KeyCustody(privateKey, descriptor);
    } catch {
      throw new KeyCustodyUnavailableError();
    }
  }

  async describeSigningKey(): Promise<SigningKeyDescriptor> {
    return await Promise.resolve(this.#descriptor);
  }

  async sign(signingInput: Uint8Array): Promise<Uint8Array> {
    if (signingInput.byteLength === 0 || signingInput.byteLength > 4096) throw new KeyCustodyUnavailableError();
    try {
      return await Promise.resolve(new Uint8Array(rsaSign('RSA-SHA256', signingInput, this.#privateKey)));
    } catch {
      throw new KeyCustodyUnavailableError();
    }
  }

  consentRequestSigner(): JoseConsentRequestSigner {
    return new JoseConsentRequestSigner(this.#privateKey, this.#descriptor.kid);
  }

  revocationEventSigner(): JoseRevocationEventSigner {
    return new JoseRevocationEventSigner(this.#privateKey, this.#descriptor.kid);
  }
}

export async function localPkcs8KeyCustodyFromEnvironment(
  environment: NodeJS.ProcessEnv,
  slot: string,
  expectedKid?: string
): Promise<LocalPkcs8KeyCustody> {
  const manifestPath = environment['WEPUU_SIGNING_KEYRING_FILE'];
  if (manifestPath === undefined) throw new KeyCustodyUnavailableError();
  const production = environment['WEPUU_DEPLOYMENT_MODE'] === 'staging'
    || environment['WEPUU_DEPLOYMENT_MODE'] === 'production';
  const serialized = await readProtectedFile(manifestPath, production, 32_768);
  try {
    const manifest = KeyringSchema.parse(JSON.parse(serialized.toString('utf8')) as unknown);
    if (new Set(manifest.keys.map((entry) => entry.slot)).size !== manifest.keys.length) throw new KeyCustodyUnavailableError();
    const entry = manifest.keys.find((candidate) => candidate.slot === slot);
    if (entry === undefined) throw new KeyCustodyUnavailableError();
    return await LocalPkcs8KeyCustody.load({ ...entry, production, ...(expectedKid === undefined ? {} : { expectedKid }) });
  } catch {
    throw new KeyCustodyUnavailableError();
  }
}

/** Signs the bounded platform consent request through panva/jose. */
export class JoseConsentRequestSigner {
  constructor(private readonly privateKey: KeyObject, private readonly kid: string) {
    if (privateKey.type !== 'private' || !KidSchema.safeParse(kid).success) throw new KeyCustodyUnavailableError();
  }
  async sign(payload: Readonly<Record<string, unknown>>): Promise<string> {
    try {
      return await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'RS256', typ: 'wepuu-consent-request+jwt', kid: this.kid })
        .sign(this.privateKey);
    } catch { throw new KeyCustodyUnavailableError(); }
  }
}

const RevocationEventSchema = z.object({
  issuer: z.url().refine((value) => value.startsWith('https://')),
  resource: z.url().refine((value) => value.startsWith('https://')),
  tenantId: z.uuid(), siteId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
  sequence: z.number().int().positive(), eventType: z.enum(['grant', 'site', 'subject', 'token', 'key']),
  grantId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u).optional(),
  tokenJtiHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/u).optional(),
  keyId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u).optional(),
  reason: z.string().regex(/^[a-z][a-z0-9_.-]{2,63}$/u)
}).strict().superRefine((value, context) => {
  if (value.eventType === 'grant' && value.grantId === undefined) context.addIssue({ code: 'custom', message: 'grant_id_required' });
  if (value.eventType === 'token' && value.tokenJtiHash === undefined) context.addIssue({ code: 'custom', message: 'token_jti_hash_required' });
  if (value.eventType === 'key' && value.keyId === undefined) context.addIssue({ code: 'custom', message: 'key_id_required' });
});
export type RevocationEvent = z.infer<typeof RevocationEventSchema>;

export class JoseRevocationEventSigner {
  constructor(private readonly privateKey: KeyObject, private readonly kid: string) {
    if (privateKey.type !== 'private' || !KidSchema.safeParse(kid).success) throw new KeyCustodyUnavailableError();
  }
  async sign(input: RevocationEvent, now = new Date()): Promise<string> {
    const event = RevocationEventSchema.parse(input);
    const issuedAt = Math.floor(now.getTime() / 1_000);
    try {
      return await new SignJWT({
        kind: 'revocation', protocol_version: '1', tenant_id: event.tenantId, site_id: event.siteId,
        sequence: event.sequence, event_type: event.eventType, reason: event.reason,
        ...(event.grantId === undefined ? {} : { grant_id: event.grantId }),
        ...(event.tokenJtiHash === undefined ? {} : { token_jti_hash: event.tokenJtiHash }),
        ...(event.keyId === undefined ? {} : { key_id: event.keyId })
      }).setProtectedHeader({ alg: 'RS256', typ: 'wepuu-revocation+jwt', kid: this.kid })
        .setIssuer(event.issuer).setAudience(event.resource).setIssuedAt(issuedAt)
        .setNotBefore(issuedAt - 5).setExpirationTime(issuedAt + 60).sign(this.privateKey);
    } catch { throw new KeyCustodyUnavailableError(); }
  }
}
