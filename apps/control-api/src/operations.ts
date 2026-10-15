import type { OtpSendEvent } from '@wepuu/account-auth';

export class ContentFreeMetrics {
  readonly #statusCounts = new Map<string, number>();
  #requestCount = 0;
  #durationMilliseconds = 0;
  readonly #otpCounts = new Map<string, number>();

  recordOtp(event: OtpSendEvent): void {
    const key = event.kind === 'limited' ? `limited:${event.dimension}` : event.kind;
    this.#otpCounts.set(key, (this.#otpCounts.get(key) ?? 0) + 1);
  }

  record(statusCode: number, durationMilliseconds: number): void {
    const statusClass = `${String(Math.floor(statusCode / 100))}xx`;
    this.#requestCount += 1;
    this.#durationMilliseconds += Math.max(0, durationMilliseconds);
    this.#statusCounts.set(statusClass, (this.#statusCounts.get(statusClass) ?? 0) + 1);
  }

  render(otpBudgetRemaining?: number): string {
    const lines = [
      '# HELP wepuu_control_requests_total Total control-plane HTTP responses.',
      '# TYPE wepuu_control_requests_total counter',
      `wepuu_control_requests_total ${String(this.#requestCount)}`,
      '# HELP wepuu_control_request_duration_milliseconds_total Accumulated control-plane response time.',
      '# TYPE wepuu_control_request_duration_milliseconds_total counter',
      `wepuu_control_request_duration_milliseconds_total ${this.#durationMilliseconds.toFixed(3)}`
    ];
    for (const statusClass of ['2xx', '3xx', '4xx', '5xx']) {
      lines.push(`wepuu_control_responses_total{status_class="${statusClass}"} ${String(this.#statusCounts.get(statusClass) ?? 0)}`);
    }
    for (const kind of ['attempt', 'accepted', 'rejected', 'unknown']) {
      const name = `wepuu_otp_send_${kind}_total`;
      lines.push(`# TYPE ${name} counter`, `${name} ${String(this.#otpCounts.get(kind) ?? 0)}`);
    }
    lines.push('# TYPE wepuu_otp_rate_limited_total counter');
    for (const dimension of ['ip', 'recipient_hour', 'recipient_day', 'global_day']) {
      lines.push(`wepuu_otp_rate_limited_total{dimension="${dimension}"} ${String(this.#otpCounts.get(`limited:${dimension}`) ?? 0)}`);
    }
    lines.push('# TYPE wepuu_otp_storage_failed_total counter',
      `wepuu_otp_storage_failed_total ${String(this.#otpCounts.get('storage_failed') ?? 0)}`);
    if (otpBudgetRemaining !== undefined) {
      lines.push('# TYPE wepuu_otp_budget_remaining gauge', `wepuu_otp_budget_remaining ${String(otpBudgetRemaining)}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
