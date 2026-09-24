# Phase 2.0.3 Version Matrix

| Component | Pinned/observed version | Role |
|---|---:|---|
| Node.js | 26.7.0 minimum, `<27`; pinned Linux image and hosted GitHub Actions KMS path validated; Windows host observed 24.19.0 | production/hosted signing runtime; the Windows host performs orchestration only |
| pnpm | 11.19.0 | workspace package manager |
| TypeScript | 5.9.3 | strict compiler |
| PostgreSQL | 16.10-alpine | migration and RLS fixture |
| Caddy | 2.10.2-alpine | local account-callback HTTPS acceptance only |
| `jose` | 6.1.0 and 6.2.12 (MIT) | Ed25519 site proof; OIDC transaction JWE |
| `openid-client` | 6.8.8 (MIT) | external OIDC discovery, Code + PKCE and ID-token validation |
| `ipaddr.js` | 2.2.0 | parsed IP-range classification |
| `node-oidc-provider` | 9.12.2 | retained authorization server |
| WordPress PHP interop image | PHP 8.1.34, digest `sha256:f73396626d2f1b89d4c556917c15f55cfcc6b5f80595205516e490f0f04015e4` | isolated proof interoperability |
| WordPress acceptance image | `wordpress:6.9-php8.3-apache`, digest `sha256:85c24b4b92dc7fcea65317d2be635643189d0d8ad4bba65d79a660fd018fe246` | real wp-admin pairing and consent acceptance |
| WordPress CLI | `wordpress:cli-2.12.0-php8.3`, digest `sha256:9e1e5309e3e3b27bef70e62874978d5fecac970e4b1d46ca95f596a711ef3dc1` | disposable fixture installation and lifecycle checks |
| MariaDB | `11.8.3-noble`, digest `sha256:1cc14cc479613f2925315a5da7aa0eb5288f938565d94b56cd137b724d2ea12b` | disposable WordPress acceptance persistence |
| AWS KMS adapter | SDK 3.1133.0; `@keyobject/aws-kms` 0.0.2 (MIT) | RS256 custody plus JOSE-compatible Node `KeyObject`; private material remains in KMS |
| SBOM | CycloneDX 1.6 via cdxgen 12.8.4 | 293 resolved components |

Both WordPress image digests are evidence: PHP 8.1.34 covers the frozen
interoperability contract and WordPress 6.9/PHP 8.3 covers the real browser
acceptance path. Hosted CI must use pinned digests rather than mutable tags.

`packages/account-identity` enables `skipLibCheck` only at that package boundary
because `openid-client` 6.8.8 declarations conflict with the workspace's
`exactOptionalPropertyTypes` setting. WePuu source remains strict and fully
type-checked; the exception must be removed when an upstream declaration release
is compatible.
