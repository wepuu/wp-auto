# Phase 2.0.7A Product Shell and Portable Runtime Validation

Status: accepted and closed on 2026-10-07. PR #3 merged immutable candidate
`4f53a08` to `main` as `8e6257a`; PR and post-merge CI passed. Production
deployment and public release remain separately gated.

## Implemented candidate

- Account-scoped, concurrent personal-workspace bootstrap with tenant RLS
  preserved.
- Server-rendered overview, site, grant, activity, account, pairing and consent
  experiences using the Trust Rail visual system.
- Exact-Origin and double-submit CSRF protection for browser mutations.
- Public-mode configuration fail-closed checks and generic non-root OCI images.
- Temporary-credential-only AWS KMS contract for non-AWS production hosts.

## Evidence

| Gate | Result |
|---|---|
| TypeScript, ESLint and deterministic tests | pass; 55 pass, 12 expected live/database skips |
| PostgreSQL workspace/RLS/lifecycle suite | pass; 7 tests including 12-way bootstrap concurrency |
| Backup/restore and tombstone replay | pass; restored schema includes the workspace migration |
| Browser security regression | pass; exact Origin, CSRF, CSP and content-free output |
| Desktop visual review | pass; Trust Rail remains the single signature element |
| Mobile device emulation | pass; 390px viewport and scroll width both equal 390px |
| OCI build/runtime | pass; both images use `USER=node`, health checks and read-only imports; migration/KMS/app entrypoints are retained |
| Dependency audit | pass; no known vulnerabilities at the high threshold |
| SBOM/license verification | pass; CycloneDX 1.6 license profile, 293 components |
| Hosted AWS KMS | pass; GitHub OIDC single-key and two-key lifecycle jobs in run `37584349687` |

The cdxgen secure-mode environment audit repeats the accepted managed-runner
`NODE_PATH` High and outbound proxy Low advisories documented in Phase 2.0.6;
the generated SBOM passed repository verification. Neither advisory describes
runtime product code or stored application credentials.

Final domain, provider identity, legal URLs, region, retention and support
values remain a Phase 2.0.7B gate.

## Privacy review

The UI models use tenant, site, grant and content-free security-event views.
They do not render upstream identity subjects, session values, Bearer or
refresh tokens, WordPress content, or MCP inputs/results. The platform remains
an authorization control plane, not a content gateway.
