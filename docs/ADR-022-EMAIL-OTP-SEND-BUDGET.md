# ADR-022: Shared rolling Email OTP send protection

- Status: P3-D local candidate; not deployed
- Date: 2026-10-15

## Decision and compatibility

Preserve Better Auth 1.7.7's official Email OTP handler, its IP/route database
limits, five-minute hashed OTP, five verification attempts, rotate-on-resend,
CSRF and Session rules. An official before middleware reserves send quota
after the built-in IP limiter and before the plugin creates/replaces an OTP.
Rejected resend attempts therefore leave the previous OTP usable. Verification
does not consume send quota, and disabling new sends does not disable login
with an already valid code or Session.

Normalize recipients with normalizeAccountEmail and HMAC-SHA-256 using a
dedicated 32-byte key and a versioned purpose prefix. Never use an email or its
HMAC as a log/metric label. All Control replicas must share the same key. It is
independent of Session/keyring rotation. Ordinary rollout must not change it;
a future key rotation requires its own overlap/drain plan covering the full
24-hour window. Authorization's reader role receives neither this key nor
permission to the quota table.

Defaults are 3 reservations per recipient per rolling hour, 6 per rolling
24 hours, and 100 globally per rolling 24 hours. Bounds are respectively 1–20,
1–100, and 1–10000; recipient daily must be at least hourly. The global limit
can be tighter than a recipient limit. These are send-attempt bounds, not a
currency-denominated billing guarantee. A distributed attacker can exhaust a
global safety budget; depletion is an observable fail-closed state.

## Storage and failures

Migration 015 adds auth.otp_send_reservations independently of console migration
014. Do not change migrations 001–014. Better Auth's rateLimit table is unsafe
for this purpose: the pinned database limiter opportunistically deletes rows
older than its longest configured window, including rows outside its key
namespace. Its count/lastRequest semantics are also not an exact rolling log.

A short PostgreSQL transaction takes one global transaction advisory lock,
reads the database clock after acquiring it, checks all three windows, and
inserts one reservation atomically. At the bounded initial volume this avoids
multiple-lock ordering and unbounded recipient lock state. Each denied request
returns the longest time needed to satisfy all violated limits. Entries exactly
outside a rolling window are no longer counted. Only this table's entries over
48 hours old are pruned. No provider request occurs within that transaction.

Before contacting Resend, atomically claim a fresh reservation once. The UUID
is the Provider idempotency key. Accepted, rejected, unknown and unresolved
reservations all retain their budget charge. Lock/query/commit/claim uncertainty
prevents that send. No automatic resend, refund or retry is performed. If the
Provider result is known but its outcome update fails, keep that result and
record a fixed storage-failure metric; do not send again. A process crash can
overcount its reservation but cannot refund an uncertain send.

The protected key file is required for runtime writers, including mock-mode
runtime writers; direct mock/schema test constructors can explicitly omit the
guard. A real Resend sender cannot be constructed into AccountAuth without a
quota. Production startup checks storage and writer permissions. Readers do
not need migration 015 or send secrets to continue serving identity lookups.

## Diagnostics and data flow

Browser -> Control -> Better Auth/PostgreSQL -> Resend remains the only OTP
data flow. No WordPress content or MCP input/output enters it. Quota persistence
contains only random IDs, HMAC recipients, timestamps and fixed outcomes.
Built-in auth diagnostics are disabled in favor of content-free observations.
The pinned Resend SDK suppresses raw API error logging in production; SDK
negative tests run in an isolated production-mode child with unconditional
mock fetch. Normal tests never call Resend.

accepted means API acceptance, not delivery; 4xx explicit rejection is rejected;
5xx, transport failure, timeout or an invalid acceptance response is unknown.
The existing five-second signal remains. Metrics are process counters, while
budget remaining is queried from PostgreSQL. Use sum of counter rates across
replicas and min/max (never sum) of the shared budget gauge. Failed budget
queries return an unavailable metrics response instead of a fabricated zero.

## Rollout and rollback

This candidate is not permission to deploy or open registration. Future release
uses the actual production Control baseline with only P3-D1 backported.
Authorization, Connector, P4-A and migration 014 remain unchanged. Back up the
database/configuration/key, apply only the checksum-verified additive 015 via
a separately reviewed migration directory/entrypoint, and verify 001–013
checksums plus 014 absence. Expected migration set becomes 001–013 plus 015.
Start only the Control runtime; do not execute main's default full migrate.

Code rollback leaves 015 and its reservations intact; do not reset counters,
drop tables or change migration history. Public release stays closed while a
rollback has removed the new protection. A protected send-enabled switch can
pause new emails while OTP verification and existing Sessions continue.
