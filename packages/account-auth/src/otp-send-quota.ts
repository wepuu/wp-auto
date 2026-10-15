import { createHmac, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type OtpDeliveryOutcome = 'accepted' | 'rejected' | 'unknown';
export type OtpQuotaDimension = 'recipient_hour' | 'recipient_day' | 'global_day';
export type OtpSendEvent =
  | { readonly kind: 'attempt' | OtpDeliveryOutcome }
  | { readonly kind: 'limited'; readonly dimension: OtpQuotaDimension | 'ip' }
  | { readonly kind: 'storage_failed' };
export interface OtpSendLimits {
  readonly recipientHourlyMax: number;
  readonly recipientDailyMax: number;
  readonly globalDailyMax: number;
}
export const DEFAULT_OTP_SEND_LIMITS: OtpSendLimits = {
  recipientHourlyMax: 3, recipientDailyMax: 6, globalDailyMax: 100
};
export type OtpQuotaReservation = { readonly allowed: true; readonly id: string }
  | { readonly allowed: false; readonly dimension: OtpQuotaDimension; readonly retryAfterSeconds: number };
export interface OtpSendQuota {
  reserve(normalizedEmail: string): Promise<OtpQuotaReservation>;
  claim(id: string): Promise<boolean>;
  finish(id: string, outcome: OtpDeliveryOutcome): Promise<void>;
  remaining(): Promise<number>;
}

export function validateOtpSendLimits(limits: OtpSendLimits): OtpSendLimits {
  for (const [value, max] of [[limits.recipientHourlyMax, 20], [limits.recipientDailyMax, 100],
    [limits.globalDailyMax, 10_000]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error('otp_send_limits_invalid');
  }
  if (limits.recipientDailyMax < limits.recipientHourlyMax) throw new Error('otp_send_limits_invalid');
  return { ...limits };
}

// At this volume a single database lock makes all dimensions atomic and avoids
// per-recipient lock/key cardinality. Never hold it across the Provider call.
export class PostgresOtpSendQuota implements OtpSendQuota {
  readonly #limits: OtpSendLimits;
  readonly #key: Buffer;
  constructor(readonly pool: Pool, key: Uint8Array, limits = DEFAULT_OTP_SEND_LIMITS) {
    if (key.byteLength !== 32) throw new Error('otp_send_key_invalid');
    this.#key = Buffer.from(key);
    this.#limits = validateOtpSendLimits(limits);
  }

  async reserve(normalizedEmail: string): Promise<OtpQuotaReservation> {
    const recipient = createHmac('sha256', this.#key).update('wepuu:otp-send:v1\0').update(normalizedEmail).digest();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [20261015, 301]);
      const clock = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const now = clock.rows[0]?.now;
      if (now === undefined) throw new Error('otp_send_clock_unavailable');
      await client.query("DELETE FROM auth.otp_send_reservations WHERE reserved_at <= $1::timestamptz - interval '48 hours'", [now]);
      const rows = await client.query<{ reserved_at: Date; recipient: boolean }>(
        `SELECT reserved_at, recipient_hmac = $1 AS recipient FROM auth.otp_send_reservations
         WHERE reserved_at > $2::timestamptz - interval '24 hours' ORDER BY reserved_at`, [recipient, now]);
      const day = rows.rows.filter((row) => row.recipient);
      const hour = day.filter((row) => row.reserved_at.getTime() > now.getTime() - 3_600_000);
      let denied: Extract<OtpQuotaReservation, { allowed: false }> | undefined;
      const rules = [
        ['recipient_hour', hour, this.#limits.recipientHourlyMax, 3_600_000],
        ['recipient_day', day, this.#limits.recipientDailyMax, 86_400_000],
        ['global_day', rows.rows, this.#limits.globalDailyMax, 86_400_000]
      ] as const;
      for (const [dimension, events, max, window] of rules) {
        if (events.length < max) continue;
        const release = events[events.length - max];
        if (release === undefined) throw new Error('otp_send_window_invalid');
        const retryAfterSeconds = Math.max(1, Math.ceil((release.reserved_at.getTime() + window - now.getTime()) / 1_000));
        if (denied === undefined || retryAfterSeconds > denied.retryAfterSeconds) {
          denied = { allowed: false, dimension, retryAfterSeconds };
        }
      }
      if (denied !== undefined) {
        await client.query('COMMIT');
        return denied;
      }
      const id = randomUUID();
      await client.query('INSERT INTO auth.otp_send_reservations (id, recipient_hmac, reserved_at) VALUES ($1,$2,$3)', [id, recipient, now]);
      await client.query('COMMIT');
      return { allowed: true, id };
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error('otp_send_storage_unavailable');
    } finally { client.release(); }
  }

  async claim(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth.otp_send_reservations SET attempted_at = GREATEST(clock_timestamp(), reserved_at)
       WHERE id=$1 AND attempted_at IS NULL AND outcome='reserved'
       AND reserved_at > clock_timestamp() - interval '1 minute' RETURNING id`, [id]);
    return result.rowCount === 1;
  }

  async finish(id: string, outcome: OtpDeliveryOutcome): Promise<void> {
    const result = await this.pool.query(
      `UPDATE auth.otp_send_reservations SET outcome=$2
       WHERE id=$1 AND attempted_at IS NOT NULL AND outcome='reserved' RETURNING id`, [id, outcome]);
    if (result.rowCount !== 1) throw new Error('otp_send_outcome_not_saved');
  }

  async remaining(): Promise<number> {
    const result = await this.pool.query<{ count: string; writable: boolean }>(
      `SELECT count(*)::text AS count,
       (has_table_privilege(current_user, 'auth.otp_send_reservations', 'SELECT')
        AND has_table_privilege(current_user, 'auth.otp_send_reservations', 'INSERT')
        AND has_table_privilege(current_user, 'auth.otp_send_reservations', 'UPDATE')
        AND has_table_privilege(current_user, 'auth.otp_send_reservations', 'DELETE')) AS writable
       FROM auth.otp_send_reservations WHERE reserved_at > clock_timestamp() - interval '24 hours'`);
    const row = result.rows[0];
    if (row?.writable !== true) throw new Error('otp_send_storage_unavailable');
    return Math.max(0, this.#limits.globalDailyMax - Number(row.count));
  }
}
