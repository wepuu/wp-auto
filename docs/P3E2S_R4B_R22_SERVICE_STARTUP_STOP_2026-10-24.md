# WPAuto P3-E2S-R4B-R22: service startup acceptance stopped at Control

## Outcome and scope

R22 did NOT pass. The single Authorization startup scenario passed. The single
Control scenario stopped at `compiled_service_matrix`, with nested stage
`default_main_start`, category `ASSERTION_FAILED`, assertion `CONTROL_MAIN_EXIT`.
The complete A/B matrix and B-stop-then-A transition were NOT_RUN. No scenario was
retried, and no application or assertion repair followed the failure.

The failed assertion requires the Control child to exit0 after stopping. The
saved safe result does not contain that child's actual exit code or signal.
Also, that assertion runs in a `finally` block and can supersede an earlier
readiness assertion. Therefore this result does NOT establish that Control
became ready, identify its precise exit cause, or prove a business-code defect.
The wrapper/container exit1 is recorded separately and must not be substituted
for the unavailable service-child exit status. Further cause analysis is a
separate task; no new diagnostic launch was made after stopping.

R21's database and separate Console PASS remains historical evidence unchanged.
Those regressions were not rerun. No production host, WordPress, Desktop OAuth,
MCP, real OTP, deployment or migration outside disposable local databases was
accessed. No push, PR, merge or image build occurred.

## Frozen implementation and offline checks

Local wiring commit: `8dc96b3c734231535ca4a572154ae3b88e5473c1`, following the R21
record at `e165096`. Five test/tooling files changed:

- `scripts/run-r22-services.mjs`: sequential, single-attempt service-only runner.
- `scripts/r22-services.synthetic.mjs`:174 offline checks.
- `test/persistent-authorization/driver.mjs`: initialization/report failure
  boundary, nested failure retention, complete service schema fingerprint and
  actual ledger observations, corrected startup evidence filename.
- `test/persistent-authorization/r22/report.mjs`: fixed result projection,
  frozen check sets and strict scenario acceptance.
- `test/persistent-authorization/r22/export.mjs`: fixed-file safe evidence export.

All174 synthetic checks passed before the formal invocation. JavaScript syntax
checks and `git diff --check` passed. The synthetic manifest expects2 startup
checks,2 Control checks,37 matrix checks and17 transition checks, in addition to
the driver gates. Its formal service attempts were zero. This is not hosted CI
or a new complete application lint/typecheck run.

Coverage includes phase ordering; missing/invalid reports; a successful report
with failed command exit; timeouts; safe initialization failure categories;
missing/incorrect migration ledgers; schema mismatch; check omissions/duplicates;
child readiness, snapshot, exit and cleanup failures; request budgets; ownership;
and sensitive sentinel exclusion. No R8 protocol script or business assertion
changed. Application source, SQL, dependencies, security permissions and production
configuration were unchanged.

## Single formal invocation

```text
run: r22-20261024141534583
UTC start: 2026-10-24T14:15:34.585Z
UTC finish: 2026-10-24T14:16:12.451Z
Authorization startup attempts: 1
Control startup attempts: 1
A/B matrix attempts: 0
B-stop-A transition attempts: 0
```

| Stage | Result | Evidence and boundary |
|---|---|---|
| Source/artifact/runtime gates | PASS | Clean frozen source; three pinned image and compiled identity probes matched |
| Authorization startup | PASS |11339ms; command/container exit0; two planned normal starts reached readiness and exited0 |
| Control startup | FAIL |8362ms; command/container exit1; nested `CONTROL_MAIN_EXIT` assertion |
| Complete A/B matrix | NOT_RUN | Stopped by Control gate |
| B-stop-A transition | NOT_RUN | Stopped by Control gate |
| Safe evidence export/save | PASS | Four fixed projected files; final private result saved |
| Input preservation | PASS | All recorded input hashes unchanged and working tree clean at completion |
| Owned process cleanup | PASS | All eight owned containers stopped; no OOM; failed Control exit1 retained |

