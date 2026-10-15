# P3-D: Email delivery observation

This is a future deployment runbook. No Resend account access, real email send,
webhook configuration or production change was performed to create it.

## Configuration

Control requires WEPUU_EMAIL_OTP_LIMIT_HMAC_KEY_FILE containing exactly a
canonical base64url-encoded 32-byte key, readable only under the existing
service-UID protected-file rules. Mount it read-only. Share it across Control
instances and back it up separately from evidence/Git. Authorization never
receives it. WEPUU_EMAIL_OTP_SEND_ENABLED is true/false, default true.

| Variable | Default | Bounds |
|---|---:|---:|
| WEPUU_EMAIL_OTP_RECIPIENT_HOURLY_MAX | 3 | 1–20 |
| WEPUU_EMAIL_OTP_RECIPIENT_DAILY_MAX | 6 | 1–100; >= hourly |
| WEPUU_EMAIL_OTP_GLOBAL_DAILY_MAX | 100 | 1–10000 |

Existing IP/route send and verify limits remain. Quotas apply equally to new
and existing accounts. There is no invite, email allowlist or user-count cap.

## Process/API observation

Use the existing operations-token-protected /internal/metrics endpoint. Do not
put that token in a URL, Git, screenshots or command history. Observe
wepuu_otp_send_{attempt,accepted,rejected,unknown}_total,
wepuu_otp_rate_limited_total (fixed dimension enum),
wepuu_otp_storage_failed_total and wepuu_otp_budget_remaining.
Counters reset on process restart: use rates/increases with reset handling.
The shared remaining gauge is authoritative from the DB; do not sum replicas.
A scrape failure is unavailable evidence, never a zero remaining budget.

Use the existing metrics viewer/scraper, or manually compare protected snapshots
during the first observation. The repository does not install a new alerting
service. If the existing monitoring cannot route notifications, label these
as operator check thresholds until that wiring has been confirmed.

- Remaining <=20%: inspect volume and quota denials; remaining 0: urgent check.
- At least 3 rejected attempts in 15 minutes: inspect Provider/domain status.
- Any unknown result or storage failure: investigate; never automatically resend.
- accepted means Resend API acceptance only, not inbox delivery or absence of spam.

## Real delivery, bounce and complaint checks

The first release uses an authorized operator's Resend Dashboard, selecting the
correct sender/project and UTC observation interval. Review Emails/events and
the corresponding bounce/complaint event summaries. Do not retrieve/export email
bodies, recipient lists, OTP messages, API keys or raw event payloads into the
repository or operational logs. Record UTC time, sample size, event counts and
action taken only. Read the event timeline when a last-event summary would
otherwise conceal an earlier bounce or complaint.

During the first two hours of public observation check every 15 minutes; then
at least daily while traffic remains small. Any observed complaint requires
pausing new sends and investigation. Pause and investigate when 24-hour bounces
reach 3, or the bounce rate reaches 5% with at least 20 attempts in the observed
sample. Do not infer absence of complaints from API accepted counts.

Pausing uses WEPUU_EMAIL_OTP_SEND_ENABLED=false through the authorized Control
configuration/restart workflow. It does not revoke Grants/Sessions or disable
verification of existing OTPs. Production changes remain separately authorized.

Resend supports signed email.bounced and email.complained webhooks, but this
candidate adds no endpoint or event receiver. Dashboard review is not realtime
notification; its latency and missed-check windows must be recorded honestly.
Sources: [event types](https://resend.com/docs/dashboard/webhooks/event-types),
[idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
