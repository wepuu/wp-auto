# Phase 2.0.3 Version Matrix

| Component | Pinned/observed version | Role |
|---|---:|---|
| Node.js | 24.19.0 | local and hosted TypeScript runtime |
| pnpm | 11.19.0 | workspace package manager |
| TypeScript | 5.9.3 | strict compiler |
| PostgreSQL | 16.10-alpine | migration and RLS fixture |
| `jose` | 6.1.0 | Ed25519 site-proof verification |
| `ipaddr.js` | 2.2.0 | parsed IP-range classification |
| `node-oidc-provider` | 9.12.2 | retained authorization server |
| WordPress PHP image | PHP 8.1.34, digest `sha256:f73396626d2f1b89d4c556917c15f55cfcc6b5f80595205516e490f0f04015e4` | proof interoperability |
| AWS KMS adapter | SDK 3.1133.0 | unchanged RS256 platform signing boundary |
| SBOM | CycloneDX 1.6 via cdxgen 12.8.4 | 293 workspace components |

The WordPress image digest is evidence for local Phase 2.0.3A validation. Hosted
CI should pin the same digest before Phase 2.0.3 closure rather than relying on
the mutable `wordpress:php8.1` tag.
