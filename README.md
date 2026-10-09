# WePuu Platform

WePuu Platform is the planned OAuth 2.1 control plane for the WePuu WordPress
MCP connector. It handles browser authorization, site pairing, scoped grants,
short-lived tokens, revocation, and signing-key rotation while keeping the MCP
data plane direct between the client and WordPress.

## Status

Phase 2.0.0 and Phase 2.0.1 are accepted. The local provider, HTTPS,
persistence, PHP, and Codex 0.154.0 pre-registered OAuth gates pass; Auth0 is
rejected for the frozen S256 profile and WorkBuddy 5.5.2 is unsupported. The
Phase 2.0.1 executable work remains isolated under `spikes/oauth-conformance/`.
Phase 2.0.2 Platform Foundation is accepted and closed after local, live AWS
KMS, and hosted CI validation. It provides:
strict TypeScript packages, an authorization service, a control API,
PostgreSQL RLS, content-free audit records, and an asymmetric signing
adapter. It is not deployed and does not modify the WordPress connector.
Phase 2.0.3 is accepted and closed. Platform tranche 2.0.3A implements tenant-scoped
site/pairing/grant persistence, SSRF-safe verification, Ed25519 site proofs,
external OIDC account login, hashed server-side sessions, and fail-closed
authorization resolvers. The real WordPress connector tranche 2.0.3B adds an
explicit fragment-safe Connect handoff, site-ID-bound Ed25519 pairing proof,
and local opaque grant storage. The signing runtime is pinned to Node 26.7+
and uses `jose` with an AWS KMS-backed `KeyObject`; real wp-admin pairing,
consent, domain migration/re-pair, cleanup, and hosted GitHub OIDC/KMS
acceptance all pass. Phase 2.0.4A/2.0.4B are accepted and closed. They add real authorization interactions, opaque
code/refresh lookup, atomic refresh replay revocation, database-backed endpoint
limits, managed signing-key lifecycle/JWKS overlap, durable signed revocation
delivery, and connector-local deny state. Phase 2.0.5 scoped Bearer integration
has completed implementation and exit validation on its isolated platform and
connector branches; every exit gate passed, and it was accepted and closed on
2026-09-29. Phase 2.0.6 security and resilience qualification is accepted and
closed after deterministic, live HTTPS/Codex, hosted dual-KMS and immutable
available-capability review gates passed. Phase 2.0.7A product shell and
portable runtime are accepted on `main` after PR, post-merge and hosted
single/two-key KMS validation. Phase 2.0.7B1 release-readiness is accepted and
closed on `main` at merge commit `a57b422` after PR #4 and post-merge CI passed.
Production deployment, connector changes and Phase 2.0.7B2 are not authorized.

## Architecture

```text
Codex / WorkBuddy -- OAuth browser flow --> WePuu control plane
       |                                  (authorization only)
       +-- Bearer token + MCP calls ----> WordPress connector
                                          (direct data plane)
```

The platform provides a direct WordPress data plane from the client and is not
an MCP gateway. In other words, the direct WordPress data plane is client to
connector; the platform does not carry WordPress content, media,
SEO values, email data, tool arguments, or tool results, and it never stores
WordPress passwords or Application Passwords.

## Frozen decisions

- Authorization Code + PKCE S256, PRM, AS metadata, RFC 8707 resource, and exact
  per-site audience.
- Short JWT access tokens, rotating opaque refresh values, immediate local grant
  revocation, and overlapping JWKS rotation.
- Explicit administrator-initiated site pairing and per-user local consent.
- Existing Application Password access and the connector's 23-tool catalog remain
  independent and intact.
- Authentication, tenant boundaries, audience validation, token validation, and
  uncertain security states fail closed.

## Foundation workspace

Requirements are Node.js 26.7 through Node 26.x, pnpm 11.19.0, Docker Desktop, and PostgreSQL 16
through the local test fixture. No `.env` file or local production signing key
is supported.

```powershell
pnpm install --frozen-lockfile
docker compose -f compose.test.yaml up -d --wait postgres
$env:WEPUU_TEST_DATABASE_URL = 'postgresql://postgres:conformance@127.0.0.1:55433/wepuu_test'
pnpm check
pnpm test:database
docker compose -f compose.test.yaml down
```

The authorization service requires exactly one active `local-pkcs8` RSA-3072
key in `oauth.signing_key_metadata`; published and retiring keys are
verification-only. The encrypted PKCS#8 private key and its passphrase are
separate protected files referenced by `WEPUU_SIGNING_KEYRING_FILE`. The
control API selects its logical key with `WEPUU_SIGNING_KEY_SLOT`. Public JWK
metadata is compared at startup and every signature rechecks that the active
`kid` remains active.

