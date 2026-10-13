# P3-B2A second WordPress Site deployment and isolation preparation

Date: 2026-10-13 (Asia/Shanghai).

## Scope and dependency

This is preparation only. No Site B deployment, DNS/Nginx/certificate change,
production pairing, Grant creation, Token issuance, lifecycle request, database
write/migration, Connector change or production-service restart was performed.
`design/` remains user-owned and untracked.

The initial candidate was stacked on PR #52 while #51/#52 were still open.
The operator subsequently explicitly authorized their integration and #53's
main-baseline update, but no production change. Integration results:

- PR #51 head `891b6f5e97b50d1b39dc721688c18cc51cb2d914` passed CI
  `38322032356`; its four documentation files had no review-thread blockers.
  Normal merge commit `74384c943d7decf3a32d4a92058e30adea850919` passed
  main push CI `38363220576`.
- PR #52 merged that main baseline, resolving only AGENTS/README/ROADMAP
  conflicts. It retained #51's independent production registration record and
  the later Desktop success as current state. Updated head
  `08ffc581b6876d1960902709878a94fb98444363` passed local checks (139 passed,
  zero failed, 18 environment-gated skips) and hosted CI `38363542769`.
  After reviewing its scripts, evidence and empty blocking-review/thread lists,
  it was marked Ready and normally merged as
  `b6ca20a86aabb022b22685b783364cb2f7c8e366`.
  Main push CI `38363965556` passed for that merge commit.
- PR #53 incorporated integrated main without force-pushing or re-copying
  #51/#52 files. Its main comparison remains exactly the seven second-Site
  template, script, test and deployment-document files. This update retargets
  its Base to main and keeps it Draft; no #53 merge is authorized. No Desktop
  code/history files remain in its main-relative changes.

P3-B1B's actual GUI success is recorded in
`P3B1B_CODEX_DESKTOP_PRODUCTION_ACCEPTANCE_2026-10-13.md`; it is not substituted
with historical CLI results. The separate #51 operation record must remain linked
after document integration. No real Desktop OAuth retry was performed during
integration; the production client registration and original Grant were not
changed.

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

## Authorized resource recheck: 07:32:59Z and 07:34:58Z

This later recheck read `/proc/meminfo`, memory PSI, vmstat, Docker stats,
cgroup v2 memory counters, process RSS/high-water marks and selected
`smaps_rollup` accounting fields. It did not read command arguments, process
environments, credentials, content or raw PHP mappings, and did not stop/reset
any process, cache, container, peak counter or Swap.

- RAM: 3915 MiB; first available sample 992.7 MiB, later snapshot 1023.8 MiB.
  Three subsequent two-second samples were 1009.7, 909.7 and 718.9 MiB.
  None reached the 1408 MiB default budget. Latest sampled deficit: 689.1 MiB.
- Swap used approximately 2440 MiB in the later snapshot (total about 3328 MiB).
  Short vmstat samples included a 2124 KiB/s swap-in interval and no swap-out
  in those interval rows. vmstat's first row summarizes time since boot and is
  not an instantaneous rate.
- Memory PSI initially had `some avg10=0.00, avg60=0.02, avg300=0.06` and
  `full avg10=0.00, avg60=0.02, avg300=0.05`. These short samples do not prove
  sustained severe pressure, absence of future pressure or a memory leak.
- Cached pages were about 865.5 MiB, reclaimable slab about 180.5 MiB,
  and shared memory about 134.9 MiB in the later snapshot. Do not add these
  numbers again to `MemAvailable`: that estimate already considers reclaim.
- Disk remained about 15.8 GiB available. Port 3201, candidate project,
  directory, network name/subnet and volume prefix still had no observed
  conflicts in the inspected inventories/routes. These are not reservations.
