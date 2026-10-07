export class ContentFreeMetrics {
  readonly #statusCounts = new Map<string, number>();
  #requestCount = 0;
  #durationMilliseconds = 0;

  record(statusCode: number, durationMilliseconds: number): void {
    const statusClass = `${String(Math.floor(statusCode / 100))}xx`;
    this.#requestCount += 1;
    this.#durationMilliseconds += Math.max(0, durationMilliseconds);
    this.#statusCounts.set(statusClass, (this.#statusCounts.get(statusClass) ?? 0) + 1);
  }

  render(): string {
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
    return `${lines.join('\n')}\n`;
  }
}
