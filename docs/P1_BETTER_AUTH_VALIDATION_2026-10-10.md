# P1 Better Auth validation record — 2026-10-10

## Scope

This record covers the local P1 candidate only. It does not record a production
deployment, production database migration, Resend integration, Connector
change or Phase 2.0.7B2 work.

## Confirmed configuration

- `better-auth` is pinned exactly to 1.7.7 and Kysely to 0.29.6.
- The official 1.7.7 CLI generated `auth.user`, `auth.account`,
  `auth.session` and `auth.verification` in the `auth` schema.
- A repository hardening migration adds the database-level
  `auth.account(providerId, accountId)` unique index omitted by the generated
  schema, so one external identity cannot be linked to two Better Auth users.
- `auth check schema` passed against PostgreSQL 16 after repository migrations.
- The browser cookie is exactly `__Host-wepuu_session`, has no Domain, and is
  Secure, HttpOnly, SameSite=Lax with Path=/ and a 43,200-second lifetime.
- Session refresh and cookie caching are disabled. A reader-role `getSession()`
  does not update the persisted session.
- The database stores the opaque Better Auth session token. This accepted
  residual replay risk is recorded by ADR-018.
- Access and refresh token canaries are encrypted before persistence; a direct
  plaintext persistence attempt is rejected. The ID-token canary is discarded.
- A test-only Email OTP sender with `storeOTP: "hashed"` left neither the raw
  email identifier nor OTP in `auth.verification`. Resend was not called.

## Executed checks

- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm check` — passed: 93 tests, 82 passed, 11 environment-gated tests
  skipped, with zero failures; TypeScript and lint also passed.
- `WEPUU_TEST_DATABASE_URL=<isolated tmpfs PostgreSQL> pnpm test:database` —
  12/12 passed, including concurrent account projection and tenant RLS.
- Better Auth focused PostgreSQL suite — passed, including absolute sessions,
  revocation, reader-role behavior, provider-token encryption and OTP hashing.
- control-api and authorization-service focused tests — 32/32 passed.
- repository migrations executed twice — passed through checksum/idempotency
  handling.
- `auth@1.7.7 check --config packages/account-auth/src/schema.ts schema` —
  passed against the isolated database.
- `pnpm test:backup` — backup restore and deletion-tombstone replay passed.
- `pnpm test:local-signing:oci` — both candidate images built; the
  authorization image started with protected local signing, published a
  public-only RS256 JWKS and contained no resolvable AWS KMS SDK.
- `pnpm audit --audit-level high` — no known vulnerabilities.
- `pnpm sbom:check` — passed with 283 components. The scanner separately
  warned about the Codex runner's `NODE_PATH` and outbound proxy environment;
  these are not application image settings.

The PostgreSQL fixture was the repository's `compose.test.yaml` service using
tmpfs. No production database or secret was read or changed.

## Data-flow review

The change handles login metadata, authentication users, sessions and the
opaque WePuu account mapping only. No route, table, log or adapter was added for
WordPress content, MCP tool inputs or MCP tool outputs. Token issuance remains
inside the existing authorization service and MCP calls remain client-to-
WordPress.

## Deferred gates

- Real Auth0 → Better Auth callback testing requires an authorized non-
  production or production rollout plus the callback registration change to
  `/api/auth/callback/auth0`.
- P2 must implement the user-facing Email OTP pages, Resend delivery, abuse
  controls and interaction-resume acceptance before Auth0 can be removed.
- Production deployment, old-session cleanup and legacy-column removal require
  separate authorization.
