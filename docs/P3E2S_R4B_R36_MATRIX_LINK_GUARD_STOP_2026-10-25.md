# WPAuto P3-E2S-R4B-R36 matrix link guard stop

## Result

R36 corrected the stale fixture baseline, passed 147 complete synthetic checks
and ran the fixed R34 candidate matrix once. The matrix completed 31 of its 37
required checks, then failed with an assertion in `link_and_version_guards`.
The B-stop/A transition was NOT_RUN. No automatic retry or application repair
followed the failure.

The previously blocked original-Session expiry check now passed through both
modes: 400 invalid_grant, no returned AT/RT. R34's independent four-case expiry
acceptance remains valid. The new matrix failure is not attributed to expiry
or to a specific SQL/application defect without further evidence.

## Baseline review and minimal wiring correction

The R25 commit `3a41e09` changes three files relative to `1105aa0`: integration
expiry instrumentation, `expiry-evidence.mjs`, and safe report projection. The
review confirmed the helper retains the sequential denied-response assertions,
adds Code/link presence and one-row-update checks, and exports only whitelisted
expiry metadata. It does not create independent A/B expiry cases; that old
single-Code reuse limitation is retained and separately covered by R34.

The complete expected-check definitions, including proof/common flow entries
and the 37/17 matrix/transition name sets, were compared across the old version,
reviewed `ab29f071062c9cbeee26e79d2e3ccfb82186f020` and current report source.
They matched. Current R8, driver and report/export files matched that reviewed
baseline, not an arbitrary new worktree version.

Only the two R35-named local wiring files changed: reviewed baseline selection,
matching assertions, R36 ownership/run/evidence naming, and extra offline review
checks. The freeze was retained; no protocol assertion, expected set, application,
dependency, migration or runtime configuration was changed. The implementation
was committed before execution:

```text
83e8cb1782098252bdc94e249ba08cdf6e43743c
test: pin reviewed R25 fixture baseline for R36 matrix run
```

All 147 synthetic checks completed successfully once on host Node v26.11.1.
They covered scenario ordering, failure/partial-report propagation, frozen
37/17 sets, correct/incorrect image identities, mixed fingerprints, normal
child exits, resource guards, sentinel suppression and syntax. They did not
execute application services or substitute for the subsequent integration run.

## Single formal attempt

```text
run: r36-20261025101227538
UTC start: 2026-10-25T10:12:27.539Z
UTC finish: 2026-10-25T10:13:04.061Z
Asia/Shanghai: 2026-10-25 18:12:27 to 18:13:04
matrix attempts: 1
transition attempts: 0
inner matrix monotonic duration: 9880.517 ms
authorization requests: 17 / maximum 20
Token requests: 18 / maximum 30
local mock deliveries observed: 1
```

The R34 Authorization, Control and Test IDs were reverified. No image was
rebuilt, pulled or published. All three probes matched 163 files and:

```text
candidate revision: 1df4c857e667398ac71487f352fc3daa7ddbac8a
compiled SHA-256: 260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691
runtime: Node v24.22.1 / Krypton / UID1000 / linux-amd64
```

Control's service main was not started. Matrix A/B each had a readiness 200,
one readiness request, complete accepted child snapshot, normal exit 0 and no
forced termination. Deadline was not exceeded. Those child results do not
override protocolAssertionsPass=false or the matrix driver exit 1.

The expired Session evidence showed one updated row, an existing Code/link and
completed exchanges through both A and B. Each returned 400 invalid_grant with
accessTokenPresent=false and refreshTokenPresent=false. This sequential matrix
case is not presented as the independent expiry verification from R34.

## Failure boundary and missing detail

The safe driver reports `SERVICE_MATRIX_FAILED`. Its nested matrix report is:

```text
passed: false
stage: link_and_version_guards
category: ASSERTION_FAILED
specific assertion: NOT_OBSERVED
passed expected checks: 31 / 37
```

