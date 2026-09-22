# ADR-004: Token and signing profile gate

- Status: accepted for Phase 2.0.2 implementation; production release remains gated
- Date: 2026-09-16

## Baseline decision

Use a signed RS256 JWT access token with mandatory `typ=at+jwt`, `kid`, exact
issuer, one exact canonical MCP audience, bounded time claims, and opaque
rotating refresh values. The profile is intentionally conservative for
WordPress/PHP and MCP clients.

## Fixed test values

- Authorization Code lifetime: 90 seconds, single use.
- Access Token lifetime: 300 seconds; maximum clock skew: 60 seconds.
- Refresh values: rotate on every use, zero reuse grace, 30-day inactivity,
  90-day absolute lifetime.
- JWKS overlap: at least 20 minutes; unknown `kid` triggers at most one bounded
  refresh; emergency `kid` denial fails closed.

## Access-token constraints

The JOSE header allow-list is `RS256` with `typ=at+jwt` and a published `kid`.
Claims include exact `iss`, one string `aud`, opaque `sub`, `site_id`, `grant_id`,
space-delimited approved `scope`, `iat`, `nbf`, `exp`, and `jti`. No WordPress
identity, role, credential, content, tool, SEO, media, or mail fields are
allowed.

## Key lifecycle

Production implementation must generate or import keys through KMS/HSM, publish
the public JWK before activation, retain the prior key through token lifetime,
skew, cache, and incident margins, and explicitly deny compromised `kid` values.
Private key bytes never enter application configuration, logs, or the database.

Phase 2.0.2 implements a provider-neutral custody port and AWS KMS asymmetric
RSA signing adapter. The application receives only the public key, key
identifier, lifecycle metadata, and signature result. A local signing adapter
is permitted only inside tests and cannot be selected by production
configuration.

The live AWS contract passed on 2026-09-21 against a disposable asymmetric RSA
`SIGN_VERIFY` key using least-privilege `DescribeKey`, `GetPublicKey`, and
`Sign` access. The returned signature verified locally against the downloaded
public key; no private key material entered the application.

## Refresh profile

Refresh values are opaque random values with at least 256 bits of entropy. They
are hashed at rest and bound to client, tenant, site, resource, subject, grant,
scope ceiling, and family. One-use rotation is atomic; reuse or generation
mismatch revokes the family.

## Validation result

The local provider, bounded JWKS cache, PostgreSQL restart path, and PHP
`lcobucci/jwt` 4.3.0 verification of real provider tokens before and after key
rotation pass this profile. Auth0 is rejected because its tenant accepts
`plain` PKCE; no compatibility exception is made. WorkBuddy 5.5.2 is excluded
as unsupported. Codex 0.154.0 passed the pre-registered Authorization Code
path with S256 and a constrained dynamic loopback callback port.
