# Phase 2.0.4 Token Lifecycle Test Plan

## Scope

This phase implements OAuth token issuance, refresh-family safety, managed key
rotation, signed revocation delivery, connector JWKS/deny state, and endpoint
abuse controls. It does not enable Bearer authentication for MCP tools.

## Required gates

| Area | Required evidence |
|---|---|
| Access token | RS256; `typ=at+jwt`; published `kid`; exact issuer and single-string audience; exact bounded binding claims; 300-second life and 60-second skew |
| Interaction | hashed platform session; explicit consent/CSRF; exact client/resource/scope/grant transaction binding; ambiguous grant selection denied |
| Secret storage | authorization code and refresh values never persisted or logged; versioned HMAC lookup with rotatable current/previous keys |
| Refresh | rotate every use; zero grace; one winner under concurrency; replay revokes family/grant; 30-day inactivity and 90-day absolute expiry; crash-safe transaction |
| Revocation | RFC 7009 is non-enumerating and idempotent; site/account/grant/replay/key events enter the same durable outbox transaction |
| Keys/JWKS | one active signer; pre-publish then activate; old/new overlap at least 20 minutes; unknown `kid` one bounded refresh; emergency revocation denies safely |
| Delivery | fixed paired HTTPS endpoint, SSRF-safe resolution, signed exact-audience event, monotonic sequence, bounded retry, duplicate idempotency |
| Connector | strict JWS header/claims/binding; fresh/stale JWKS policy; local grant/JTI/kid deny state; cross-tenant/site and rollback events rejected |
| Abuse | authorize 20/5m, token 30/min, refresh family 10/min, revoke 30/min, connector 60/min; source identifiers are HMAC-pseudonymous |
| Privacy | no access/refresh/code/cookie/proof/MCP body/content in PostgreSQL, WordPress options, traces, errors, or evidence |
| Regression | platform build/lint/test/database/conformance/audit/SBOM; connector Composer validation/test/lint/audit and uninstall cleanup |

## Adversarial cases

Tests must cover wrong issuer, array/wrong audience, unknown or revoked `kid`,
`alg=none`, wrong `typ`, expired/not-yet-valid token, excessive lifetime,
wrong tenant/site/grant/client/scope, code replay, simultaneous refresh, old
refresh replay, cross-family token substitution, out-of-order/duplicate event,
cross-site event, stale JWKS past overlap, rate-limit-store outage, KMS outage,
worker restart, connector outage, DNS rebinding and redirect refusal.

## Exit rule

All deterministic gates must pass in the pinned Node 26.7 and PHP 8.1 floors.
Two distinct real AWS KMS RSA keys must prove publish/activate/retire overlap
without private-key export. The temporary second key and any broadened IAM
permission must be removed after evidence capture. Phase 2.0.4 stays open while
that external gate, hosted CI, or cleanup is pending.
