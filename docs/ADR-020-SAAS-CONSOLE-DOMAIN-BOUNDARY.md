# ADR-020: SaaS console domain and authentication boundary

Status: accepted for local implementation; production rollout not authorized.

Date: 2026-10-11

## Context

`auth.wpauto.cc` currently serves Better Auth account login, the MCP OAuth
authorization server and the server-rendered SaaS console. The intended public
surface separates the console at `app.wpauto.cc` while keeping the OAuth issuer
and every OAuth endpoint at `https://auth.wpauto.cc`.

The existing node-oidc-provider is purpose-built for MCP clients. Its tokens
are bound to an exact RFC 8707 WordPress resource, tenant, site and Grant. Using
that provider as a general console identity provider would either invent a fake
WordPress Grant or broaden a closed OAuth contract.

## Decision

- Better Auth remains authoritative at `auth.wpauto.cc`. Its
  `__Host-wepuu_session` cookie remains host-only and is never shared with the
  parent domain.
- The SaaS console uses a separate opaque `__Host-wepuu_console` cookie at
  `app.wpauto.cc`. It is not a JWT. Only its SHA-256 digest is stored.
- A five-minute, one-time transaction transfers authentication from auth to
  app. The URL query carries only a request identifier. The one-time handoff
  code returns in a URL fragment, is exchanged by a same-origin POST and is
  stored only as a digest.
- A console Session references the exact Better Auth Session and expires no
  later than that authority Session or 12 hours after creation. Every console
  request also requires an active platform account. Deleting the Better Auth
  Session cascades to the console Session.
- Logout first revokes the app Session, then performs a one-time hop to the auth
  origin where a same-origin POST calls Better Auth's official sign-out API.
- control-api remains one process. Exact Host and Origin checks plus separate
  BaoTa Nginx vhosts expose the correct routes; no new service, Redis or second
  OAuth provider is introduced.
- `WEPUU_AUTH_PUBLIC_ORIGIN` and `WEPUU_APP_PUBLIC_ORIGIN` replace the ambiguous
  origin setting. The old `WEPUU_CONTROL_PUBLIC_ORIGIN` remains a single-origin
  development compatibility input and conflicts fail startup.

## Database impact

Migration `014_console_auth_boundary.sql` adds:

- `platform.console_auth_transactions` for short-lived login/logout handoffs;
- `platform.console_sessions` for hash-only derived app Sessions.

Neither table stores a Better Auth Session token, OTP, email, provider token or
WordPress content. No existing account, tenant, site, Grant or OAuth artifact is
rewritten.

## Compatibility and failure behavior

- OAuth issuer, metadata, `/auth`, `/token`, revocation, interactions, JWKS,
  RS256 and token claims remain unchanged on `auth.wpauto.cc`.
- WordPress pairing and consent ceremonies remain on auth. Console pages and
  their business mutations move to app.
- Existing auth-domain `GET /app...` requests receive a `303` to the exact app
  path. Cross-origin POSTs are not redirected.
- Expired, consumed, tampered or mismatched transactions fail closed. A valid
  Better Auth Session does not grant console access without a valid mapping and
  active WePuu account.
- The Connector, 23-tool catalog, Application Password fallback and direct MCP
  data plane are unchanged.

## Residual risk

Two browser Sessions exist by design. The derived Session adds state and a
short invalidation lookup, but it avoids parent-domain cookies and keeps the
identity authority explicit. A database compromise can replay Better Auth's
stored Session token under the risk already accepted by ADR-018; the new table
does not copy that token and stores its own token only as a digest.

## Rollback

Before public cutover, keep DNS and Nginx routing on the current auth origin.
The candidate accepts the legacy single-origin setting. After cutover, rollback
restores the prior images and auth vhost; migration 014 may remain unused and
does not alter existing records. Dropping its tables is unnecessary and is not
part of rollback.

## Release gate

Production cutover requires P3-A completion, reviewed DNS/TLS/Nginx changes, a
database backup and separate deployment approval. This ADR does not claim P3-A
or P3-B completion and does not authorize public registration.
