# Phase 2.0.7B1 Release Readiness Test Plan

## Deterministic gates

| ID | Case | Expected result |
|---|---|---|
| R01 | Local/test preview configuration | Placeholders are visibly allowed |
| R02 | Staging/production release metadata | Missing or placeholder values fail startup |
| R03 | Production AWS credentials | Static Access Keys fail startup |
| R04 | Non-AWS KMS identity | Workload OIDC or credential process is required |
| R05 | Readiness report | Contains categories only; no secret or path values |
| R06 | Liveness versus readiness | Liveness survives dependency failure; readiness returns 503 |
| R07 | Operations metrics authentication | Missing/wrong token returns generic 404 |
| R08 | Operations metrics privacy | No URL query, tenant, grant, token or content labels |
| R09 | Site detail | Exact tenant membership and resource binding required |
| R10 | Grant detail | Subject identifiers are never rendered |
| R11 | Activity filtering/pagination | Bounded, tenant-scoped and content-free |
| R12 | Compatibility page | Only evidence-backed versions are claimed |
| R13 | Browser controls | CSP, no-store, no-referrer and escaped output remain enforced |
| R14 | Responsive/accessibility | Keyboard, focus, reduced-motion and 390px layout pass |
| R15 | Portable OCI | Node 26.7, non-root, read-only imports and health checks pass |
| R16 | Regression and supply chain | Database/RLS, OAuth, audit, SBOM and high-risk audit pass |

## Live gates

- Phase 2.0.7A closeout uses GitHub OIDC to run both existing KMS jobs on
  `main`; no static AWS credential is used.
- Phase 2.0.7B2 will repeat browser OIDC, WordPress pairing, dual-KMS,
  backup/restore and direct Codex MCP acceptance after final production values
  and a staging host are selected.

Evidence may contain case identifiers, status, counts, versions and opaque
commit references. It must not contain tokens, cookies, identity subjects,
credential paths, WordPress content or MCP inputs/results.
