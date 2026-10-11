import { request as httpsRequest } from 'node:https';
import type { JoseRevocationEventSigner } from '@wepuu/key-custody';
import type { PostgresRevocationOutbox, RevocationOutboxRecord } from '@wepuu/database';
import {
  canonicalizeResource,
  createPinnedAddressLookup,
  isPublicAddress,
  resolvePublicAddresses
} from '@wepuu/pairing';

export function revocationEndpoint(resource: string): URL {
  const canonical = canonicalizeResource(resource);
  const parsed = new URL(canonical);
  if (parsed.pathname !== '/wp-json/wp-auto/mcp') throw new Error('resource_path_not_supported');
  return new URL('/wp-json/wp-auto/v1/revocations', parsed.origin);
}

export interface RevocationDelivery {
  send(resource: string, compactJws: string): Promise<void>;
}

export type RevocationAddressResolver = (hostname: string) => Promise<readonly string[]>;
export type RevocationRequest = (endpoint: URL, body: Buffer, pinnedAddress: string) => Promise<void>;

export class RevocationDeliveryFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const tlsErrorCodes = new Set([
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

export function revocationErrorCode(error: unknown): string {
  if (error instanceof RevocationDeliveryFailure) return error.code;
  if (error instanceof Error) {
    const code: unknown = (error as Error & { code?: unknown }).code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns.failed';
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'network.timeout';
    if (typeof code === 'string' && tlsErrorCodes.has(code)) return 'tls.failed';
    if (error.message === 'unsafe_destination') return 'destination.unsafe';
  }
  return 'network.failed';
}

async function sendPinnedHttpsRequest(endpoint: URL, body: Buffer, pinnedAddress: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:', hostname: endpoint.hostname, port: 443,
      path: endpoint.pathname, method: 'POST', servername: endpoint.hostname,
      headers: {
        'content-type': 'application/jwt', accept: 'application/json',
        'content-length': String(body.byteLength)
      },
      lookup: createPinnedAddressLookup(pinnedAddress)
    }, (response) => {
      response.resume();
      if (response.statusCode === 204) resolve();
      else reject(new RevocationDeliveryFailure(`http.${String(response.statusCode ?? 0)}`));
    });
    request.setTimeout(5_000, () => request.destroy(Object.assign(
      new Error('revocation_delivery_timeout'), { code: 'ETIMEDOUT' }
    )));
    request.once('error', reject);
    request.end(body);
  });
}

export class HttpsRevocationDelivery implements RevocationDelivery {
  readonly #resolve: RevocationAddressResolver;
  readonly #request: RevocationRequest;

  constructor(options: Readonly<{
    resolve?: RevocationAddressResolver;
    request?: RevocationRequest;
  }> = {}) {
    this.#resolve = options.resolve ?? resolvePublicAddresses;
    this.#request = options.request ?? sendPinnedHttpsRequest;
  }

  async send(resource: string, compactJws: string): Promise<void> {
    if (Buffer.byteLength(compactJws, 'utf8') > 16 * 1024) throw new Error('revocation_event_too_large');
    const endpoint = revocationEndpoint(resource);
    const addresses = await this.#resolve(endpoint.hostname);
    const pinnedAddress = addresses[0];
    if (pinnedAddress === undefined || !isPublicAddress(pinnedAddress)) throw new Error('unsafe_destination');
    await this.#request(endpoint, Buffer.from(compactJws, 'utf8'), pinnedAddress);
  }
}

export class RevocationWorker {
  readonly #outbox: PostgresRevocationOutbox;
  readonly #signer: Pick<JoseRevocationEventSigner, 'sign'>;
  readonly #delivery: RevocationDelivery;
  readonly #issuer: string;
  readonly #now: () => Date;

  constructor(options: Readonly<{
    outbox: PostgresRevocationOutbox;
    signer: Pick<JoseRevocationEventSigner, 'sign'>;
    delivery: RevocationDelivery;
    issuer: string;
    now?: () => Date;
  }>) {
    this.#outbox = options.outbox;
    this.#signer = options.signer;
    this.#delivery = options.delivery;
    this.#issuer = new URL(options.issuer).href.replace(/\/$/u, '');
    this.#now = options.now ?? (() => new Date());
  }

  async runOnce(limit = 20): Promise<{ delivered: number; deferred: number }> {
    const records = await this.#outbox.claim(limit);
    let delivered = 0;
    let deferred = 0;
    for (const record of records) {
      let compact: string;
      try {
        compact = await this.#sign(record);
      } catch {
        const delay = Math.min(3600, 2 ** Math.min(record.attempts, 11));
        await this.#outbox.reschedule(record.id, 'signing.failed', delay);
        deferred += 1;
        continue;
      }
      try {
        await this.#delivery.send(record.resource, compact);
        await this.#outbox.markDelivered(record.id);
        delivered += 1;
      } catch (error) {
        const delay = Math.min(3600, 2 ** Math.min(record.attempts, 11));
        await this.#outbox.reschedule(record.id, revocationErrorCode(error), delay);
        deferred += 1;
      }
    }
    return { delivered, deferred };
  }

  async #sign(record: RevocationOutboxRecord): Promise<string> {
    return this.#signer.sign({
      issuer: this.#issuer,
      resource: record.resource,
      tenantId: record.tenantId,
      siteId: record.siteId,
      sequence: record.sequence,
      eventType: record.eventType,
      ...(record.grantId === undefined ? {} : { grantId: record.grantId }),
      ...(record.keyId === undefined ? {} : { keyId: record.keyId }),
      reason: record.reason
    }, this.#now());
  }
}
