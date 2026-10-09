# ADR-016: Local JOSE signing custody

- Status: accepted on 2026-10-08; provisionally deployed under ADR-017 on 2026-10-09
- Date: 2026-10-08

## Context

The accepted platform used AWS KMS through an OpenSSL `KeyObject` provider. The
operator explicitly approved replacing it with a free, self-hosted signing
system while preserving the frozen RS256 and OAuth wire contracts. KMS private
keys cannot be exported and will not be recovered.

## Decision

- The TypeScript control plane uses `panva/jose` 6.x for JWT, JWS, JWK, JWKS
  and RFC 7638 thumbprints, and Node `crypto.sign` for the bounded raw RS256
  callback required by `oidc-provider`.
- Every new key is RSA-3072 in encrypted PKCS#8. Its private key and passphrase
  are separate read-only Docker Secrets or protected files. Environment
  variables carry paths and logical key slots only.
- `kid` is the SHA-256 RFC 7638 public-JWK thumbprint and is never selected by
  an operator.
- PostgreSQL stores only the logical slot and public JWK. Historical `aws-kms`
  rows may remain verification-only; an active signer must be `local-pkcs8`.
- The existing 20-minute publish and retiring overlaps, RS256 wire profile and
  connector PHP verification remain unchanged.
- Vault, HSM and additional key-management services are out of scope.

## Security and operations

Public-mode startup fails for missing, symlinked, oversized, group/world
accessible, wrong-owner, malformed, weak, wrong-passphrase or mismatched key
files. Private material is never emitted or stored in PostgreSQL.

Compose secrets are host file mounts, not HSM custody. A host root compromise
can exfiltrate a loaded key. Operators must keep two encrypted offline backups
in separate locations with passphrases stored separately.

## Migration and rollback

Generate a fresh local key without exporting KMS material, publish its public
JWK, wait at least 20 minutes, activate it, and retain the KMS public JWK until
token and cache overlap ends. Disabling or deleting a cloud KMS key is a
separately approved destructive action and is not performed by this repository.

## Consequences

AWS SDK, the OpenSSL KMS provider, AWS workload identity and live-KMS CI leave
the current runtime. Historical KMS evidence remains accepted historical
evidence and is not represented as local-signing validation.
