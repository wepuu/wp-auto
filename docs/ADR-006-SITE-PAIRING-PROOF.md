# ADR-006: Site pairing and local-consent proof

- Status: accepted for Phase 2.0.3A implementation
- Date: 2026-09-22

## Context

Pairing must prove that an authenticated WordPress administrator initiated the
operation and that the platform reached the exact canonical resource host. A
browser-carried bearer value alone cannot establish durable site trust. The
platform must not receive WordPress credentials, user identity, MCP requests,
or content.

## Decision

WordPress creates a site-local Ed25519 signing key and exposes only its public
JWK during a bounded pairing exchange. The private key remains at WordPress.
The key is independent from the platform RS256 AWS KMS key.

The administrator creates a 256-bit one-time verifier. WordPress stores only
its SHA-256 digest for at most ten minutes. After platform-account consent, the
platform resolves and pins a public destination address for the exact HTTPS
resource host and posts a fresh 256-bit challenge to the fixed
`/wp-json/wp-auto/v1/pairing/proof` control path. Redirects are not followed.

The response is a compact EdDSA JWS with `typ=wepuu-site-proof+jwt`. It binds
the protocol version, site hostname, platform issuer, tenant, pairing attempt,
exact canonical resource, challenge, issue time, and expiry. Proof lifetime is
at most 60 seconds. The platform validates it with a reviewed JOSE library and
stores the public JWK plus RFC 7638 thumbprint only after the database
transition wins atomically.

Local consent uses the same site key but a distinct `kind=consent` proof. It
also binds opaque grant and subject identifiers, OAuth client, exact scopes,
resource, and a single-use challenge. The platform stores no WordPress user
identifier. Platform-to-WordPress consent requests are signed through a
`ConsentRequestSigner`; production custody remains AWS KMS. ADR-008 implements
that port with `jose` and an AWS KMS-backed Node `KeyObject` on Node 26.7+.
The connector pins the platform public RSA key and `kid` received during
pairing. Consent request protected headers are exactly `alg=RS256`,
`typ=wepuu-consent-request+jwt`, and that `kid`; claims use a single-string
audience equal to the exact resource and a maximum 120-second lifetime.

Consent proofs bind the same exact resource as `aud` and include the explicit
`approved` or `denied` decision. The browser transports both the request and
completion result in fragments, immediately clears history, and uses
same-origin POSTs. WordPress stores only normalized verified claims in a
hashed, non-autoloaded, local-user-bound one-shot record. Denial creates no
local grant.

Grant-start retries derive the one-time challenge with HMAC-SHA-256 from a
dedicated 256-bit runtime key and the immutable request plus idempotency key.
The database stores only the challenge digest, request digest, and opaque grant
reference. The HMAC key is separate from OIDC transaction and identity-subject
keys and never enters PostgreSQL, logs, fixtures, or Git.

## SSRF and failure behavior

Production resources are canonical HTTPS URLs on port 443 without credentials,
query, or fragment. Every connection resolves A and AAAA records, rejects the
entire result if any address is non-public, connects to a validated address,
and preserves TLS SNI and hostname verification. Loopback, private, link-local,
reserved, documentation, metadata, multicast, and IPv4-mapped variants fail
closed. Responses must be JSON, status 200, and at most 16 KiB.

Invalid, expired, replayed, mismatched, oversized, or unavailable proof marks
the attempt failed. No uncertainty creates a site or grant. Domain, scheme,
port, path, or site-key change suspends existing trust and requires re-pairing.
The connector must compare the stored audience with its current canonical REST
resource on every trust-sensitive settings read, retain the old audience when
they differ, and permit proof completion only from `pending`. Consent approval
or denial must recheck the exact site binding after consuming local one-shot
state so suspension or re-pairing cannot revive a previewed request.

## Compatibility and migration

The TypeScript verifier uses `jose` 6.1.0. The reference PHP proof uses native
libsodium and passes against the WordPress PHP 8.1 container. This phase adds
only public site-key metadata and hashed one-time values to PostgreSQL.
Migration `004_grant_reconsent.sql` permits re-consent only after the previous
grant is revoked while retaining one live grant per
tenant/site/subject/client tuple.

The real connector implementation is Phase 2.0.3B. Its local implementation
and adversarial tests pass; real HTTPS browser acceptance remains required
before production readiness or phase closure.

## Rejected alternatives

- Browser verifier as durable site trust: replay and interception risk.
- Shared long-lived HMAC secret at the platform: creates another exportable
  secret and complicates rotation.
- Reusing the platform RSA KMS key at WordPress: violates custody boundaries.
- TLS reachability without an application proof: insufficient binding to the
  administrator-created transaction.
