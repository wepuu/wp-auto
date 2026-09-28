# Phase 2.0.4 Token Lifecycle Validation

- Status: in progress
- Date opened: 2026-09-24
- Platform branch: `codex/phase-2-0-4-token-lifecycle`
- Connector branch: `codex/phase-2-0-4b-revocation`

## Evidence ledger

| Gate | Result |
|---|---|
| Contract and test plan | pass: ADR-009 and this phase test plan frozen before runtime changes |
| Platform deterministic suite | pass: pinned Node 26.7.0 container build, typecheck, lint, 50 tests (43 pass, 7 opt-in external skips) |
| PostgreSQL migration/replay/concurrency | pass: PostgreSQL 16 migration/RLS suite; simultaneous refresh has one winner, replay revokes exact grant and emits one event |
| Connector PHP test/lint/audit | pass: 518 tests / 3511 assertions; 167-file lint; no Composer advisories |
| Revocation delivery hardening | pass: fixed endpoint, 16 KiB bound, public-address revalidation, pinned address, private/empty DNS denial, failed-delivery deferral and no false acknowledgement |
| Cross-runtime signed revocation | pass on 2026-09-28: real AWS KMS signing, TypeScript outbox delivery over disposable Caddy HTTPS, PHP JWKS verification, and the connector's durable local grant deny marker completed; `LIVE_HTTPS_REVOCATION_DELIVERY=True`, `CONNECTOR_GRANT_DENIED=True`, and `CONTROL_PLANE_CONTENT_FREE=True` |
| Real two-key AWS KMS rotation | pass on 2026-09-28: pinned Node 26.7, real keys `wepuu-test-2026-01` (`.../40426a27-701e-4fd3-b17b-4345ed26e2c3`) and `wepuu-test-2026-02` (`.../3762ff1b-3974-4b37-8569-a68b906dee2a`), real public JWK publication, activation, retiring overlap, active-signer change and authoritative old-key removal against disposable PostgreSQL; 1 pass / 0 fail |
| Hosted CI | pending; commit, push, merge, and deployment were authorized on 2026-09-28 |
| Dependency/SBOM | pass: pnpm high-severity audit reports no known vulnerabilities; CycloneDX `PHASE_2_0_4_SBOM.json` generated |
| Cleanup and privacy review | pass: no tokens/content in state or evidence; temporary PostgreSQL/KMS/HTTPS resources removed; the live revocation run reported `HOSTS_RESTORED=True` and `TRUST_RESTORED=True`. A Windows PowerShell false failure caused by Docker writing its normal `Stopping` progress to stderr was corrected in the harness after cleanup completed. |

## Exit decision

Phase 2.0.4 is not yet accepted. Production deployment, merge, Phase 2.0.5
Bearer-to-MCP integration, and release work remain out of scope.

The SBOM generator reported the desktop runner's pre-existing `NODE_PATH` as a
high-severity environment-hardening warning and its configured HTTP proxy as a
low-severity network warning. These are not lockfile advisories and no project
secret was recorded; production/hosted CI must run with controlled module and
proxy environments. The pinned Node 26.7 run also emits oidc-provider's generic
non-LTS runtime warning even though the frozen suite passes; this compatibility
warning remains recorded for the final exit review.

The hosted workflow includes both Phase 2.0.4 branch triggers and a separately
gated `live-kms-rotation` GitHub OIDC job. The run remains pending until the
reviewed branch is pushed.
