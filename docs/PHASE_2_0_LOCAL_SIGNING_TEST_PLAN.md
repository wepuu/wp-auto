# Local JOSE signing migration test plan

Date: 2026-10-08

## Deterministic gates

- TypeScript build, ESLint and the complete deterministic test suite pass on
  Node 26.7 or later.
- Encrypted RSA-3072 PKCS#8 import, RFC 7638 `kid`, RS256 signing, consent and
  revocation JWS profiles, public-only JWK conversion and keyring slot lookup
  pass.
- Wrong passphrase, weak RSA, symlink, unsafe Unix mode, mismatched `kid`,
  private JWK input and invalid signing input fail closed.
- JWKS contains active and overlap public keys without RSA private members.
- PostgreSQL accepts `local-pkcs8`, preserves verification-only `aws-kms`
  metadata, enforces the 20-minute publish/retire overlaps, supports first-key
  activation, and never stores private paths or passphrases.
- The existing PHP/WordPress JOSE fixtures continue to accept the unchanged
  RS256, `kid` and `typ` profiles without connector changes.
- Repository, OCI image, process configuration and logs contain no generated
  private key or passphrase.

## Staging gates

- Generate two disposable keys outside Git, publish/activate/rotate/retire them,
  and prove both overlap signatures through JWKS.
- Exercise pairing, consent, access token, refresh rotation, revocation and a
  direct Codex-to-WordPress MCP call; Application Password remains independent.
- Confirm failed key mounts and metadata mismatch keep both services unready.
- Review control-plane logs and database exports for content and key canaries.

Production deployment and connector modification are not part of this plan.
