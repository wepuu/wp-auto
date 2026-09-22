import { z } from 'zod';
import { OpaqueIdSchema } from '@wepuu/contracts';

export const SecurityEventNameSchema = z.enum([
  'account.authentication_denied',
  'tenant.access_denied',
  'oauth.authorization_denied',
  'oauth.code_replay_detected',
  'oauth.refresh_replay_detected',
  'oauth.token_issued',
  'key.signing_failed',
  'key.rotation_observed'
]);

export const SecurityOutcomeSchema = z.enum(['success', 'denied', 'error']);
export const SecurityReasonSchema = z.enum([
  'none',
  'identity_missing',
  'membership_missing',
  'tenant_context_missing',
  'binding_mismatch',
  'replay',
  'kms_unavailable',
  'invalid_input',
  'unsafe_event_rejected'
]);

export const SecurityAuditEventSchema = z.object({
  occurredAt: z.iso.datetime(),
  eventName: SecurityEventNameSchema,
  outcome: SecurityOutcomeSchema,
  reason: SecurityReasonSchema,
  correlationId: OpaqueIdSchema,
  tenantId: z.uuid().optional(),
  siteId: OpaqueIdSchema.optional(),
  clientId: OpaqueIdSchema.optional(),
  grantId: OpaqueIdSchema.optional(),
  actorId: OpaqueIdSchema.optional(),
  service: z.enum(['authorization-service', 'control-api']),
  serviceVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  durationBucket: z.enum(['lt10ms', 'lt100ms', 'lt1s', 'gte1s']).optional()
}).strict();

export type SecurityAuditEvent = z.infer<typeof SecurityAuditEventSchema>;

export interface SecurityAuditSink {
  write(event: SecurityAuditEvent): Promise<void>;
}

export function validateSecurityEvent(input: unknown): SecurityAuditEvent {
  return SecurityAuditEventSchema.parse(input);
}

export class JsonLineAuditSink implements SecurityAuditSink {
  readonly #writeLine: (line: string) => void;

  constructor(writeLine: (line: string) => void) {
    this.#writeLine = writeLine;
  }

  write(event: SecurityAuditEvent): Promise<void> {
    const safe = validateSecurityEvent(event);
    this.#writeLine(JSON.stringify(safe));
    return Promise.resolve();
  }
}
