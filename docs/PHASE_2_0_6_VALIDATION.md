# Phase 2.0.6 Security and Resilience Validation

Status: local implementation, deterministic validation, real local KMS/HTTPS,
Codex interoperability and temporary-state cleanup complete; hosted KMS and
final available-capability review gates remain open. No production deployment
or Phase 2.0.7 work is authorized.

## Candidate branches

- Platform: `codex/phase-2-0-6-security-resilience`
- Connector: `codex/phase-2-0-6b-connector-resilience`

## Current evidence

| Gate | Result | Evidence |
|---|---|---|
| Platform typecheck, lint, unit and database suites | pass | `pnpm check`; 60 tests, 55 pass, 5 existing opt-in skips; shared DB tests run serially |
| Platform dependency audit | pass | `pnpm audit --audit-level high` |
| Deletion lifecycle | pass | account, tenant, site revoke/purge, sole-owner refusal and preservation tests |
| PostgreSQL backup/restore | pass | `BACKUP_RESTORE_PASS=True` |
| Tombstone replay | pass | `DELETION_TOMBSTONE_REPLAY_PASS=True` |
| Platform SBOM/license metadata | pass | cdxgen 12.8.4, CycloneDX 1.6, 293 components, license-compliance profile |
| Connector PHPUnit | pass | 530 tests, 3,621 assertions |
| Connector WPCS | pass | `composer lint` |
| Connector Composer manifest | pass | `composer validate --strict --no-check-all` |
| Connector Composer audit | pass | no security vulnerability advisories |
| Connector release package | pass | 789 archive entries; temporary package removed after verification |
| Real two-key KMS | local pass; hosted pending | `LIVE_KMS_ROTATION_PASS=True`; the sequential wrapper had already passed the single-key contract and returned `AWS_CREDENTIALS_CLEARED=True`; hosted GitHub OIDC dispatch remains pending |
| Real HTTPS WordPress/Bearer regression | pass | OAuth fixture seeded; Node 26.7 services healthy; PRM, 401 challenge, two-KMS Bearer read, scope denial and control-plane content boundary passed |
| Codex OAuth/direct MCP regression | pass | isolated OAuth login, direct `wp-auto-site-health`, content-free control logs/database and Codex user-auth hash restoration passed |
| Temporary-state cleanup | pass | `HOSTS_RESTORED=True`, `TRUST_RESTORED=True`; fixture state/certificate, pending URL, result and isolated Codex homes absent; compose project has no running containers |
| Available-capability working-tree diff review | pass (pre-immutable baseline) | Platform and connector Codex Security diff scans completed with complete coverage and no reportable findings; immutable SHA review remains required |
| Restricted TAC/Daybreak review | waived/not executed | ADR-013; service access is unavailable, project owner accepts the residual risk, and no scan result is represented as a pass |
| Final available-capability review | pending | immutable candidate diff, threat-model and data-flow review; executed Critical/High/Medium findings remain blocking |

## 2026-09-30 local revalidation

- `pnpm check`: 49 environment-independent tests passed; 11 opt-in tests
  skipped. PostgreSQL follow-up runs passed two isolation/refresh tests and four
  deletion-lifecycle tests, giving 55 non-live passes and five retained
  live/interoperability skips.
- PostgreSQL backup/restore and deletion replay returned
  `BACKUP_RESTORE_PASS=True` and `DELETION_TOMBSTONE_REPLAY_PASS=True`; the
  disposable database container, volume, and network were removed.
- `pnpm audit --audit-level high` found no known vulnerabilities.
- The pinned cdxgen 12.8.4 output passed repository verification with 293
  components. Its secure-mode environment audit reported `NODE_PATH` as High
  even after the caller removed it; direct parent, Node, `pnpm exec`, and fixed
  `pnpm dlx` probes all reported the variable absent. This is disposed as a
  scanner-process environment advisory rather than a product finding. Hosted
  CI additionally fixes `NODE_PATH` to an empty value. The HTTP proxy advisory
  is Low and accepted for the managed execution environment; no credential or
  application content is included in the SBOM.
- Connector revalidation passed 530 PHPUnit tests with 3,621 assertions, 178
  WPCS checks, strict Composer manifest validation, and Composer audit with no
  security advisories.
- The available-capability working-tree review found and resolved two scoped
  lifecycle defects: site deletion no longer removes another site's OAuth or
  idempotency artifacts (Medium, resolved), and account deletion now permits a
  co-owner when another active owner remains (Low, resolved). Targeted database
  regression tests pass. The final review remains pending until immutable
  candidate commits exist.
- The local one-hour STS wrapper subsequently passed the single-key contract
  and real two-key lifecycle, then returned `LIVE_KMS_ROTATION_PASS=True` and
  `AWS_CREDENTIALS_CLEARED=True`. The wrapper cannot reach the rotation marker
  unless the preceding single-key gate succeeds. No credential value is stored
  in this record. Hosted GitHub OIDC remains pending.
- The retained real HTTPS regression returned
  `LIVE_OAUTH_FIXTURE_SEEDED=True`, `LIVE_OAUTH_SERVICES_STARTED=True`,
  `LIVE_HTTPS_PRM=True`, `LIVE_MISSING_TOKEN_CHALLENGE=True`,
  `LIVE_TWO_KMS_BEARER_READ=True`, `LIVE_BEARER_SCOPE_DENIAL=True`, and
  `CONTROL_PLANE_CONTENT_FREE=True`. Both KMS-signed tokens reached the
  WordPress resource directly; the disposable Bearer image was removed.
- On 2026-10-05 the isolated Codex regression returned
  `CODEX_OAUTH_LOGIN=True`, `CODEX_DIRECT_WORDPRESS_MCP=True`,
  `CONTROL_PLANE_LOG_CONTENT_FREE=True`,
  `CONTROL_PLANE_DATABASE_CONTENT_FREE=True`, and
  `CODEX_USER_AUTH_RESTORED=True`. The one-time authorization URL, trace and
  isolated Codex home were removed by the harness.
- Final fixture removal returned `HOSTS_RESTORED=True` and
  `TRUST_RESTORED=True`. Follow-up checks found no fixture state, copied CA,
  pending authorization URL, result file, isolated Codex home, or running
  compose service.
- The available-capability working-tree diff reviews completed on 2026-10-05
  with complete coverage and no reportable findings. The platform report is
  retained at the Codex Security scan artifact `dae86fe5-a829-46ad-a3c1-c68774c9c05b`;
  the connector report is retained at `d99f226c-931e-4cac-aa45-ea36fb06d46c`.
  These are pre-commit working-tree snapshots and do not replace immutable
  candidate reviews.

## Scope and privacy checks

The new lifecycle reports contain only job/scope placeholders, status,
timestamps, and record counts. Tombstones contain opaque control identifiers
only. The backup/recovery harness does not inspect or store WordPress content,
MCP request bodies, tokens, cookies, or upstream identity subjects.

Phase closure requires all cases in `PHASE_2_0_6_TEST_PLAN.md`, the final
available-capability review, the retained Phase 2.0.5 live gates, and
temporary-state cleanup. This document must be updated with immutable commit
IDs and final evidence before requesting Git landing approval.

ADR-013 removes only the unavailable TAC/Daybreak service from the exit gate.
It does not waive any runtime security control or executed finding. Unresolved
Critical, High, or Medium findings from an available check block closure.