- All five WPAuto/Site A containers stayed healthy on their existing images.
  Control remained on the unchanged digest
  `sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`.
  Authorization remained
  `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
  No database query/migration or WordPress mutation was needed in this recheck;
  the migration/client/Grant facts above remain their prior timestamped evidence,
  not a newly executed database verification.

The following cgroup readings are in MiB. Current usage includes charged file
cache and can exceed Docker stats' displayed usage; the readings were sequential,
not simultaneous. Peak is the retained cgroup high-water mark, not measured
concurrent demand. Peaks must not be summed as if they occurred together.

| Container | Current charged | Recorded peak | Cap |
|---|---:|---:|---:|
| WPAuto Control | 19.4 | 114.5 | 256 |
| WPAuto Authorization | 70.6 | 117.9 | 256 |
| Site A WordPress | 53.4 | 414.3 | 512 |
| Site A MariaDB | 19.7 | 158.0 | 384 |
| WPAuto PostgreSQL | 25.5 | 92.3 | 384 |
| tikdd admin | 28.5 | 209.0 | 384 |
| tikdd admin-api | 101.5 | 239.9 | 384 |
| tikdd web | 105.3 | 252.6 | 384 |
| tikdd worker | 106.5 | 370.4 | 384 |
| tikdd ytdlp-runner | 64.0 | 637.3 | 768 |
| tikdd ytdlp-pot-provider | 65.6 | 166.9 | 384 |
| tikdd cobalt-api | 60.2 | 108.5 | 512 |
| tikdd delivery | 32.2 | 196.1 | 320 |
| tikdd api | 28.9 | 239.2 | 320 |
| tikdd redis | 12.1 | 19.3 | 192 |
| tikdd PostgreSQL | 37.3 | 70.5 | 512 |

All inspected containers reported `OOMKilled=false` and restart count zero.
That current flag/count is not an exhaustive historical OOM audit.
The nearby Docker stats readings showed WPAuto/Site A between about 14 and
55 MiB, explaining why idle usage alone is insufficient for deployment sizing.

Major process observations:

- Highest observed `mysqld` RSS about 179 MiB, lifetime RSS peak about 256 MiB;
  its later PSS was about 187 MiB.
- Top PHP-FPM RSS samples were roughly 166–178 MiB each, with lifetime RSS
  peaks about 179–182 MiB. RSS contains shared pages, so adding those RSS values
  would overcount memory.
- All 31 observed PHP-FPM processes aggregated about 1330 MiB PSS and
  1202 MiB private resident pages. Their application/pool ownership and traffic
  requirement were not established; they cannot be declared unnecessary tests
  or leaks from names/RSS alone.
- No process-name match for `pg_restore`, `pg_dump`, `wp`, standalone `php`,
  `tsx` or `pnpm` was found in the utility sample. This narrow check is not proof
  that no test workload exists. No safe-to-stop leftover process was confirmed.
  A separate owner-led review of PHP-FPM pool/workload sizing and the other
  worker's high-water usage may be useful; it is not part of this task and no
  changes or terminations were performed.

Accounting references: [Linux /proc documentation](https://docs.kernel.org/filesystems/proc.html)
and [cgroup v2 memory counters](https://docs.kernel.org/admin-guide/cgroup-v2.html).

### Budget conclusion

Site B caps remain WordPress 512 MiB + MariaDB 384 MiB = 896 MiB, plus the
512 MiB reserve = 1408 MiB required before deployment. WP-CLI's separate
128 MiB cap requires at least 640 MiB available when launched after deployment;
if budgeting all three together before startup, reserve 1536 MiB. No cap was
reduced and no Swap, safety limit or existing workload was modified.

An **8 GiB RAM VPS, retaining at least the current four vCPUs**, is the practical
capacity recommendation based on these observations, not a vendor guarantee or
kernel requirement. A 6 GiB size could bridge the sampled deficit but offers less
headroom for existing PHP/worker bursts and the new instance. Recheck actual
capacity/pressure after any separately approved resize; do not assume adding RAM
alone proves readiness. No provider, paid plan, resize or reboot was selected or
performed. Current `P3B2_DEPLOYMENT_PREFLIGHT_PASS` stays False solely on the
observed capacity shortfall once GitHub integration/CI completes.

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
one-use local HTTP handoff instead of opening a browser. The initial candidate
head `a8b4f3a…` passed hosted CI `38361022016`. After main integration, the
32 focused regressions/Compose render and full `pnpm check` were rerun with
the same passing totals. New-head hosted CI is awaited after this record is
pushed; its exact result is reported on PR #53 without assuming the old-head
run proves the new head.
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
