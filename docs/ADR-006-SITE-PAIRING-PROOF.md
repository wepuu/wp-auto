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
`ConsentRequestSigner`; production custody remains AWS KMS.

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

## Compatibility and migration

The TypeScript verifier uses `jose` 6.1.0. The reference PHP proof uses native
libsodium and passes against the WordPress PHP 8.1 container. This phase adds
only public site-key metadata and hashed one-time values to PostgreSQL.

The real connector implementation is Phase 2.0.3B and requires separate
approval. Until then, the protocol fixture is executable but does not authorize
production traffic.

## Rejected alternatives

- Browser verifier as durable site trust: replay and interception risk.
- Shared long-lived HMAC secret at the platform: creates another exportable
  secret and complicates rotation.
- Reusing the platform RSA KMS key at WordPress: violates custody boundaries.
- TLS reachability without an application proof: insufficient binding to the
  administrator-created transaction.
