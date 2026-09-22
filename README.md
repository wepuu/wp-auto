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
PostgreSQL RLS, content-free audit records, and an AWS KMS asymmetric signing
adapter. It is not deployed and does not modify the WordPress connector.
Phase 2.0.3 has not started.

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

Requirements are Node.js 24, pnpm 11.19.0, Docker Desktop, and PostgreSQL 16
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

The authorization service requires an existing AWS KMS asymmetric RSA
`SIGN_VERIFY` key through `AWS_REGION`, `WEPUU_KMS_KEY_ID`, and
`WEPUU_KMS_KID`. Missing or invalid custody configuration prevents startup;
there is no file-key fallback.

## Documentation map

- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [OAuth contract](docs/PHASE_2_0_AUTH_CONTRACT.md)
- [ADR-003 provider gate](docs/ADR-003-OAUTH-ENGINE-SELECTION.md)
- [ADR-004 token profile](docs/ADR-004-TOKEN-AND-SIGNING-PROFILE.md)
- [ADR-005 platform foundation](docs/ADR-005-PLATFORM-FOUNDATION.md)
- [Phase 2.0.2 validation](docs/PHASE_2_0_2_VALIDATION.md)
- [Phase 2.0.2 versions](docs/PHASE_2_0_2_VERSION_MATRIX.md)
- [AWS KMS test setup](docs/AWS_KMS_TEST_SETUP.md)
- [Phase 2.0.1 validation](docs/PHASE_2_0_1_VALIDATION.md)
- [Phase 2.0.1 compatibility](docs/PHASE_2_0_1_COMPATIBILITY_MATRIX.md)
- [Phase 2.0.1 evidence](docs/PHASE_2_0_1_EVIDENCE.json)

## Authority and compatibility

The reference connector is the sealed Phase 1.7.5 repository at
`D:\Codex\wp-auto-connector`. This repository does not modify or release that
plugin. Codex CLI 0.154.0 and WorkBuddy 5.5.2 / codebuddy 2.137.1 are tested as
version-specific clients; documentation claims alone do not establish support.

## Standards baseline

- [MCP Authorization, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OAuth 2.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/15/)
- [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/info/rfc9700)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/info/rfc9728)
- [Authorization Server Metadata, RFC 8414](https://www.rfc-editor.org/info/rfc8414)
- [Resource Indicators, RFC 8707](https://www.rfc-editor.org/info/rfc8707)
