# Phase 2.0.7B1 Version Matrix

| Component | Version or contract |
|---|---|
| WePuu workspace packages | 0.5.0 |
| Runtime | Node 26.7.x |
| Package manager | pnpm 11.19.0 |
| Database test baseline | PostgreSQL 16.10 Alpine |
| OAuth engine | oidc-provider 9.12.2 |
| Access-token profile | RS256, `typ=at+jwt`, exact string audience |
| Portable runtime | Non-root OCI, read-only root filesystem |
| AWS credential contract | Workload OIDC or `credential_process`; no static production keys |

Production host, external PostgreSQL vendor, reverse proxy, public domain and
external account OIDC application remain Phase 2.0.7B2 decisions.
