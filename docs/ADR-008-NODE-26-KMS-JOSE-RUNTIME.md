# ADR-008: Node 26.7 KMS-backed JOSE signing runtime

- Status: accepted
- Date: 2026-09-23

## Context

Phase 2.0.3B requires the platform to issue a short-lived signed consent
request that WordPress can validate before showing local-user consent. The
accepted AWS KMS adapter exposes public key material and an external `Sign`
operation, while `jose` requires a private `KeyObject` or `CryptoKey` to build
the compact JWS. Exporting KMS private material and implementing JWS
serialization ourselves are both prohibited.

The reviewed `@keyobject/aws-kms` provider exposes an AWS KMS asymmetric key as
an ordinary Node `KeyObject`, leaving private operations in KMS. Version 0.0.2
requires Node.js 26.7.0 or later and an OpenSSL provider loaded before crypto
use. The provider publishes Linux and macOS native modules, but no Windows
native module; Windows is therefore a development host only, not a supported
KMS-signing runtime.

## Decision

- Upgrade the production TypeScript runtime baseline to Node.js 26.7 or later,
  but below Node 27.
- Pin `@keyobject/aws-kms` 0.0.2 and continue using `jose` 6.1.0 for compact JWT
  creation. The application does not construct JOSE signing input itself.
- Start every KMS JOSE-capable process through
  `keyobject-aws-kms exec -- node ...` or the equivalent reviewed OpenSSL
  configuration. Provider registration occurs before application crypto code.
- On Windows development hosts, run the signing process in the pinned Linux
  Node 26.7 container. Do not fall back to a local PEM key or a different JOSE
  implementation.
- The KMS URI is trusted deployment configuration only. It is constructed from
  an exact KMS key ARN whose region must match the configured region; aliases,
  profiles, endpoint overrides, and request-derived values are rejected.
- Keep the existing AWS SDK custody adapter for provider-neutral description,
  public JWK publication, health checks, and tests. Both paths target the same
  configured asymmetric signing key and `kid`.
- IAM remains limited to `kms:GetPublicKey`, `kms:DescribeKey`, and `kms:Sign`
  for the exact key ARN. No decrypt, data-key, key-management, or wildcard key
  permission is added.

## Compatibility and migration

Node 24 can no longer run the production workspace after this decision. The
isolated Phase 2.0.1 conformance fixture remains historical evidence and may
retain its own Node 24 pin. CI and production images must move together to
Node 26.7+ before KMS JOSE code is enabled.

Rollback disables new consent initiation and returns to the prior release; it
does not fall back to local private keys, unsigned requests, a weaker
algorithm, or hand-built JWS. Existing site keys and pairing records remain
valid, but no new grant becomes active while consent signing is unavailable.

## Rejected alternatives

- Exporting or reconstructing the KMS private key.
- Hand-encoding a compact JWS around the KMS signature.
- Using an archived or unmaintained Node 24 KMS-JOSE extension.
- Replacing KMS with an application-managed PEM key.
