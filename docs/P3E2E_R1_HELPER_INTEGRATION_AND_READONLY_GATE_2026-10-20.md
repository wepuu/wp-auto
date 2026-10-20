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
