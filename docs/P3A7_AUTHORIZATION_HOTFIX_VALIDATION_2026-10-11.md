# P3-A7 Authorization Hotfix Validation - 2026-10-11

Status: local production-baseline candidate; not deployed.

## Provenance and scope

- Source baseline: `bb71226fd21cc3c26d1f7e53e76b328b45fb095b`, the
  exact Control and Authorization source deployed for the positive P3-A
  production acceptance.
- Runtime changes are limited to the Authorization Service replay context,
  the PostgreSQL OIDC adapter revocation-reason resolver, and bounded
  revocation-delivery error classification.
- The Control Service, Connector, deployment routing and database schema are
  unchanged. Migration 014 and the P4-A console-domain candidate are absent.
- The production lifecycle probe fix is delivered on the main platform repair
  branch and is not part of this runtime image because production images do
  not copy repository scripts.

## Validation

- `pnpm check` under Node 26.11.1: 99 tests executed, 85 passed,
  14 environment-dependent tests skipped and 0 failed.
- Focused tests verify that only a consumed refresh token at the token
  endpoint with `grant_type=refresh_token` resolves to `refresh_replay`.
- Concurrent request contexts remain isolated; RFC 7009 and calls without an
  explicit replay context continue to resolve to `token_revoked`.
- Worker tests cover 204 success, signing failure, DNS, unsafe destination,
  TLS, timeout, generic network, HTTP rejection and retry behavior using only
  bounded content-free error codes.

Image construction and OCI inspection are recorded separately after this
source commit:

- Local fixed tag: `wepuu-authorization:p3a7-hotfix-bb71226-faf9bbd`.
- Local image digest: `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- The image runs as `node`, retains the normal Authorization entrypoint and
  contains migrations 001 through 013 only.
- The local-signing OCI gate passed with zero private JWKS members and no AWS
  KMS runtime dependency.

No production service, database, Grant or outbox row was modified while
preparing this candidate.
