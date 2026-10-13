# P3-B2A second WordPress Site deployment and isolation preparation

Date: 2026-10-13 (Asia/Shanghai).

## Scope and dependency

This is preparation only. No Site B deployment, DNS/Nginx/certificate change,
production pairing, Grant creation, Token issuance, lifecycle request, database
write/migration, Connector change or production-service restart was performed.
`design/` remains user-owned and untracked.

PR #51 (`891b6f5e97b50d1b39dc721688c18cc51cb2d914`) remains open/non-Draft;
its head CI run `38322032356` passed. PR #52
(`1e10dd9cf79197b8f05b5e3c144e21cfc1eb1c66`) remains open/Draft;
its head CI run `38356071724` passed. Both target main `d0a350d8…`.
No merge authorization was inferred from this preparation task. Integrate #51's
independent production callback record first, then update #52 against main,
retaining its later real Desktop success as current status and every historical
failure as historical evidence. Review the updated head/CI before removing Draft
and obtain explicit merge approval. This candidate is temporarily stacked on
#52's head; it must be retargeted to integrated main after those dependencies land.
It does not claim that the integrated-main prerequisite has completed.

P3-B1B's actual GUI success is recorded in
`P3B1B_CODEX_DESKTOP_PRODUCTION_ACCEPTANCE_2026-10-13.md`; it is not substituted
with historical CLI results. The separate #51 operation record must remain linked
after document integration.

## Read-only production evidence

The plan-review SSH checks on 2026-10-13 at `06:41:42Z` and the subsequent
read-only metadata query established the following. These are timestamped
samples, not a reservation or a promise that resources remain free at deployment.

- Project Control, Authorization, PostgreSQL, test WordPress and MariaDB healthy.
- Migration ledger: 13 rows, last `013_email_otp_login.sql`.
- Both `wepuu-e2e-codex` and `wepuu-e2e-lifecycle` active.
- One active Site; lifecycle live Grant count zero.
- Original `grant_Q0YY…GETM` active, unchanged
  `updated_at=2026-10-12 12:03:49.698212+00`, no revocation reason.
- Port 3201 absent from observed TCP listeners; `172.30.52.0/24` did not
  overlap observed Docker networks or host routes. Candidate project, directory,
  network and volume prefix were unused in the inspected inventory.
- Site A runs the exact WordPress/MariaDB image digests reused by the candidate.
  Clean Connector archive SHA-256 is
  `f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
- VPS: four CPUs, 3915 MiB total RAM, sample 1060 MiB available RAM,
  approximately 15.8 GiB available disk, inode usage 24%. Swap usage was
  approximately 2434 MiB; project containers had no observed OOM kill/restart.
- Site B's standard host directory, dedicated Nginx vhost and certificate
  file were absent. This does not prove no wildcard certificate exists elsewhere.
  DNS ownership/configuration, external HTTPS and certificate renewal were not
  validated.

The default new-service caps total 896 MiB plus a 512 MiB reserve, requiring
1408 MiB `MemAvailable`. The sampled 1060 MiB does not meet that conservative
condition. This is a preparation blocker, not proof that idle Site B cannot run.
Do not stop unrelated services, change their limits or silently reduce Site B
caps. Capacity must be rechecked before any later deployment or on-demand WP-CLI.

## Implementation and data-flow boundary

- Dedicated Compose candidate: separate project/database/users/volumes/network,
  loopback port 3201, pinned images, same validated long-running resource caps,
  independent required credential variables and on-demand read-only-artifact
  WP-CLI. No Site A file or existing container configuration was modified.
- Memory-only isolation validator: fixed issuer/client/resources, explicit
  execution flag, same account/Tenant, two normal PKCE S256 callback flows with
  issuer/state validation, JOSE signature and exact claim checks. No Codex
  credential read, original Grant Token extraction, Refresh, Replay or Revocation.
- Local one-use browser handoff carries authorization parameters only in memory;
  the OS opener receives only its loopback launch URL (Windows uses stdin). No full
  authorization URL, callback/code/verifier, Token or MCP body is printed.
- A 45-second matrix requires both Tokens to retain at least 60 seconds.
  Cross-site initialize requests have no shared MCP Session header and reject
  redirects. Only HTTP 401 plus a Bearer `error="invalid_token"` qualifies.
  Correct-site checks run before and after; expired Tokens, HTTP 403/429,
  transport failure or timeout cannot substitute for an isolation pass.
- Output is booleans/fixed classifications and short SHA-256 Grant identifiers.
  MCP requests/results remain exclusively in the local client-to-WordPress
  process; they do not enter control-api or authorization-service.
- Same-account/same-Tenant resource/site/Grant combination isolation is the
  acceptance boundary. Neither independent tenant proof nor actual selective
  revocation propagation is claimed; retained automated claim/RLS tests and
  P3-A G1/G2 evidence cover their previously demonstrated contracts.

## Validation

Focused tests: 32 passed, zero failed/skipped (original lifecycle tests included).
These cover real local HTTP matrix requests and callback listeners, real Node
Response objects, JOSE claim mismatches, exact tool order, independent MCP
Session headers, one-use browser handoff, access-only authorization-code
exchange, unsolicited Refresh rejection, deadline/expiry/network handling,
fixed safe CLI errors, template identity and Docker Compose rendering with dummy
credentials. No production endpoint was used by these tests.

The first Compose assertion exposed that this local Compose represents memory
limits as decimal strings. The assertion now normalizes the rendered numeric
value; no runtime resource cap changed. Full `pnpm check` passed: 155 passed,
zero failures and 18 environment-gated skips (173 total), including typecheck
and lint. The known Windows HTTPS-fixture module lookup workaround was confined
to the check process's system-only `PSModulePath`; TLS checks were not disabled.
Syntax and diff-format checks passed. Native OS browser opening is reserved for
the later approved run; fixture tests inject an opener and validate the actual
one-use local HTTP handoff instead of opening a browser. Candidate hosted CI
remains pending at this draft.
Real Site B HTTPS, pairing, two production Grants,
cross-site Token requests, Application Password regression and revocation
propagation isolation were not run.

## Next approvals and recovery

After dependencies/CI and resource checks pass, request approval only for fresh
prechecks, owned ingress backups, Site B directories/credentials/containers,
the clean fixed Connector install in disabled/disconnected state, and its own
DNS/vhost/certificate operations if public ingress is needed. Validate existing
services remain unchanged. A later separate approval is required for formal
pairing and both normal Grant/Token flows plus the isolation matrix.

If deployment fails, stop only Site B containers, restore only the operation's
owned ingress configuration and retain volumes. No `down -v`, whole-database
restore, manual Grant/state repair or history deletion. Later test Grants are
not automatically revoked; cleanup is separately approved. Site B can be reused
for P3-B3, which remains outside this task.

```text
P3B2_DEPLOYMENT_PREFLIGHT_PASS=False
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
