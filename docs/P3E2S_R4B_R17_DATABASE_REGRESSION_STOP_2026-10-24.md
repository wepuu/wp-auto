# WPAuto P3-E2S-R4B-R17: bounded database regression stopped on first failure

## Outcome

The single authorized candidate-plus-retained database invocation stopped at
`grant-reconsent.test.ts`, the fifth candidate file. Its process completed with
exit 1 and a VALID failure report. It was not a timeout, spawn failure, output
overflow, missing report or container OOM. Four earlier files passed.

No test was patched or rerun after this failure. The remaining candidate files,
both retained regressions and the independent Console regression were NOT_RUN.
No Console cluster/resources were created. Default service startup, A/B,
production, real WordPress/Desktop, OTP mail and real OAuth/MCP were not run.

Frozen local implementation:
`edcd3f446dfe3a8854adeee8e86f71f89d8b07ff`, following R16 documentation
`0ad6bbb`. This result does not supersede the R14 unit pass, R15 scope stop or
R16 targeted OTP pass, and none of those historical results substitutes for the
unfinished R17 regression.

## Test-only changes and offline validation

New entry points:

- `scripts/run-r17-database.mjs`: fixed-image local orchestration, independent
  candidate/Console resources, stop-on-failure, bounded transport, private evidence.
- `test/persistent-authorization/r17/database-group.mjs`: credential read,
  connection, runtime check, each test process and actual ledger verification
  inside a report-producing failure envelope. It does not invoke the old broad
  image acceptance script or its startup/A/B phases.
- `packages/database/test/r17-migration-evidence.mjs`: opt-in fixture observations
  from real connections, exact source SQL name/hash matching and fixed schemas.
- `scripts/r17-database.synthetic.mjs`: 78 passing offline checks.

Minimal instrumentation was added to `p3d-fixture.ts`, multi-site provider,
persistent-readonly and pairing-diagnostics fixtures. It runs only when the R17
context is supplied and records child ledgers before assertions and before
destruction. An R17 full-profile request through the shared p3d helper is rejected
before migration; Console's separate direct fixture remains independent.

The offline tool strips only these known instrumentation lines and compares
the original business bytes with `0ad6bbb`; all four source comparisons passed.
R16's repaired OTP test and helper remain unchanged and are included in the
read-only overlays. No Database prototype or migration interception was used.

The 78 checks cover credential/connection/query/setup/save failure reporting,
safe output filtering, closed migration sets/hashes, unexpected Console objects,
missing/duplicate/wrong-run observations, static NO_MIGRATION entries, manifest
sizes, host result projection, partial evidence and required source overlays.
Source syntax and `git diff --check` passed before the local implementation
commit. Host Node 26 ran orchestration/pure synthetic tooling only. This is not
a new whole-repository typecheck/lint or hosted CI result.

Application sources, SQL, dependencies, migration semantics, business assertions,
security checks and production settings were not changed. No install/build/pull
was performed. Local commits only; no push, PR or merge.

## Frozen manifest and evidence policy

| Group | Frozen files / top-level cases | Actual R17 coverage |
|---|---|---|
| Candidate | 13 / 28 | first 4 files passed; fifth failed; 8 files NOT_RUN |
| Retained | 2 / 3 | NOT_RUN |
| Legacy Console | 1 / 1 | NOT_RUN; gated on complete candidate/retained pass |

The existing `r10/profiles.mjs` manifests and top-level expectations were not
changed. Each file has at most 150000 ms; each group has a 300000 ms monotonic
budget. The outer group transport has 330000 ms for reporting/teardown. No
timeouts, skip allowances or scopes were relaxed to obtain a pass.

Expected actual fixture scopes (not all exercised):

- Candidate: 001–013,015–017, exactly 16 entries, no014 or Console objects.
- OTP: 001–013,015, exactly 14; original R16 strict checks retained.
- Pairing diagnostics: 001–013, exactly 13.
- Console: 001–017, exactly 17 including014, in a separate cluster only.
- `migration-profile.test.ts` and `secret-artifact.test.ts`: NO_MIGRATION,
  not invented migration evidence.

Direct fixtures use the per-file database whose URL was supplied to the test;
their retained database is inspected after the file, and observations are marked
`post`, not before/after. Child-creating fixtures require paired `before`/`after`
observations from each actual child before its destruction. Empty parent
scheduling databases cannot satisfy child fixture coverage. Six distinct
persistent-readonly children, two OTP children and the other closed child counts
must be present for those files to pass.

No child-creating file was reached in this invocation. Their real migration
coverage remains NOT_RUN, despite passing synthetic verifier tests.

## Actual run and failure report

```text
run: r17-20261024120127064
UTC start: 2026-10-24T12:01:27.065Z
UTC finish: 2026-10-24T12:01:54.111Z
candidate-plus-retained attempts: 1
Console attempts: 0
worker group duration: 12480 ms
outer stage: candidate_regression
worker stage: database_test
worker category: DATABASE_TEST_FAILED
host category: DATABASE_GROUP_FAILED
failed file: packages/database/test/grant-reconsent.test.ts
```