For both executed scenarios, all four pre-service driver checks passed:

1. Missing schema fails with exact `42P01`, without creating schema/ledger.
2. Explicit migration uses its separate synthetic administrative identity.
3. Restricted runtime cannot perform the tested DDL, ledger write, owner-role
   escalation or direct classified/secret storage DML.
4. Missing ledger SELECT fails with exact `42501`, without schema repair or
   ledger changes.

Each scenario's explicit candidate migration gate checked16 entries and no014.
The successful Authorization result additionally retains the full pre/post
16-entry name/SHA-256 ledger, matching local migration source, and equal schema
fingerprints covering relations, function definitions/ACLs and relation ACL/RLS:

```text
aeb165a3f70a76fee0534b06bb69bd9768c0807fbf171efaea5ed8da92a0fc79
```

The Control driver did not reach its post-service ledger/schema comparison;
its complete post-startup no-mutation acceptance is NOT_CONFIRMED. The successful
negative checks must not be inflated into a successful complete Control gate.

Both service scripts completed their local Better Auth mock-OTP/workspace setup
and test-process external TCP/TLS/DNS API-denial checks before their default-main
stage. These were synthetic local credentials only, not real email or WordPress
consent. The API guard is not represented as an OS-wide network sandbox.

## Artifact and execution boundary

```text
Image revision: c404ed52228ce5492a85674547998d2f5d31772e
Authorization: sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f
Control: sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c
Test: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
Runtime: Node v24.22.1 / Krypton / UID1000 / linux-amd64
Compiled file count:163
Compiled SHA-256:e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
```

Existing images were used with pull disabled. Three compiled identity probes had
network disabled. The fresh PG network was internal; no host ports were published.
Services ran as UID1000 with read-only roots, dropped capabilities,
no-new-privileges and private tmpfs. Only the narrow evidence seeder ran as root
with CHOWN added. The disposable migration role is deliberately privileged and
is not evidence of a production least-privilege migration design. Service
runtime does not receive its migration credentials.

Initial D free bytes:5882814464, above5368709120. Final:5849260032, above the
ongoing2147483648 gate. No automatic cleanup or compaction was performed.

## Evidence custody and retained resources

Private host receipt:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r22-services-b43N8y\result.json
SHA-256:a73527bb261806b9768c00432d4867596fb7c7f6c056889b94c78f6d7095ddd1
```

The host directory ACL was verified for the current user, SYSTEM and
administrators. Synthetic administrative inputs remain private; this directory
and the evidence volume must not be uploaded. Published documentation contains
only projected results, artifact identities and necessary custody metadata.

All eight owned containers are stopped, with matching run labels. The Control
scenario container exited1; the other seven exited0. None was OOM-killed. Process
cleanup success means stopped/no-OOM, not that the failed test exit was acceptable.

Retained resources, deliberately not removed:

```text
network: wepuu-r22-20261024141534583-net
data volume: wepuu-r22-20261024141534583-data
evidence volume: wepuu-r22-20261024141534583-evidence
```

## Final state and next boundary

```text
P3E2SR4BR22_OFFLINE_WIRING_PASS=True
P3E2SR4BR22_AUTHORIZATION_STARTUP_PASS=True
P3E2SR4BR22_CONTROL_STARTUP_PASS=False
P3E2SR4BR22_AB_MATRIX_PASS=NOT_RUN
P3E2SR4BR22_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4BR22_NO_AUTO_MIGRATION_PASS=NOT_CONFIRMED
P3E2SR4BR22_CLEANUP_PASS=True

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The immediate next task, if authorized, is offline inspection of the Control
startup/stop fixture and available safe evidence to identify what is still
missing before a bounded targeted reproduction. Do not rerun the complete R22,
weaken clean-exit/security assertions, change application code, rebuild images,
or start A/B on this failure. Actual Desktop account switching, deployment and
production access remain separately gated.
