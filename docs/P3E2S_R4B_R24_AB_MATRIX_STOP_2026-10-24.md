# WPAuto P3-E2S-R4B-R24 matrix stopped at expired code

## Outcome and scope

R24 did NOT pass. One complete-matrix invocation stopped at `expired_code`
with category `ASSERTION_FAILED`, after24 of the frozen37 checks completed.
The driver correctly reported `SERVICE_MATRIX_FAILED` and exited1. The separate
B-stop-then-A transition was NOT_RUN. No retry, application repair or assertion
change followed the failure.

The safe result identifies the stage, not the exact inner assertion or Token
response. This stage includes fresh authorization, lookup, synthetic Provider
Session expiry and denied-exchange checks; the available evidence does not
identify which operation failed or whether A or B returned an unexpected result.
It does not prove that an expired Code was accepted or establish a security
vulnerability. The raw exception, response and credential material were not
exported. Further diagnosis is a separate task, not an automatic rerun.

R21 database/Console, R22 Authorization startup and R23 Control startup results
remain unchanged. None was repeated. Production hosts, real WordPress, Desktop,
MCP and real email delivery were not accessed. No application, SQL, dependency,
permission, protocol assertion or production configuration changed.

## Frozen local wiring

Implementation commit: `fbb289dfa75fbc10a3f0568e47ae50367553a666`, after R23 result
`1105aa0`. Only three local tooling files changed:

- `scripts/run-r24-ab.mjs` selects the dedicated A/B-only mode.
- `scripts/run-r22-services.mjs` reuses the existing immutable artifact, source,
  permissions, private evidence, process, disk and export gates. R24 selects only
  matrix followed by transition and rejects starting transition without a passed
  matrix and exactly one stopped exit0/no-OOM owned matrix container.
- `scripts/r24-ab.synthetic.mjs` supplies121 offline checks for this wiring.

R24's source gate freezes R8 at the accepted R23 baseline, including the reviewed
Control fixture, and independently freezes the driver, safe projector/exporter
and Control lifecycle helper. The matrix and transition source and their37/17
check manifests are unchanged. A successful command exit alone cannot pass.

Each driver invocation creates a new nonce-named database. R24 derives only a
SHA-256 identity from the validated private run-root pattern, rejects missing
identities and would reject a repeated identity across the two stages. Only
matrix ran, so the receipt's `distinctScenarioDatabases=false` means the second
database was not observed, not that two scenarios shared one database.

All121 pure checks passed before the formal invocation. They cover stage order,
failed/missing/duplicate cleanup proof, wrong ownership, complete check sets,
missing/altered ledger and schema evidence, child lifecycle and request budgets,
timeouts, nonzero transport exits, invalid/missing reports, sensitive sentinel
exclusion and unchanged scenario inputs. Syntax and `git diff --check` passed.
These checks started no service or Docker process. No new whole-repo lint,
typecheck or hosted CI result is claimed.

## Single formal invocation

```text
run: r24-20261024144904933
UTC start: 2026-10-24T14:49:04.934Z
UTC finish: 2026-10-24T14:49:36.939Z
local window: 2026-10-24 22:49:04 to22:49:36 Asia/Shanghai
matrix attempts:1
transition attempts:0
matrix driver duration:9238ms
matrix inner monotonic duration:5535.154ms
```

| Gate | Result |
|---|---|
| Clean source and unchanged frozen inputs | PASS |
| Fixed image and compiled identities | PASS |
| Internal network and no host ports | PASS |
| Explicit candidate migration and no014 | PASS before service matrix |
| Restricted runtime DDL/ledger/escalation/direct-DML checks | PASS |
| Complete matrix | FAIL at expired_code |
| B-stop-then-A transition | NOT_RUN |
| Safe projection/export and private result save | PASS |
| All owned processes stopped, no OOM | PASS |

The24 completed checks comprise:

- Local Better Auth mock OTP/account/workspace setup and external TCP/TLS/DNS
  test-process API denial.
- Same-candidate A and B startup.
- Seven invalid signed-proof/claim cases, pending preservation and valid
  activation, with the corresponding accepted signed-fixture integration check.
- A's ordinary session-bound path and another Site's ordinary path.
- CSRF, spoofed binding, invalid persistent choice and wrong Origin denials,
  plus their combined no-artifact assertion.