| File | Reported results | Result | Actual ledger |
|---|---:|---|---|
| account-auth-link.test.ts | 1 | PASS | 16 exact entries, post |
| account-login-transaction.test.ts | 2 | PASS | 16 exact entries, post |
| account-workspace.test.ts | 1 | PASS | 16 exact entries, post |
| deletion-lifecycle.test.ts | 4 | PASS | 16 exact entries, post |
| grant-reconsent.test.ts | 1 | FAIL | NOT_CONFIRMED; stopped before post-ledger gate |

Every returned file report had the correct top-level count, no missing files,
no unmapped events, no unexpected event and zero skips. The failing file reports:

```text
category: TEST_FAILURE
reportStatus: VALID
completed: true
spawnFailed / timedOut / outputLimitExceeded: false / false / false
exitCode: 1
signal: null
outputBytes: 0
failure category: ERR_TEST_FAILURE
failure file: packages/database/test/grant-reconsent.test.ts
reported line: 1
```

Line 1 is the reporter's retained test location, not evidence of the precise
failing assertion. No deeper cause is present in the safe report. Root cause is
NOT_CONFIRMED; it is not attributed to migration017, permissions, runtime or
cleanup without further evidence. Raw exceptions/stacks/stdout/stderr were not
exported. No additional diagnostic execution or workaround was attempted.

The four verified direct-database observations each contain the exact 16 names
and SQL SHA-256 values, Console objects absent. Their common canonical ledger
digest is `797bb34ec9ce55f1b34e5f0648f2e6982e335bcb8c1c76f5eb7580643b896879`.
Full database identities are bound by SHA-256 in private evidence, not represented
by the shared ledger digest. These observations do not prove the failed or
unexecuted fixtures' migration coverage.

## Runtime identity, isolation and custody

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
Image revision: c404ed52228ce5492a85674547998d2f5d31772e
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
PostgreSQL identity: 16 / linux-amd64
Test Node: v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
163-file compiled hash: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
```

The run used one new internal candidate network, with no published host ports.
Tests joined only the PG container network namespace and used loopback synthetic
credentials. Test/probe root was read-only, UID1000, capabilities dropped,
no-new-privileges, log driver none and bounded tmpfs. Only explicit test/helper
files were bind-mounted read-only, including all repaired R16/R17 fixtures; no
Docker socket, whole user directory, production config or credential store was
mounted. The dedicated evidence volume was writable.

As in R16, the no-network root evidence seeder had only CHOWN above cap-drop ALL,
and only prepared this new volume's0700 directory/0600 synthetic credential file
for UID1000. PostgreSQL used its fixed normal initialization and separate writable
data volume. This is test-admin isolation evidence, not proof of least-privilege
application runtime or default-startup acceptance.

The host private directory was restricted to the current user, SYSTEM and
Administrators and ACL-verified. Source files and test output schema are frozen;
secrets were not placed in command arguments, Git or this record. Evidence file
writes use exclusive creation; missing evidence makes the result fail closed.

All four run-owned containers were inspected stopped with matching labels,
zero published ports and no OOM. The test container retained exit1; probe,
seeder and PG retained exit0. They were not deleted or restarted.

```text
wepuu-r17-20261024120127064-probe
wepuu-r17-20261024120127064-candidate-tests
wepuu-r17-20261024120127064-candidate-pg
wepuu-r17-20261024120127064-candidate-seed

retained network: wepuu-r17-20261024120127064-candidate-net
retained volume: wepuu-r17-20261024120127064-candidate-data
retained volume: wepuu-r17-20261024120127064-candidate-evidence
```

Private result (not committed):
`C:\Users\liulo\AppData\Local\Temp\wepuu-r17-database-cSnvl3\result.json`

```text
result SHA-256: adcf99944df3b6b5e9a3fb31434f7d4776546cc964a9552a520cadd153f8380d
driver SHA-256: 55616b500101ec0af4ffa3082fc6d9103bf365d5c2a6244d7df43225c2051fe8
host coordinator SHA-256: 33a95ae696d5a4420c5da99bb0429aaced3d738615c9a7a84618ac54c70cb3a8
ledger helper SHA-256: 0138eafe4933dc3721dbbf5ff6088d35369ec0b682e732fb188b716f551cbb8c
synthetic tool SHA-256: f27e1e08b95323d8e5d5bf98e862b3c5520da638680e5d4ce33553738cb12142
```

The failure prevented the normal success postcheck. A separate, non-executing
host check then verified every frozen input against the saved hashes: no changes.
Worktree was clean before this documentation addition. D: free space was
6287622144 bytes at entry, above the initial5GiB gate, and6220513280 bytes at the
subsequent read-only check, above the ongoing2GiB requirement. No cache or volume
cleanup was performed to change these results.

## Final states and stop

```text
P3E2SR4BR17_CANDIDATE_DATABASE_PASS=False
P3E2SR4BR17_RETAINED_DATABASE_PASS=False
P3E2SR4BR17_RETAINED_DATABASE_RESULT=NOT_RUN
P3E2SR4BR17_LEGACY_CONSOLE_RESULT=NOT_RUN
P3E2SR4BR17_ACTUAL_MIGRATION_COVERAGE_PASS=False
P3E2SR4BR17_SERVICE_STARTUP_EXECUTED=False
P3E2SR4BR17_AB_EXECUTED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R17 is closed at its first formal failure. Any next step must start with offline
review of the failing test and the existing safe failure-report chain; a new
database reproduction, diagnostic instrumentation, fix, regression or later
startup/A/B phase is not implicitly authorized by this stopped attempt.
