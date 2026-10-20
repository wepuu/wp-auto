# P3-E2E-R1: helper integration and single read-only gate

## Authority and historical baseline

The operator requested implementation of the reviewed R1 plan: complete offline
helper integration, then (only after all mandatory tests pass) one immediate
read-only preflight. This does not authorize Desktop enable, production OAuth,
Consent/token exchange, MCP JSON-RPC/tools, OTP, pairing, deployment or migration.

Draft PR #95 preserves the previous stopped attempt, Head
`a9a0618c8cf8a265a618978ab79e68ebc9eb63f3`; CI 39415084411 succeeded. That PR
contained a document, not executed helper integration. Its broad remote
`state / NOT_CONFIRMED` result is not retroactively rewritten as a traced remote
exception or production OAuth fault. PR #94's earlier window PASS remains history.

## Change and data-flow boundary

This candidate adds acceptance-only Python projections/orchestration, a SQL
template, a PHP read-only local mapping projection, bounded Node transport and
aggregation, and reproducible tests. The E2C -> E1K nested `m.closed_probes`
interface is exercised through the complete explicit dependency adapter.
Before-checks require zero target Grants. After-checks (offline fixtures only
in R1) allow exactly one fully bound new Grant and retain all prior protected
rows. Existing application contracts and production historical helpers are not
edited, and no runtime dependency, schema or migration is introduced.

The SQL template checks SELECT/RLS visibility and read-only context, all Site
states for the exact resource, all related Grant states, exact read scope, and
Provider Grant identity/resource/account/client/tenant partition/expiry/type.
Only fixed booleans, counts, approved scope names and hashes are projected.
No Token/secret-artifact payload or complete Provider payload is returned.

The PHP reader uses literal-family prefix matching and SELECT-only methods;
it does not call Connector stateful loaders, Consent, identity creation or Proof
methods. The original adapter preserves its read-only transaction and identity
gates. Local user existence is not an independent browser-user match.

The platform is not used as an MCP gateway. No WordPress content, tool input
or tool output enters the control plane through these checks. All fixtures use
synthetic `.example.test` bindings. Private production bindings, original project
configuration, historical helper bundles and actual receipts remain uncommitted.
The new files under `scripts/` are not copied by the runtime Containerfiles.

## Local validation

The operator started Docker Desktop. The first read-only engine check reported
unavailable; the later check succeeded with engine 29.8.0. Only an owned,
labelled temporary PostgreSQL container with a loopback-published port and no
production mounts was created. It uses database `wepuu_e2e_r1` and synthetic
credentials. No production database is used for query development.

Results for the candidate:

| Validation | Actual result |
| --- | --- |
| Python dependency/orchestration/failure/mapping/adapter tests | 12 test methods PASS, including adversarial subcases |
| Bounded local child-process, correlation, output filtering and aggregation | 12 tests PASS |
| Actual PostgreSQL 16.10 query integration, migrations 001-013 + 015 | 24 cases PASS |
| PHP mapping projection, local CLI 8.4.24 | 15 cases PASS, not the production-version result |
| PHP mapping projection, fixed PHP 8.2.28 OCI digest | 15 cases PASS |
| Fixed installed Desktop backend loopback parameter probe | 2 branches PASS; no authorization submission or token exchange |
| `pnpm check` on Windows | typecheck/lint PASS; tests 205 PASS, 1 FAIL, 22 SKIP |

The SQL test obtains the synthetic persisted Grant from the actual locked
oidc-provider `Grant.save()` path, not a hand-written guess of its payload.
Cases cover non-read scope, wrong account/client/Grant/resource/model/tenant,
multiple resources, rejected/OIDC fields, stale or missing Provider storage,
pending/suspended/revoked Grants, multiple business Grants, insufficient RLS
visibility, permission denial, read-only write rejection and statement timeout.

The fixed PHP image is
`php@sha256:4bbc4316a5b4acd689fe791603d5340bed9184d6cb4303c070cf5630711e609a`.
It reported PHP 8.2.28 and ran with network disabled and a read-only fixture
mount. Neither PHP test bootstrapped WordPress or connected to a real database.

The installed backend is `codex-cli 0.163.0-alpha.10.2`, SHA-256
`f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312`.
Its loopback mock advertises five resource scopes plus OIDC scopes. Both the
configured-only and explicit read-scope branches generated only `mcp:read`,
code/S256, the correct synthetic resource and stable callback with a dynamic
loopback port. It used isolated config/environment, not real credentials.
This is parameter compatibility, not actual Desktop GUI OAuth/MCP acceptance.

The Windows full-check failure is the retained HTTPS fixture's inability to
load `Microsoft.PowerShell.Security`/the `Cert:` provider for a synthetic
self-signed certificate. It is not classified as an application regression or
silently skipped; no TLS validation was disabled. Database-dependent tests
were skipped in that particular command because it had no general test database
URL; the dedicated R1 SQL test above actually ran in its separate database.

## Hosted validation and stage B stop

The new read-only-permission workflow explicitly runs Python integration,
bounded transport/aggregation, actual isolated PostgreSQL and fixed PHP 8.2.28
projection tests. It has no production secrets or registry-write permission.
The retained full platform CI remains required and is tracked separately.

At this document commit, Hosted results are pending and stage B is NOT_RUN.
No production connection has been made during R1. Stage A is not declared
complete solely because local test subsets passed. The final result, immutable
Head/CI and any separately acquired immediate gate evidence will be appended
without overwriting this history.