Authorization startup also requires two rotating cookie keys plus one or two
32-byte versioned OAuth-artifact HMAC keys in
`WEPUU_OAUTH_ARTIFACT_KEYS_JSON`, and an independent 32-byte
`WEPUU_RATE_LIMIT_HMAC_KEY`. These values are process/secret-manager inputs;
they must not be stored in `.env`, fixtures, logs, evidence, or Git.

Signing processes start normally through `pnpm start:control` and
`pnpm start:authorization`; no AWS/OpenSSL provider registration is required.

The control API account login requires the exact external OIDC profile recorded
in ADR-007: Authorization Code, PKCE S256, `openid` only, RS256 ID tokens, an
exact HTTPS callback, two rotating 32-byte transaction-cookie keys, and a
separate 32-byte subject-HMAC key. Grant creation additionally requires a
separate 32-byte `WEPUU_GRANT_IDEMPOTENCY_HMAC_KEY`; it deterministically
derives retry-safe consent challenges while PostgreSQL stores only their
digests. Secrets are process environment values or secret-manager injections
only; they must not be placed in `.env`, logs, or Git.

## Documentation map

- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [OAuth contract](docs/PHASE_2_0_AUTH_CONTRACT.md)
- [ADR-003 provider gate](docs/ADR-003-OAUTH-ENGINE-SELECTION.md)
- [ADR-004 token profile](docs/ADR-004-TOKEN-AND-SIGNING-PROFILE.md)
- [ADR-005 platform foundation](docs/ADR-005-PLATFORM-FOUNDATION.md)
- [ADR-006 site pairing proof](docs/ADR-006-SITE-PAIRING-PROOF.md)
- [ADR-007 external account OIDC](docs/ADR-007-EXTERNAL-ACCOUNT-OIDC.md)
- [ADR-008 Node 26 KMS JOSE runtime](docs/ADR-008-NODE-26-KMS-JOSE-RUNTIME.md)
- [ADR-016 local JOSE signing custody](docs/ADR-016-LOCAL-JOSE-SIGNING-CUSTODY.md)
- [Local signing test plan](docs/PHASE_2_0_LOCAL_SIGNING_TEST_PLAN.md)
- [Local signing validation](docs/PHASE_2_0_LOCAL_SIGNING_VALIDATION.md)
- [External account OIDC local acceptance](docs/ACCOUNT_OIDC_TEST_SETUP.md)
- [Phase 2.0.3 test plan](docs/PHASE_2_0_3_TEST_PLAN.md)
- [Phase 2.0.3 validation](docs/PHASE_2_0_3_VALIDATION.md)
- [Phase 2.0.3 versions](docs/PHASE_2_0_3_VERSION_MATRIX.md)
- [Phase 2.0.2 validation](docs/PHASE_2_0_2_VALIDATION.md)
- [Phase 2.0.2 versions](docs/PHASE_2_0_2_VERSION_MATRIX.md)
- [AWS KMS test setup](docs/AWS_KMS_TEST_SETUP.md)
- [Phase 2.0.7B1 test plan](docs/PHASE_2_0_7B_TEST_PLAN.md)
- [Phase 2.0.7B1 validation](docs/PHASE_2_0_7B_VALIDATION.md)
- [Phase 2.0.7B1 compatibility](docs/PHASE_2_0_7B_COMPATIBILITY_MATRIX.md)
- [Portable deployment](docs/PORTABLE_DEPLOYMENT.md)
- [Phase 2.0.1 validation](docs/PHASE_2_0_1_VALIDATION.md)
- [Phase 2.0.1 compatibility](docs/PHASE_2_0_1_COMPATIBILITY_MATRIX.md)
- [Phase 2.0.1 evidence](docs/PHASE_2_0_1_EVIDENCE.json)

## Authority and compatibility

The accepted connector remains a separately governed repository and is never
modified by platform-only validation. ADR-016 validation used connector commit
`92971ce` read-only. Codex CLI 0.154.0 and WorkBuddy 5.5.2 / codebuddy 2.137.1
are historical version-specific results; documentation claims alone do not
establish support for later client versions.

## Standards baseline

- [MCP Authorization, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OAuth 2.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/15/)
- [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/info/rfc9700)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/info/rfc9728)
- [Authorization Server Metadata, RFC 8414](https://www.rfc-editor.org/info/rfc8414)
- [Resource Indicators, RFC 8707](https://www.rfc-editor.org/info/rfc8707)
