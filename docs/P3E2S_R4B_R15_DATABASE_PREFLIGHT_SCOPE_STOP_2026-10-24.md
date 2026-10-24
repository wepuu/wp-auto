# WPAuto P3-E2S-R4B-R15: database preflight stopped on fixture migration scope

## Outcome and authorization boundary

R15 stopped during the read-only fixture/profile review. No database regression,
Console regression, PostgreSQL startup, migration, service startup or A/B run was
attempted. No new Docker objects, credentials or database backups were created.
No production, WordPress, Desktop, OTP, OAuth or MCP operation occurred.

The approved plan requires candidate/retained databases to exclude014 and permits
014 only for the independently isolated Console regression. It also requires a
stop when the actual migration scope cannot be reconciled with the frozen profile.
The existing second OTP test selects the full17-file fixture, including014.
It cannot be executed under the approved retained-profile description as written.

The discrepancy is **not newly introduced source drift**. The R15 plan's statement
that both OTP cases use the historical14-file profile was inaccurate. Correcting
that description does not authorize silently changing either case's prerequisites.

## Baseline and static evidence

Read-only baseline was clean at:
`8f40d3501231d52866bc02ac33abeb220a9ec1d5` on
`codex/p3e2sr4b-source-integration`.
Evidence observed at `2026-10-24T11:30:24.8891663Z` (UTC).

Source findings:

1. `packages/database/test/otp-send-budget.test.ts:15` calls `p3dFixture(t)`.
2. The second top-level case, starting at line100, calls `p3dFixture(t, true)` at
   line103. It exercises the real Better Auth handler with a mock email sender.
3. `packages/database/test/p3d-fixture.ts` accepts `full: boolean | 'authorization'`;
   when `full === true`, its copy filter includes every source migration.
4. The fixture constructs `Database` with that copied directory and no
   `migrationProfile` option, then calls `database.migrate()`.
5. `packages/database/src/index.ts` defaults that option to `full`; the full
   migrator selects all numbered SQL files in the directory.

A bounded host Node26 script read the existing migration filenames and replayed
the exact selection predicates only. It did not import/run the application or
execute SQL:

| Fixture argument | Selected count | Contains014 | Selected numbers |
|---|---:|---|---|
| default / false | 14 | no | 001–013,015 |
| true | 17 | yes | 001–017 |
| authorization | 16 | no | 001–013,015–017 |

The current driver groups the entire OTP file under retained regression in the
candidate/retained cluster. It cannot relocate only the second case to an
authorized Console environment, and the R15 plan does not authorize014 for an OTP
case in any event. The existing post-test inspection of the outer scheduling
database does not prevent the fixture from migrating its separately created
child database. This is why the scope must be settled before physical execution.

```text
otp-send-budget.test.ts SHA-256:
19d1511315e2fa399749595b3cd72fa51be3203b1338f1a939bcce2840dc4152
p3d-fixture.ts SHA-256:
75db5cd0db3882fe8f5830d00eb2606dd0672920f7a484f8b1b450198e703d42
packages/database/src/index.ts SHA-256:
05629a5ad667f3fea16127200ad5499b5d7d316173aa0cdc3f999b8ef65d7d22
```

Those three sources are unchanged from fixed image revision
`c404ed52228ce5492a85674547998d2f5d31772e`. There is no claim that014 actually ran
in R15 or that this static observation reconstructs an earlier execution.

## Work completed versus not run

| Item | Result |
|---|---|
| Read-only driver, fixture and migration-profile review | completed; scope mismatch identified |
| Filename-selection characterization | completed, no SQL |
| Test driver/fixture repair | NOT_RUN; no code changes |
| Driver synthetic validation | NOT_RUN |
| Image/compiled fingerprint/database resource preflight | NOT_RUN |
| Candidate/retained formal database attempts | 0 |
| Legacy Console formal attempts | 0 |
| Migration or privileged local database operation | NOT_RUN |
| Service startup / A/B / production | NOT_RUN |

Diagnostic classification for this R15 preflight is `MIGRATION_SCOPE_MISMATCH`.
This is the local review classification, not an application error returned by a
running service. No test assertion failed because no formal test ran.

Only this documentation was added. No application, test, driver, SQL, dependency,
profile, environment, threshold or security check was modified. No raw logs or
credentials are included. No Hosted CI, push, PR, merge or deployment occurred.
No container cleanup was needed because this task created none.

## State and required next decision

```text
P3E2SR4BR15_PREFLIGHT_PASS=False
P3E2SR4BR15_CANDIDATE_DATABASE_PASS=False
P3E2SR4BR15_CANDIDATE_DATABASE_RESULT=NOT_RUN
P3E2SR4BR15_RETAINED_DATABASE_PASS=False
P3E2SR4BR15_RETAINED_DATABASE_RESULT=NOT_RUN
P3E2SR4BR15_LEGACY_CONSOLE_PASS=NOT_RUN
P3E2SR4BR15_MIGRATION_SCOPE_PASS=False
P3E2SR4BR15_SERVICE_STARTUP_EXECUTED=False
P3E2SR4BR15_AB_EXECUTED=False
P3E2SR4BR14_COMPOSITE_GATE_PASS=True
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These are candidate evidence flags; historical bounded internal trial permission
is neither revoked nor revalidated. R14's narrower pass is unchanged.

Stop here. Next, separately review the second OTP case's actual schema needs and
approve an explicit no014 fixture profile. The14-file historical profile and
16-file Authorization profile are different coverage claims, not interchangeable
workarounds. Preserve all business/security assertions and keep014 Console-only.
Only after that decision should actual-database ledger collection and the R15
single-run sequence resume under a new frozen plan. Do not merely relabel the
full17-file fixture, suppress migration evidence or proceed to discover this
scope violation after applying SQL.