```text
P3E2E_HELPER_INTEGRATION_PASS=NOT_CONFIRMED
P3E2E_IMMEDIATE_GATE_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Only a complete new gate can set preflight PASS. Session loss, binding/config
drift, resource failure or any unconfirmed mandatory item stops this attempt.
There is no automatic OTP recovery, threshold change or production rerun.
Even a successful R1 gate must stop before enable and obtain fresh formal
execution approval. `design/` and the original dirty worktree remain untouched.

## Subsequent validation and stopped live attempt

The shared implementation at `5640e2df6a28f2f84f59336636840b523e96ed5b`
passed both Hosted workflows:

- helper integration: **39420075796 Success**, with Python, actual PostgreSQL,
  locked Provider serialization and fixed PHP 8.2.28 steps actually executed;
- retained platform: **39420076061 Success**, including strict checks, database,
  OCI, backup, audit, SBOM and retained OAuth conformance gates.

The shared Python tests increased to 14 methods for original legacy resource
failure projection and missing-diagnostic handling. Only reviewed `mem`/`psi`
values from the original gate are used; no later snapshot fills that receipt.
Private fixed-host glue passed 3 local mocked integration tests; its final
allowlist projection passed 2 local tests. Neither accesses production.

The operator confirmed both account contexts and PuTTY readiness. A new run
`r1-daabf5e84bf4dea3` was frozen with identity-manifest SHA-256
`7aab15b38a3d1b800d620fe99051c53a6e7d6975a48ddea8743032c553caa792` and
streamed payload SHA-256
`208eaaa9abb0a0cec0221c678ff731827e449ca65392c0e6572819451fed4dae`.
No files were written on the production hosts by the adapter. It reused
hash-verified read-only definitions in memory; it did not execute or reset the
consumed historical launcher's once-only marker.

Two read-only production stages executed:

| Stage | Server receipt UTC | MemAvailable KiB | memory full avg10 | Result |
| --- | --- | ---: | ---: | --- |
| Initial resource/services | 2026-10-20T12:17:49.318213Z | 1055196 | 0 | PASS |
| Single complete platform gate | 2026-10-20T12:18:22.117040Z | 1025564 | 0 | PASS |

These correspond to 20:17:49 and 20:18:22 Asia/Shanghai. The latter finished
37.850 seconds after the pre-recorded monotonic observation start. The
complete platform invocation retained `runtime_protections`, confirmed the
original account Session/owner, zero target Grants, healthy fixed containers,
actual/persisted mail pause and ingress guards. Its protected business digest
was `860633ccf1ad343f0cf189d02f4be32846890d6981696aa0d223d6f055f15b9a`.
Its container hash uses compact sorted JSON and must not be compared directly
with older receipts using different JSON whitespace conventions.

Receipt hashes:

- resource: `0a4f5b6a2ccbf60480d3762a0ff38b2e273633328ede08c8ffe1da5c6503283c`;
- platform: `2cbaaaa2dbf98ab5d6723475098c7b3bacdf5f300cbd722e79da89bec1b742bb`.

### Execution-order deviation and stop

An additional syntax check of the **final generated full PHP adapter** was
launched locally through Docker stdin. It had not completed when the two live
read-only stages were started, and subsequently timed out at 30 seconds. This
last prerequisite should have been completed before the first production
read. Starting the two stages before awaiting and checking every local
completion was an execution-orchestration mistake, not a production fault.

The run was stopped before Metadata, Desktop recheck, WordPress and ending
checks. They are **NOT_RUN**. The early platform PASS receipts do not make the
complete immediate preflight pass. No automatic replay or continuation followed.
The stop receipt SHA-256 is
`c0a9642884b852f01612680f9a5541ff3263269ec6532cf5dfc565da702e1515`.

After stopping, an offline-only check of the same generated PHP source via a
read-only file mount passed `php -l` on the fixed PHP 8.2.28 image. Generated
PHP SHA-256 was
`837f4c50169316669b748670b5eb114302c5d17c7e867bc40c092e974a310a6d`.
This distinguishes an unconfirmed stdin execution path from an actual PHP
syntax rejection; it does not independently establish the underlying Docker
timeout cause. It does not retroactively repair the observation order or
authorize resuming the stopped run.

A mandatory prerequisite validator and regression were then added locally:
missing, failed, pending, late-completed or wrong-source checks must block the
first live read. Candidate Head and final-PHP source identity must match. The
Node suite is now **13 tests PASS**. This guard is a requirement for a later
dispatcher, not a claim that the historical consumed dispatcher had it or that
this run was resumed. No subsequent live connection was made.

Final local configuration checks retained the original disabled project hash
and user config hash
`8e6aea6411c0e9a296b0f8dffe7ab8c0933db451ca759468d8da0f205b3651a0`.
The two owned temporary SQL containers were stopped after their fixture runs;
no final syntax-test container remained. No other local or production service
was stopped or restarted by this operation.

### Final bounded conclusion

Shared/helper offline validation is complete, including the subsequent final
generated PHP syntax check. The **complete immediate production gate is not**.
WordPress's current NTP, clock comparison, identity, local mapping and backup
were not newly observed in this run. The two platform observations are bounded
to their times; they are not an enduring health guarantee or an OAuth request
approval. No new current target Grant status is inferred beyond the observed
zero count at the completed platform stage.

```text
P3E2E_HELPER_INTEGRATION_PASS=True
P3E2E_IMMEDIATE_GATE_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The earlier pending-stage block remains as an initial snapshot. This block
records the actual final attempt without overwriting the original evidence.
Final candidate CI is tracked independently after this ordinary append commit.
Any later gate requires a new reviewed dispatcher/run, all offline completions
before its start, and fresh account preparation. This run's stop and markers
must not be cleared to obtain a retry. Formal OAuth remains separately gated.
