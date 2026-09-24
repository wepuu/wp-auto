# Phase 2.0.3 Pairing and Grants Test Plan

## Scope

Phase 2.0.3A validates the platform schema, pairing proof, SSRF boundary,
server-side account session, grant orchestration, and authorization-service
resolvers. Phase 2.0.3B validates the separately approved real WordPress
connector implementation. Phase 2.0.3 cannot close after fixture-only testing.

## Required cases

| Area | Required evidence |
|---|---|
| Canonical resource | reject HTTP, credentials, query, fragment, non-443 port, trailing-slash variant |
| SSRF | reject loopback, private, link-local, reserved, documentation, metadata, mapped IPv6, mixed safe/unsafe DNS |
| Network | pin validated IP, preserve TLS hostname, fixed path, no redirect, 5-second timeout, 16-KiB bound |
| Pairing proof | EdDSA and exact `typ`; issuer, tenant, attempt, resource, challenge and 60-second lifetime bindings |
| Pairing state | verifier stored only as SHA-256; one winner; replay, expiry and failure are terminal |
| Grant request | KMS RS256, exact `typ`/`kid`, single-string audience, 120-second maximum lifetime, exact canonical scope order |
| Grant proof | bind site, opaque subject/grant, client, exact scope set, challenge, decision and resource audience |
| Consent browser | fragment-only handoff, history cleanup, local login continuation, nonce-protected approve/deny, local-user binding, single-use replay denial |
| Database | migration replay; forced RLS; owner/admin pairing; member and cross-tenant denial |
| Lifecycle | revoke, disconnect, re-pair, resource change and user invalidation fail closed |
| External identity | fixed HTTPS issuer, discovery profile, Authorization Code + PKCE S256, exact callback, state, nonce, RS256 ID token and provider outage fail closed |
| OIDC transaction | five-minute JWE cookie; tamper/expiry/old-key overlap; only local return path; no authorization response reflection |
| Identity | issuer-bound subject HMAC, raw subject absent, only hashed server-side sessions; malformed/expired/revoked cookie denied |
| Session | 256-bit opaque value, SHA-256 at rest, 12-hour absolute lifetime, secure host cookie, exact-origin logout, suspended account denied |
| Data boundary | tokens, cookies, proofs, WordPress identity and MCP bodies absent from audit records |
| Interop | PHP 8.1 libsodium proof verifies in TypeScript JOSE |
| Regression | strict build/lint/test, Phase 2.0.1 conformance, audit, SBOM and dependency audit |

## Exit rule

All platform cases and a real WordPress 2.0.3B path must pass. Connector work
requires separate approval. No production deployment, Phase 2.0.4 token work,
or Phase 2.0.5 Bearer integration is authorized by this test plan.

## Observed acceptance on 2026-09-24

- Real wp-admin pairing completed through the fragment-only handoff and the
  SSRF-safe, DNS-pinned proof request.
- Real consent approval, denial, second-use rejection, process-restart session
  recovery, exact-origin logout and subsequent `401` session resolution passed.
- The authenticated consent page was verified with private/no-store cache
  control and `Referrer-Policy: no-referrer`; the late hook priority is covered
  by the connector regression suite.
- Plugin disable/re-enable removed and restored the proof route while preserving
  the current pairing digest. Deleting the bound local user invalidated its grant,
  and uninstall/reinstall removed all private pairing/grant state without reviving
  trust. Resource/domain-change re-pair remains an exit gate.
- The complete provider-free suite passed in the pinned Linux Node 26.7.0 image:
  31 passed and four explicit database/live-KMS/PHP gates skipped. Hosted live
  KMS CI and final hosted CI remain required.
