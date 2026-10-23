# P3-E2S-R4B-R10 isolated regression stopped at unit

## Outcome

R10 preparation and same-source three-role build completed. The one formal run
passed the offline harness, then stopped at `unit` with `UNIT_FAILED`. Exact failing
test/transport branch is **NOT_CONFIRMED**: the retained unit result has no structured
report. No fix/rebuild/rerun followed that failure. Do not label this an application
regression, a passing unit suite, or a completed database/A/B acceptance.

All changes in the execution source are test fixtures, local tooling and documentation.
`apps/`, database/provider implementation and migrations are byte-identical to R9.
No production host, real mail, Desktop, WordPress or external MCP was accessed.

## Source and local preparation

- R9 base: `7f61523921f792f4e27f9fb75ff8b5024011afc6`.
- Frozen execution revision: `c404ed52228ce5492a85674547998d2f5d31772e`.
- Worktree: `D:\Codex项目\wp-platform\.tmp\p3e2sr4b-review`.
- Branch: `codex/p3e2sr4b-source-integration`.
- Execution contract: `P3E2S_R4B_R10_EXECUTION_CONTRACT_2026-10-24.md`.
- Local Node26 pure tooling tests:34 passed,0 failed,0 skipped. This is not Node24
  application acceptance. Syntax and `git diff --check` passed before freezing.

Prepared: exact16-file Authorization profile adapters; explicit candidate/retained/
Console database manifests; consumed native Code parent for the legacy Refresh
fixture; classification/payload/link and inactive-binding storage tests; HTTP
classification checks; stronger startup ACL/function fingerprint; closed unit file
manifest and fixed-schema evidence exports. These changes are **not fully validated**
because execution stopped before the required later checks.

Historical R8 assertions remain in a version-scoped characterization file; current
R9 assertions are not deleted. The removed inherited `.test.mjs` filename is removed
only inside the new image build, not from an unrelated host directory.

An initial manifest write was rejected for possible production-test inclusion.
Read-only review confirmed injected request/admin/process mocks, loopback-only real
listeners and guarded CLI entrypoints. It was allowed after those checks. Unit
containers used network none, no host ports, no credentials or Docker/SSH socket
mounts, and a restricted child environment. Production names/URL constants in those
synthetic tests do not constitute production acceptance.

## Single offline build

UTC: `2026-10-23T16:07:59.472Z` to `2026-10-23T16:08:39.357Z`.
Monotonic duration:39884ms. Exactly one build per role, no install/pull/push.

| Role | Local tag | Loaded immutable image ID (OCI index) |
| --- | --- | --- |
| Test | `wepuu-r10-test:c404ed52228c-ca606f8b344a` | `sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c` |
| Authorization | `wepuu-r10-authorization:c404ed52228c-ca606f8b344a` | `sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f` |
| Control | `wepuu-r10-control:c404ed52228c-ca606f8b344a` | `sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c` |

Parent IDs and dependency-input hashes matched before/after. Build and full
apps/packages lint passed on Node24.22.1. Three probes matched:

```text
Node=v24.22.1 / LTS=Krypton / UID=1000
compiled file count=163
compiled SHA-256=e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
```

Authorization and Control retain `USER node` and exact direct-main commands;
Test defaults to the test role. These are locally derived regression artifacts,
not promoted release images. No actual service startup acceptance occurred.

Build evidence remains private at:
`C:\Users\liulo\AppData\Local\Temp\wepuu-r10-build-Riuj7I`.
Only typed result/artifact metadata was read; raw build logs were not exported.

## One formal run and exact stop

Run ID: `28761990e714`.
UTC: `2026-10-23T16:09:00.687Z` to `2026-10-23T16:09:21.521Z`.
Overall monotonic duration:20831ms.

| Stage | Result | Evidence |
| --- | --- | --- |
| Source, local context, images and compiled identity | PASS | Exact revision and IDs verified |
| Offline harness | PASS | 6886ms;3 recorded groups passed, syntax/fixture/order checks |
| Full offline unit | FAIL | 7591ms; container exit1, fixed category `UNIT_FAILED` |
| Specific failing test / reporter or process branch | NOT_CONFIRMED | No retained structured child report |
| Candidate and historical-profile DB regression | NOT_RUN | Stopped before DB setup |
| Separate Console014 regression | NOT_RUN | No014 executed |
| Authorization / Control actual startup | NOT_RUN | No DB created |
| A/B persistent HTTP and Refresh matrix | NOT_RUN | Earlier stop |
| B-stop→A transition | NOT_RUN | Earlier stop |

