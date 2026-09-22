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
| Grant proof | bind site, opaque subject/grant, client, exact scope set, challenge and resource |
| Database | migration replay; forced RLS; owner/admin pairing; member and cross-tenant denial |
| Lifecycle | revoke, disconnect, re-pair, resource change and user invalidation fail closed |
| Identity | only hashed server-side sessions; malformed/expired/revoked cookie denied |
| Data boundary | tokens, cookies, proofs, WordPress identity and MCP bodies absent from audit records |
| Interop | PHP 8.1 libsodium proof verifies in TypeScript JOSE |
| Regression | strict build/lint/test, Phase 2.0.1 conformance, audit, SBOM and dependency audit |

## Exit rule

All platform cases and a real WordPress 2.0.3B path must pass. Connector work
requires separate approval. No production deployment, Phase 2.0.4 token work,
or Phase 2.0.5 Bearer integration is authorized by this test plan.
