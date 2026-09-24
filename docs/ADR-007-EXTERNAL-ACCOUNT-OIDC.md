# ADR-007: External OIDC account login and hashed sessions

- Status: accepted for Phase 2.0.3A implementation
- Date: 2026-09-22

## Context

The control API already consumes hashed server-side account sessions but cannot
mint them. A configured external identity provider is required to authenticate
the platform account before pairing or grant administration. This identity
boundary is separate from the MCP authorization server and from WordPress-local
identity.

Auth0 was rejected as the MCP authorization server because its tested tenant
accepted `plain` PKCE. It may still be used as an upstream account identity
provider because WePuu is the relying party and always emits PKCE S256.

## Decision

Use a reviewed OpenID Connect relying-party library for Authorization Code with
PKCE S256. The account client requests only `openid`, uses an exact HTTPS
redirect URI, and validates discovery metadata, issuer, client audience, nonce,
state, signature algorithm, signature, and time claims. Any uncertain result
fails closed.

The browser transaction is a five-minute encrypted JWE cookie using `dir` and
`A256GCM`. It contains only bounded protocol state: code verifier, state, nonce,
creation time, and a validated same-origin return path. The active transaction
key encrypts while the active and immediately previous keys may decrypt.

The external subject is never persisted or logged. The platform computes
HMAC-SHA-256 over the exact issuer, a zero separator, and subject. PostgreSQL
stores the resulting pseudonymous digest with the issuer and a random opaque
account identifier. One platform-wide identity HMAC key is used; it is not a
per-user key and is unrelated to the AWS KMS RSA signing key.

After successful callback validation, the platform creates a 256-bit opaque
session token, stores only its SHA-256 digest, and returns the raw value in the
`__Host-wepuu_session` cookie. The cookie is `Secure`, `HttpOnly`,
`SameSite=Lax`, has `Path=/`, and has no `Domain`. Sessions have a twelve-hour
absolute lifetime in this phase. Suspended or deleted accounts cannot create or
use sessions. Login does not create a tenant or membership.

## Data and failure boundaries

Authorization codes, access tokens, ID tokens, cookies, code verifiers, nonce,
state, client secrets, external subjects, and external profile claims are not
written to logs, audit events, PostgreSQL, fixtures, or Git. Audit evidence is
limited to method, stable route, outcome, bounded reason, correlation ID, and
the opaque internal account identifier after authentication succeeds.

Discovery, token exchange, JWKS, database, configuration, or cryptographic
failure denies login with a generic response. Callback responses are not
cacheable and do not reflect provider error descriptions. Logout revokes the
server-side digest and clears the browser cookie.

## Compatibility and migration

The implementation pins `openid-client` 6.8.8 and `jose` 6.2.12. It was
accepted on Node 24; ADR-008 subsequently raises the production workspace
runtime floor to Node 26.7 without changing this OIDC profile.
Migration `003_account_login.sql` adds the identity uniqueness constraint and a
dedicated non-login database role with only the account/session privileges
needed by the callback.

The configured Auth0 application is an upstream Regular Web Application only.
It is not registered as an MCP client or resource server. Provider replacement
is supported through the same internal adapter and requires revalidation.

## Rejected alternatives

- Storing Auth0 `sub`, email, or profile claims: unnecessary identity data.
- Deriving authorization from matching WordPress email: not proof of local
  WordPress control.
- Browser-only sessions: prevents server-side revocation and account disable.
- Reusing the AWS KMS signing key for subject hashing or cookie encryption:
  conflates unrelated custody and algorithm boundaries.
- Implementing OIDC discovery, token validation, or JOSE primitives directly:
  unnecessary protocol and cryptographic risk.
