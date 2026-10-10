# ADR-018: Better Auth account authentication boundary

- Status: accepted for P1 implementation; local candidate not deployed
- Date: 2026-10-10

## Context

ADR-007 coupled the WePuu business account to one upstream OIDC issuer and
subject and implemented a separate digest-only browser session. The SaaS
account must instead keep a stable internal OAuth subject while allowing one
person to bind multiple authentication methods. Email OTP is planned next and
Google OIDC may follow. The existing node-oidc-provider, tenant membership,
grant and WordPress authorization contracts must remain unchanged.

## Decision

Better Auth 1.7.7 owns authentication users, provider accounts, browser
sessions and verification records in the isolated PostgreSQL `auth` schema.
The shared `@wepuu/account-auth` package is the only runtime configuration.
Both control services call Better Auth's official `auth.api.getSession()`;
neither parses the cookie payload nor calls the other service over HTTP.

`platform.accounts.id` remains the stable WePuu account identifier and OAuth
subject. `platform.account_auth_links` is a one-to-one projection from a Better
Auth user to that identifier. `platform.ensure_account_auth_link` serializes
initialization by authentication user and atomically creates the platform
account, home tenant, owner membership and mapping. A valid authentication
session without an active mapping grants no platform access.

The session cookie remains exactly `__Host-wepuu_session`, with Secure,
HttpOnly, SameSite=Lax, Path=/ and no Domain. Sessions have a twelve-hour
absolute lifetime; refresh and cookie caching are disabled. Account linking is
explicit: implicit same-email linking, different-email linking and unlinking
the final method are disabled. Better Auth Organization, OAuth Provider, JWT,
Bearer, Admin and session-cache plugins are not enabled.

Auth0 is temporarily configured through Better Auth Generic OAuth with OIDC
discovery, PKCE, nonce binding, `client_secret_basic` and `openid email
profile`. Its callback is `/api/auth/callback/auth0`. It remains an upstream
login provider only and has no role in MCP OAuth issuance. Email OTP and Resend
are not enabled in P1.

## Sensitive data and residual risk

Better Auth 1.7.7 stores the opaque session token in `auth.session.token`, not
only a digest. This is a deliberate, documented change from ADR-007. Database
read access can therefore enable session replay until the twelve-hour absolute
expiry or revocation. The risk is bounded by schema permissions, no cookie
cache, immediate database-backed revocation, protected backups and the short
absolute lifetime, and is accepted for this P1 candidate.

`account.encryptOAuthTokens=true` encrypts access and refresh tokens in the
official OAuth path. P1 additionally uses Better Auth database hooks to reject
unencrypted access/refresh token writes and to discard ID tokens because 1.7.7
does not encrypt the ID-token column in every OAuth persistence path. No
provider token is needed after account authentication. Verification identifiers
are hashed; the P2 feasibility test also fixes Email OTP storage to `hashed`.

The Better Auth secret is a versioned active/previous key ring read from a
protected file. Secret values are not accepted in ordinary environment
variables, logs, database metadata or repository files. The authorization
service uses a database role limited to session/user and business-mapping
reads; the control service uses a separate authentication writer role.

## Compatibility and failure behavior

The node-oidc-provider issuer, discovery, PKCE, consent, token, refresh,
revocation, local JOSE signing and JWKS contracts do not change. The WordPress
connector and direct MCP data plane are unchanged. Existing `platform` session
and legacy identity columns remain for rollback but the new runtime does not
write them. Suspended/deleted accounts, missing mappings, missing secrets,
invalid cookies and database uncertainty fail closed.

ADR-007 is partially superseded for platform account login and browser Session
custody. It remains historical evidence and rollback documentation. ADR-017's
currently deployed Auth0 callback remains production reality until a separately
authorized deployment updates the Auth0 application and services.

## Migration and rollback

Official CLI-generated Better Auth tables are committed as immutable migration
010. Migration 011 adds the mapping, roles and atomic projection function and
makes the two legacy identity columns nullable. Production startup never runs
Better Auth automatic migration.

Rollback uses the prior application images and the retained ADR-007 tables and
columns. The additive `auth` schema and mapping are preserved for diagnosis;
they are not truncated or deleted. No account merge, historical Auth0 subject
migration, production data cleanup or Connector change is part of P1.
