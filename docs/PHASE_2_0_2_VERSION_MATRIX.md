# Phase 2.0.2 Version Matrix

- Status: local implementation verified; external exit evidence pending
- Updated: 2026-09-17

| Component | Pinned baseline | Local result |
|---|---:|---|
| Node.js | 24.19.0 / Node 24 LTS | pass |
| pnpm | 11.19.0 | pass, frozen lockfile generated |
| TypeScript | 5.9.3 | pass, strict composite build |
| ESLint | 9.39.5 + typescript-eslint 8.70.0 | pass; development-only deprecated-version warning documented |
| OAuth engine | node-oidc-provider 9.12.2 | pass with external signing test double; experimental API remains a production gate |
| AWS SDK KMS | @aws-sdk/client-kms 3.1133.0 | adapter contract/outage and live AWS RSA signing pass |
| PostgreSQL client | pg 8.23.0 | pass |
| PostgreSQL | 16.10-alpine | migration replay, RLS and persistence pass |
| Control API | Fastify 5.12.5 | pass; upgraded from vulnerable 5.7.4 before acceptance |
| Validation | Zod 4.6.5 | pass |
| SBOM | CycloneDX 1.6 via cdxgen 12.8.4 | 282 components |

The hosted workflow pins Node, pnpm, PostgreSQL, and all application dependency
versions. Phase 2.0.1 client, PHP, and provider evidence remains authoritative
for protocol interoperability and is not duplicated here.
