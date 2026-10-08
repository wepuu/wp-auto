# Local JOSE signing migration validation

Date: 2026-10-08
Status: implementation candidate; production and staging acceptance remain gated

## Implemented

- `panva/jose` is unified at 6.2.12. AWS KMS SDK and the OpenSSL KMS provider
  are absent from the current dependency lock and runtime startup commands.
- `LocalPkcs8KeyCustody` loads encrypted RSA-3072 PKCS#8 and a separate
  passphrase file, derives RFC 7638 `kid`, exposes public-only JWK and performs
  bounded RS256 signing through Node crypto.
- Active signing requires `local-pkcs8`; historical KMS public JWK rows remain
  verification-only during overlap. Control and authorization services verify
  the local key against active database metadata.
- Key generation, inspection, publish, activate and retire commands are
  present. Docker Compose mounts keyring, private key and passphrase separately
  as read-only secrets.
- No connector repository was modified and no production deployment occurred.

## Local evidence

- Node: 26.11.1.
- TypeScript build: passed.
- ESLint: passed.
- Full TypeScript suite: 68 total, 59 passed, 9 environment-gated skips, 0
  failed. The database tests are also run separately with PostgreSQL below.
- Disposable CLI generation and inspection: passed; both commands emitted the
  same public RFC 7638 `kid`, and the disposable files were removed.
- Dependency audit: passed with no known high-severity vulnerabilities.
- SBOM generation and repository policy verification: passed with 262 components.
- `git diff --check`: passed.
- PostgreSQL migration and repository suite: 11 passed, 0 failed. This includes
  two real RSA-3072 keys moving through published, active, retiring and revoked,
  the 20-minute publication/overlap gates, and an assertion that no private key
  or passphrase is stored in PostgreSQL.
- Backup restore and deletion-tombstone replay: passed against disposable
  PostgreSQL.
- Existing WordPress PHP interoperability fixture: passed for provider tokens
  before and after rotation; multiple audience, expiration, unknown `kid` and
  HS256 substitution were rejected without connector changes.
- OCI images for control and authorization services: built successfully. The
  authorization image started as non-root with a read-only root filesystem,
  loaded the key from read-only secrets in production mode, and published one
  RS256 JWK with zero private members. A `0444` private key was rejected closed.
- Both candidate images were inspected at runtime and do not resolve
  `@aws-sdk/client-kms`. Direct Node startup also avoids package-manager writes
  on a read-only root filesystem.
- The account-OIDC Compose harness now provisions a fresh disposable local key;
  it no longer requests AWS credentials or embeds AWS key identifiers.

## Outstanding gates

- External account-provider login and the full browser-driven WordPress pairing,
  consent, refresh, revocation and direct MCP flow still require the separately
  controlled provider credentials and connector test repository. They remain a
  pre-release/staging gate; this candidate neither modifies the connector nor
  deploys production.
- Historical KMS evidence remains under `docs/` and is explicitly labeled. Its
  obsolete executable harnesses and live-KMS CI configuration are removed.
