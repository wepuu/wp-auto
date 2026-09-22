import { z } from 'zod';

const opaqueIdPattern = /^[A-Za-z0-9_-]{8,128}$/u;

export const OpaqueIdSchema = z.string().regex(opaqueIdPattern);
export type OpaqueId = z.infer<typeof OpaqueIdSchema>;

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