- Receipt, Provider and Code save-failure injection cases issuing no Code.
- Duplicate submission issuing no second receipt or Code.
- Explicit receipt and B-Code-to-A exchange, followed by A/B Refresh rotation
  after the original Provider Session's expiry, without lifetime extension.

These partial successes do not constitute full authorization acceptance. The
`expired_code` pass check was not reached. Later Code/Session binding variants,
native PKCE/redirect/resource negatives, membership/receipt/link guards,
second-account isolation, withdrawal, real Refresh replay and Better Auth
Session expiry checks were not completed by this run. In particular, the earlier
successful Refresh rotation does not substitute for replay acceptance.

The recorded request counts were9 authorization requests and6 Token requests,
within the unchanged20/30 budgets. One local Mock delivery was observed; no
external email was sent. The240-second inner deadline was not exceeded; the
outer scenario budget remained300seconds.

## Process and migration evidence

Both A and B had readiness200 with one readiness request each, complete accepted
child observations and snapshots, exit0, and owned-child stopped=true. Neither
timed out nor required forced termination. `childEvidencePass=true` and normal
cleanup do not override `protocolAssertionsPass=false`.

The driver's explicit migration gate passed16 entries,001–013 and015–017, no014,
and the separate migration/runtime identity and runtime privilege checks passed.
Because the matrix failed, the driver did not reach its final actual ledger and
schema/function/ACL/RLS comparison. Full post-matrix migration/permission
preservation is therefore NOT_CONFIRMED, not a pass inferred from R21 or R23.

Only the matrix database identity was recorded:

```text
c7c941182c5235d1bbecf5c13d4683c263eb66505c1cbc99b0ada6a4de0429fa
```

## Fixed artifacts and execution isolation

```text
image revision: c404ed52228ce5492a85674547998d2f5d31772e
Authorization: sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f
Control: sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c
Test: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
runtime: Node v24.22.1 / Krypton / UID1000 / linux-amd64
compiled files:163
compiled SHA-256:e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
```

No image build, pull or dependency installation occurred. Identity probes used
network=none. The new PG network was internal with no published host ports.
Scenario processes ran as UID1000, with read-only roots, dropped capabilities,
no-new-privileges and private tmpfs. Only the narrow evidence seeder had
root+CHOWN. The migrator's privileged synthetic role did not reach service runtime.
The existing process API egress guard is not claimed as an OS-wide sandbox.

Initial and final D free space was5848563712bytes, above5GiB initial and2GiB
ongoing thresholds. No resource cleanup/compaction was performed.

## Evidence custody and cleanup

```text
private receipt:
C:\Users\liulo\AppData\Local\Temp\wepuu-r24-ab-9LfEoD\result.json
SHA-256:e592f2d98b2e3e520e4a2c60abcd4ce947fe912992e67e9d90c32e3878d80722
```

The private host evidence ACL was verified for the current user, SYSTEM and
administrators. Two fixed projected files were exported. Private input files,
volumes and full test payloads are not publication artifacts.

All seven owned containers stopped with matching labels and no OOM. Matrix
exited1; the three probes, seeder, PG and safe exporter exited0. Cleanup PASS
means all owned processes stopped without OOM, not that matrix exit1 was accepted.
Stopped containers and the following resources remain retained:

```text
network: wepuu-r24-20261024144904933-net
data volume: wepuu-r24-20261024144904933-data
evidence volume: wepuu-r24-20261024144904933-evidence
```

No unrelated resource was deleted or changed. Source and recorded inputs remained
unchanged and the worktree was clean at the end of the formal run. Only local
commits are used; no push, PR, merge or deployment was performed.

## Final state and next boundary

```text
P3E2SR4BR24_OFFLINE_WIRING_PASS=True
P3E2SR4BR24_AB_MATRIX_PASS=False
P3E2SR4BR24_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4BR24_MIGRATION_AND_PERMISSION_PASS=NOT_CONFIRMED
P3E2SR4BR24_CLEANUP_PASS=True

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. The next separately approved task should inspect the expired_code
fixture and relevant authorization/Provider contract offline, identify the exact
evidence gap, and propose a bounded targeted diagnostic only if necessary.
Do not rerun the complete matrix, execute transition, weaken expiry/session
validation, change application code or assert real Desktop switching is fixed.
