import { createHmac, randomBytes } from 'node:crypto';
import { accountAuthFromEnvironment } from '@wepuu/account-auth';
import type { McpScope, TenantContext } from '@wepuu/contracts';
import {
  Database,
  PostgresAccountAuthLinkStore,
  PostgresAccountWorkspaceStore,
  PostgresGrantRepository,
  PostgresPairingRepository,
  PostgresSecurityAuditSink,
  PostgresSigningKeyRepository,
  SiteRepository
} from '@wepuu/database';
import {
  localPkcs8KeyCustodyFromEnvironment
} from '@wepuu/key-custody';
import { GrantService, HttpsSiteVerificationClient, PairingService } from '@wepuu/pairing';
import { evaluateDeploymentReadiness, loadPublicDeploymentConfig } from '@wepuu/platform-ui';
import {
  buildControlApi,
  BetterAuthAccountIdentityProvider,
  PostgresControlStore
} from './server.js';

const databaseUrl = process.env['WEPUU_DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error('WEPUU_DATABASE_URL is required');

const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-control-api' });
const publicOrigin = process.env['WEPUU_CONTROL_PUBLIC_ORIGIN'];
if (publicOrigin === undefined) throw new Error('WEPUU_CONTROL_PUBLIC_ORIGIN is required');
const deployment = loadPublicDeploymentConfig(process.env, publicOrigin);
const accountAuth = await accountAuthFromEnvironment(process.env, {
  applicationName: 'wepuu-control-account-auth',
  databaseRole: 'wepuu_account_auth_writer',
  includeTemporaryAuth0: true
});
const accountAuthLinks = new PostgresAccountAuthLinkStore(database);
const platformIssuer = process.env['WEPUU_ISSUER'];
if (platformIssuer !== undefined && !platformIssuer.startsWith('https://')) throw new Error('WEPUU_ISSUER must use HTTPS');
const pairingVerifier = new HttpsSiteVerificationClient();
const signingSlot = process.env['WEPUU_SIGNING_KEY_SLOT'];
if (platformIssuer !== undefined && signingSlot === undefined) throw new Error('WEPUU_SIGNING_KEY_SLOT is required');
const signingLifecycle = platformIssuer === undefined ? undefined
  : await new PostgresSigningKeyRepository(database).loadUsable();
if (signingLifecycle !== undefined
    && (signingLifecycle.active.custodyProvider !== 'local-pkcs8'
      || signingLifecycle.active.custodyReference !== signingSlot)) {
  throw new Error('control_signing_key_not_active');
}
const custody = platformIssuer === undefined || signingSlot === undefined
  ? undefined : await localPkcs8KeyCustodyFromEnvironment(process.env, signingSlot, signingLifecycle?.active.kid);
const signingKey = custody === undefined ? undefined : await custody.describeSigningKey();
const consentSigner = custody?.consentRequestSigner();
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
  identityProvider: new BetterAuthAccountIdentityProvider({
    auth: accountAuth,
    links: accountAuthLinks,
    provisionMissing: true
  }),
  store: new PostgresControlStore(database),
  audit: new PostgresSecurityAuditSink(database),
  readiness: () => database.checkReady(),
  accountAuth,
  workspace: new PostgresAccountWorkspaceStore(database),
  deployment,
  deploymentReadiness: evaluateDeploymentReadiness(deployment, process.env),
  ...(process.env['WEPUU_OPERATIONS_METRICS_TOKEN'] === undefined
    ? {} : { operationsMetricsToken: process.env['WEPUU_OPERATIONS_METRICS_TOKEN'] }),
  publicOrigin: new URL(publicOrigin).origin,
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
  await accountAuth.close();
  await database.close();
  throw error;
}

async function shutdown(): Promise<void> {
  await app.close();
  await accountAuth.close();
  await database.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