The final recorded successful check was
`unknown_receipt_version_rejected_by_real_database_constraint`. The following
uncompleted check in the frozen source is
`real_missing_RT_link_denied_without_native_fallback`. The stage label is not
advanced between those two checks.

That next sequence includes fresh authorization/exchange, a status-200 fixture
assertion, test-only deletion of the RefreshToken link, and a refresh-denial
assertion. The current safe report does not establish which operation/assertion
failed or its response. Do not infer that the receipt-version constraint failed,
that native fallback occurred, that Token issuance bypassed a guard, or that a
particular SQL error mapping is missing. Exact cause remains NOT_CONFIRMED.

The six expected checks not completed are:

- missing RT link denial without native fallback;
- second local account cannot reuse the first account's Grant;
- receipt withdrawal denies existing RT;
- Refresh replay revokes Grant/successor with one Outbox;
- expired Better Auth Session cannot enter Consent;
- protected Grant and secret-free receipt projection.

They are not passes inferred from earlier phases. The independent transition
database was not created, because the matrix/normal-exit gate rejected progress.

## Migration isolation and cleanup

Setup passed the separate explicit migration identity and restricted-runtime
DDL/ledger-write/role-escalation/artifact-DML denial checks. The candidate setup
requires 001-013 plus 015-017, without 014. Since the matrix failed, the driver
did not reach its final actual ledger and schema/function/ACL/RLS comparison;
complete post-matrix migration/permission preservation is NOT_CONFIRMED.

The only scenario database identity reported was:

```text
39bfb7ad07013b3984da94a282bfd64b0c4ecf765c67a52292dfb23dbaf50c77
```

The fresh Docker network was internal with no host ports. Driver/services used
UID1000, read-only roots, dropped capabilities, no-new-privileges and private
tmpfs. The narrow evidence seeder alone used root+CHOWN. Only synthetic local
accounts, signed Consent and OAuth artifacts were used. No real WordPress
content, MCP tool data, Desktop credential, email provider or production host
was accessed; the direct client-to-WordPress data plane was not changed.

Seven owned containers stopped with matching ownership and no OOM. The matrix
driver exited 1; probes, seeder, PG and exporter exited 0. Cleanup PASS denotes
safe stopped ownership/no OOM, not acceptance of matrix exit 1. Stopped resources
are retained, not pruned:

```text
wepuu-r36-20261025101227538-net
wepuu-r36-20261025101227538-data
wepuu-r36-20261025101227538-evidence
```

All four recorded disk observations were 5807996928 bytes free, above the 5 GiB
initial and 2 GiB ongoing gates. Inputs remained unchanged. Private ACL checks
passed and two safe projected evidence files were exported. No raw exception,
Token, Code, verifier, Session identifier or payload was published.

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r36-ab-ogAZFb\result.json
SHA-256: 71673530ba5b7b3edbfc9c99fc79c845c77dae6d0ce24551ae46bb7518649ede
```

R28 source and test hashes remain respectively:

```text
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

## Status and stop

```text
P3E2SR4BR36_FIXTURE_BASELINE_REVIEW_PASS=True
P3E2SR4BR36_WIRING_SYNTHETIC_PASS=True
P3E2SR4BR36_FIXED_CANDIDATE_IDENTITY_PASS=True
P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4BR36_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4BR36_MIGRATION_AND_PERMISSION_PASS=NOT_CONFIRMED
P3E2SR4BR36_CLEANUP_PASS=True

P3E2SR4BR34_EXPIRED_SESSION_PROTOCOL_PASS=True
P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after recording the actual failure. No retry, transition, candidate rebuild,
application fix, push, PR, merge or deployment followed. The next separately
scoped task should identify the missing-RT-link failure/reporting boundary
offline before proposing any additional isolated observation. It must not
reopen the resolved expiry mapping or automatically repeat the full matrix.
