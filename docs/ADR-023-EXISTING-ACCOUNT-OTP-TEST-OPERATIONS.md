# ADR-023: Continuous OTP login for existing internal-test accounts

- Status: operator-approved for implementation and bounded deployment
- Date: 2026-10-21

## Decision

The operator requested usable OTP login throughout internal testing instead of
per-message manual enable/disable approvals. After being informed that the old
plugin allows automatic registration, the operator explicitly confirmed:
existing-account login only, no new registration, existing limits and validation
retained. This authorizes one minimal Control update and send/resend ingress
change, not OAuth/MCP, a Session lifetime change or new account provisioning.

Use Better Auth 1.7.7 Email OTP `disableSignUp: true` in runtime and schema
configuration. There is no environment switch to reopen registration. The plugin
still owns OTP generation/verification and Session issuance. Unknown recipients
receive no email, create no user, consume no send reservation and leave no
unclaimed `reserved` row. Their public success presentation is neutral; a separate
internal `suppressed` result is not a Provider attempt or acceptance. The adapter
checks recipient existence before reserving a budget; storage uncertainty fails
closed. Existing IP rate limiting applies to unknown recipients as well.

Persist `WEPUU_EMAIL_OTP_SEND_ENABLED=true` and permit the server-rendered send and
resend routes, retaining raw `/api/auth/` denial. Do not arm a per-message close
task. Keep the emergency send-off switch, HMAC, quotas (3/recipient/hour,
6/recipient/day, 100/global/day), CSRF/Origin/login transaction, five-minute hashed
OTP, five attempts, resend rotation, Provider idempotency and 12-hour absolute
Session. This does not guarantee identical account-existence timing.

## Compatibility and data flow

No DDL/migration, dependency, OAuth protocol, Connector, Site/Grant, signing or
revocation changes. Tests previously onboarding via OTP now explicitly seed
synthetic users. Existing users, linked platform Accounts/Home Tenants and
Sessions are preserved. Before deployment, authentication-only orphan users must
be reported rather than implicitly provisioning new test accounts. The unchanged
completion path remains for valid linked users; this is not an invitation flow.

Rejected and indeterminate Provider outcomes keep their existing handling. A
missing delivery callback is not silently accepted; only explicit suppression
gets the neutral presentation. No WordPress/MCP content enters this feature.

## Rollout, rollback and acceptance

Use the exact current production Control source as the isolated patch base;
exclude dirty main/working-tree changes. Verify fixed dependencies, positive and
negative mock tests, backup and production health/protection baselines. Deploy
only Control by digest using the existing direct command. Do not execute
migrations or restart Authorization, databases or WordPress.

The operator subsequently approved the verified CI archive delivery without
registry publication or additional CI publishing rights. Preserve the archive
hash and its OCI manifest-to-config hash binding. On the observed Docker 29
containerd store, pin the loaded manifest ID, not the older store's config ID;
verify both against the original archive, exact config/RootFS and full candidate
file inventory. This does not authorize a mutable tag or a new build.

Close send/resend and persist sending=false **before** rolling back to the old
signup-enabled image. Restore only owned configuration after drift checks; do not
restore the database or remove Sessions, audit or quota history. Never retain
open sending with the old registration-enabled runtime.

Acceptance: existing user mock login; unknown recipient sends/verification cannot
create users; no unknown-recipient Provider calls/reservations; original quota,
IP limiter, CSRF/Origin and storage-error rejection; unchanged Session lifetime;
production health/identity protection. Real inbox receipt needs operator evidence,
not a mock claim. Full/controlled/public readiness remains false.

Reference: [Better Auth Email OTP](https://better-auth.com/docs/plugins/email-otp).
