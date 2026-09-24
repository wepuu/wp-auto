import { createHmac, randomBytes } from 'node:crypto';
import {
  AccountLoginService,
  IdentitySubjectHasher,
  OidcTransactionCodec,
  OpenIdClientRelyingParty,
  loadAccountOidcConfig
} from '@wepuu/account-identity';
import type { McpScope, TenantContext } from '@wepuu/contracts';
import {
  Database,
  PostgresAccountSessionStore,
  PostgresGrantRepository,
  PostgresPairingRepository,
  PostgresSecurityAuditSink,
  SiteRepository
} from '@wepuu/database';
import {
  AwsKmsKeyCustody,
  createAwsKmsConsentRequestSigner,
  keyCustodyConfigFromEnvironment
} from '@wepuu/key-custody';
import { GrantService, HttpsSiteVerificationClient, PairingService } from '@wepuu/pairing';
import {
  buildControlApi,
  PostgresControlStore,
  SessionAccountIdentityProvider
} from './server.js';

const databaseUrl = process.env['WEPUU_DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error('WEPUU_DATABASE_URL is required');

const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-control-api' });
const accountOidcConfig = loadAccountOidcConfig(process.env);
const accountSessionStore = new PostgresAccountSessionStore(database);
const accountLogin = new AccountLoginService({
  provider: await OpenIdClientRelyingParty.create(accountOidcConfig),
  codec: new OidcTransactionCodec({
    keys: accountOidcConfig.transactionKeys,
    issuer: accountOidcConfig.publicOrigin.href,
    audience: accountOidcConfig.redirectUri.href,
    ttlSeconds: accountOidcConfig.transactionTtlSeconds
  }),
  hasher: new IdentitySubjectHasher(accountOidcConfig.identitySubjectHmacKey),
  sessions: accountSessionStore,
  sessionTtlSeconds: accountOidcConfig.sessionTtlSeconds
});
const platformIssuer = process.env['WEPUU_ISSUER'];
if (platformIssuer !== undefined && !platformIssuer.startsWith('https://')) throw new Error('WEPUU_ISSUER must use HTTPS');
const pairingVerifier = new HttpsSiteVerificationClient();
const custodyConfig = platformIssuer === undefined ? undefined : keyCustodyConfigFromEnvironment(process.env);
const custody = custodyConfig === undefined ? undefined : new AwsKmsKeyCustody(custodyConfig);
const signingKey = custody === undefined ? undefined : await custody.describeSigningKey();
const consentSigner = custodyConfig === undefined ? undefined : createAwsKmsConsentRequestSigner(custodyConfig);
const grantIdempotencyKey = platformIssuer === undefined ? undefined
  : decodeRuntimeKey(process.env['WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY'], 'WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY');
const platformSigningKeyPem = signingKey?.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const pairing = platformIssuer === undefined || platformSigningKeyPem === undefined || signingKey === undefined || consentSigner === undefined ? undefined : {
  async pair(context: TenantContext, input: { readonly resource: string; readonly verifier: string }) {
    const service = new PairingService({
      repository: new PostgresPairingRepository(database, context),
      verifier: pairingVerifier,
      platformIssuer,
      platformSigningKeyPem,
      platformSigningKid: signingKey.kid
    });
    const attemptId = `attempt_${randomIdentifier()}`;
    const siteId = `site_${randomIdentifier()}`;
    await service.begin({
      tenantId: context.tenantId,
      attemptId,
      accountId: context.accountId,
      correlationId: context.correlationId,
      resource: input.resource,
      verifier: input.verifier
    });
    await service.verify({
      tenantId: context.tenantId,
      attemptId,
      verifier: input.verifier,
      siteId,
      idempotencyKey: `pair_${randomIdentifier()}`
    });
    return { siteId };
  }
};
const grants = platformIssuer === undefined || consentSigner === undefined || grantIdempotencyKey === undefined ? undefined : {
  async start(context: TenantContext, input: {
    readonly siteId: string;
    readonly clientId: string;
    readonly scopes: readonly McpScope[];
    readonly idempotencyKey: string;
  }) {
    const site = await database.withTenant(context, (client) =>
      new SiteRepository().findActive(client, context.tenantId, input.siteId));
    if (site === undefined) throw new Error('active_site_not_found');
    const service = new GrantService({
      repository: new PostgresGrantRepository(database, context),
      signer: consentSigner,
      platformIssuer,
      challengeFactory: (request) => createHmac('sha256', grantIdempotencyKey)
        .update(JSON.stringify(request), 'utf8').digest('base64url')
    });
    const grantId = `grant_${randomIdentifier()}`;
    const started = await service.begin({
      tenantId: context.tenantId,
      grantId,
      siteId: site.id,
      subjectId: context.accountId,
      clientId: input.clientId,
      scopes: input.scopes,
      resource: site.resource,
      consentVersion: '1',
      idempotencyKey: input.idempotencyKey
    });
    const consentUrl = new URL('/wp-admin/admin-post.php?action=wp_auto_connector_consent_start', new URL(site.resource).origin);
    consentUrl.hash = new URLSearchParams({ request: started.request }).toString();
    return { grantId: started.grantId, consentUrl: consentUrl.href, expiresAt: started.expiresAt };
  },
  async complete(context: TenantContext, input: {
    readonly grantId: string;
    readonly proof: string;
    readonly challenge: string;
    readonly decision: 'approved' | 'denied';
    readonly idempotencyKey: string;
  }) {
    const service = new GrantService({
      repository: new PostgresGrantRepository(database, context),
      signer: consentSigner,
      platformIssuer
    });
    await service.complete({ tenantId: context.tenantId, ...input });
  }
};
const app = buildControlApi({
  identityProvider: new SessionAccountIdentityProvider(accountSessionStore),
  store: new PostgresControlStore(database),
  audit: new PostgresSecurityAuditSink(database),
  readiness: () => database.checkReady(),
  accountLogin,
  publicOrigin: accountOidcConfig.publicOrigin.origin,
  ...(pairing === undefined ? {} : { pairing }),
  ...(grants === undefined ? {} : { grants })
});

function randomIdentifier(): string {
  return randomBytes(18).toString('base64url');
}

function decodeRuntimeKey(value: string | undefined, name: string): Buffer {
  if (value === undefined) throw new Error(`${name} is required when WEPUU_ISSUER is configured`);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength !== 32 || decoded.toString('base64url') !== value) throw new Error(`${name} must be canonical 256-bit base64url`);
  return decoded;
}

const port = Number(process.env['WEPUU_CONTROL_PORT'] ?? '3000');
const host = process.env['WEPUU_CONTROL_HOST'] ?? '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  await database.close();
  throw error;
}

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