The volume's fixed unit result was read once through a network-none, read-only
projection. It confirmed `passed=false`, `category=UNIT_FAILED`,
`structuredReportPresent=false`, `rawOutputSuppressed=true`. No original exception,
raw test output, actual/expected value or credential was printed. Exported safe
unit evidence intentionally contains only failure status, not invented diagnostics.

Static review shows the unit wrapper only retains a report when a caught error's
stdout is a complete parseable approved JSON value. Other failure branches collapse
to `UNIT_FAILED`; this is a diagnostic gap, not proof of which branch ran. With
Docker log driver `none` and no saved raw child output, do not reconstruct or claim
the missing first failure. No diagnostic test replay was performed.

## Isolation, resources and cleanup

Five run-owned containers were stopped and verified:

```text
wepuu-persistent-identity-authorization-28761990e714
wepuu-persistent-identity-control-28761990e714
wepuu-persistent-identity-test-28761990e714
wepuu-persistent-offline-28761990e714
wepuu-persistent-unit-28761990e714
```

Offline exited0; unit exited1; both `network=none`, `log=none`. No run-owned running
container remained at postcheck. No PostgreSQL container, internal network or data
volume was created. Only `wepuu-persistent-evidence-28761990e714` was retained.
The later read-only evidence projection container used `--rm` and exited normally.

D: free bytes before build6383816704; after build/formal stop6350262272. Initial5GiB
and later2GiB gates passed; no cleanup, global Docker change or compaction occurred.

Private execution evidence:
`C:\Users\liulo\AppData\Local\Temp\wepuu-persistent-ysFpvf`.
Raw/private files and the evidence volume must not be uploaded. Safe result records
do not replace the unavailable detailed test report. No registry push, hosted CI,
PR creation or merge occurred in this run.

## Minimal follow-up, not executed

First repair and synthetically test the **local reporting path**, preserving the
already-parsed report across assertion failure and using a dedicated bounded
structured result channel rather than assuming all package-manager stdout is JSON.
Capture only approved failure categories/counts/locations and process completion;
do not start retaining raw secrets or weaken pass criteria. Cover malformed/prefixed
stdout, nonzero exit, parsed failing report, missing report, reporter exception and
timeout. The exact original unit failure remains NOT_CONFIRMED.

After that offline review, obtain a separately bounded rerun decision. Do not rerun
this unit invocation, modify the application, rebuild images or proceed to DB/A/B
as part of the already-stopped attempt. Console014 remains separately scoped.

## Actual state

```text
P3E2SR4BR10_TEST_PROFILE_ADAPTATION_PASS=NOT_CONFIRMED
P3E2SR4BR10_SAME_SOURCE_IMAGE_BUILD_PASS=True
P3E2SR4BR10_OFFLINE_HARNESS_PASS=True
P3E2SR4BR10_OFFLINE_UNIT_PASS=False
P3E2SR4BR10_UNIT_FAILURE_CAUSE=NOT_CONFIRMED
P3E2SR4BR10_CURRENT_DATABASE_REGRESSION_PASS=NOT_RUN
P3E2SR4BR10_LEGACY_CONSOLE_REGRESSION_PASS=NOT_RUN
P3E2SR4BR10_NO_AUTO_MIGRATION_STARTUP_PASS=NOT_RUN
P3E2SR4BR10_CUSTOM_PERSISTENT_HTTP_REFRESH_PASS=NOT_RUN
P3E2SR4BR10_B_TO_A_TRANSITION_PASS=NOT_RUN
P3E2SR4BR10_COMPLETE_LOCAL_REGRESSION_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R9 scoped positive evidence and historical failures remain unchanged. This local
candidate result neither revokes nor revalidates the previously bounded internal
read-only production trial; no current production health or OTP state is asserted.
