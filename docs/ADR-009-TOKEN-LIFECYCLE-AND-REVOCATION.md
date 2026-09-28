# ADR-009: Token Lifecycle and Revocation

- Status: accepted for implementation
- Date: 2026-09-24
- Scope: Phase 2.0.4 only

## Decision

The authorization service issues five-minute RS256 JWT access tokens through
managed asymmetric key custody. Tokens use `typ=at+jwt`, a published `kid`, the
exact issuer, a single-string exact MCP resource audience, and the bounded
claims `sub`, `tenant_id`, `site_id`, `grant_id`, `client_id`, `scope`, `iat`,
`nbf`, `exp`, and `jti`.

Authorization codes and refresh tokens are 256-bit opaque secrets. PostgreSQL
stores only versioned HMAC-SHA-256 lookup artifacts and content-free lifecycle
metadata. A refresh token is consumed with one atomic compare-and-swap. The
winner receives a rotated token; any later use is replay, revokes the entire
family and grant, and enqueues a connector revocation event. There is no grace
window. Refresh inactivity is 30 days and absolute family life is 90 days.

Signing keys move monotonically through `published`, `active`, `retiring`, and
`revoked`. Only the single active key signs. Published and retiring public keys
remain in JWKS for the required overlap; private key material never enters the
application, database, logs, fixtures, or Git. KMS or lifecycle ambiguity
denies issuance.

Grant, site, account, refresh-replay, and emergency-key revocations use a
transactional outbox. The worker sends a compact RS256 JWS with
`typ=wepuu-revocation+jwt` to the connector's fixed paired endpoint. Its exact
resource is the single-string audience. Events carry only tenant/site/grant,
optional access-token `jti`/`kid`, reason, monotonic site sequence, and bounded
times. They never carry MCP bodies, WordPress content, credentials, or tokens.

The connector validates the signed event and current connection binding before
persisting a bounded local deny marker. Duplicate sequences are idempotent;
older or cross-site events fail closed. JWKS uses five-minute fresh caching and
at most twenty minutes of safe stale overlap. An unknown `kid` triggers one
bounded refresh and then denial. Phase 2.0.4 does not wire JWT authentication
into the MCP request path; that remains Phase 2.0.5.

## Failure and recovery

- Authorization and token endpoints use bounded database-backed rate limits.
- If rate-limit, database, grant-binding, key-custody, or refresh-family state
  is unavailable or ambiguous, no token is issued.
- Outbox delivery is at-least-once with bounded retry and idempotent connector
  application. Revocation state is durable before delivery is attempted.
- Emergency key revocation removes the key from usable verification state and
  denies matching tokens; recovery activates a pre-published replacement, not
  an application-held private key.

## Compatibility and migration

Migration `005_token_lifecycle.sql` adds new versioned lifecycle storage. It
does not reinterpret legacy plaintext provider artifacts as safe refresh
families. Existing development artifacts must expire or be removed before the
new service is accepted. The connector adds separate non-autoloaded JWKS and
deny-state families; uninstall removes them. Application Password access and
the frozen 23-tool catalog are unchanged.

## Rejected alternatives

- Raw authorization-code or refresh-token persistence.
- Refresh rotation implemented as separate read and write operations.
- Audience arrays, provider-specific audience aliases, symmetric signing, or
  exporting an AWS KMS private key.
- Best-effort unsigned webhooks, dynamic callback URLs, unbounded retries, or
  sending revocation through MCP.
- Treating a fixture key pair as evidence for the real KMS rotation gate.
