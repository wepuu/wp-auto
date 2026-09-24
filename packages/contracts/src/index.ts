import { z } from 'zod';

const opaqueIdPattern = /^[A-Za-z0-9_-]{8,128}$/u;

export const OpaqueIdSchema = z.string().regex(opaqueIdPattern);
export type OpaqueId = z.infer<typeof OpaqueIdSchema>;
export const OAuthClientIdSchema = z.string().min(8).max(256).regex(/^[A-Za-z0-9._~-]+$/u);
export const McpScopeSchema = z.enum([
  'mcp:read',
  'mcp:content.write',
  'mcp:media.write',
  'mcp:taxonomy.write',
  'mcp:seo.write'
]);
export type McpScope = z.infer<typeof McpScopeSchema>;
export const MCP_SCOPE_ORDER: readonly McpScope[] = McpScopeSchema.options;
export const McpScopeSetSchema = z.array(McpScopeSchema).min(1).max(MCP_SCOPE_ORDER.length)
  .refine((scopes) => new Set(scopes).size === scopes.length, 'duplicate_scope')
  .refine((scopes) => scopes.every((scope, index) => {
    const previous = scopes[index - 1];
    return index === 0 || (previous !== undefined
      && MCP_SCOPE_ORDER.indexOf(previous) < MCP_SCOPE_ORDER.indexOf(scope));
  }), 'scope_order_invalid');

export const TenantContextSchema = z.object({
  tenantId: z.uuid(),
  accountId: OpaqueIdSchema,
  correlationId: OpaqueIdSchema
}).strict();
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const AccountPrincipalSchema = z.object({
  accountId: OpaqueIdSchema,
  authenticationTime: z.number().int().nonnegative(),
  authenticationMethod: z.enum(['oidc'])
}).strict();
export type AccountPrincipal = z.infer<typeof AccountPrincipalSchema>;

export const PlatformErrorCodeSchema = z.enum([
  'invalid_request',
  'not_found',
  'conflict',
  'unauthenticated',
  'forbidden',
  'temporarily_unavailable'
]);
export type PlatformErrorCode = z.infer<typeof PlatformErrorCodeSchema>;

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly status: number;

  constructor(code: PlatformErrorCode, status: number, message = code) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
    this.status = status;
  }
}

export const TenantStatusSchema = z.enum(['active', 'suspended', 'deleted']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantViewSchema = z.object({
  id: z.uuid(),
  status: TenantStatusSchema,
  createdAt: z.iso.datetime()
}).strict();
export type TenantView = z.infer<typeof TenantViewSchema>;

export const CanonicalResourceSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '' || url.search !== '') {
    context.addIssue({ code: 'custom', message: 'resource_must_be_canonical_https' });
  }
  if (url.port !== '' && url.port !== '443') {
    context.addIssue({ code: 'custom', message: 'resource_port_not_allowed' });
  }
});
export type CanonicalResource = z.infer<typeof CanonicalResourceSchema>;

export const SiteStatusSchema = z.enum(['pending', 'active', 'suspended', 'revoked', 'deleted']);
export const PairingStatusSchema = z.enum(['pending', 'verifying', 'active', 'expired', 'cancelled', 'failed']);
export const GrantStatusSchema = z.enum(['pending', 'active', 'suspended', 'revoked']);

export const SiteViewSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: z.uuid(),
  resource: CanonicalResourceSchema,
  displayHostname: z.string().min(1).max(253),
  status: SiteStatusSchema,
  protocolVersion: z.literal('1'),
  createdAt: z.iso.datetime()
}).strict();
export type SiteView = z.infer<typeof SiteViewSchema>;

export const GrantViewSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: z.uuid(),
  siteId: OpaqueIdSchema,
  subjectId: OpaqueIdSchema,
  clientId: OAuthClientIdSchema,
  scopes: McpScopeSetSchema,
  status: GrantStatusSchema,
  consentVersion: z.string().regex(/^\d+$/u),
  createdAt: z.iso.datetime()
}).strict();
export type GrantView = z.infer<typeof GrantViewSchema>;
