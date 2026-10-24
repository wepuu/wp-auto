# WPAuto P3-E2S-R4B-R18: offline re-consent compatibility review and safe diagnostics

## Outcome and limits

The R18 offline review and diagnostic synthetic gate passed. No database,
container, application service or default entry point was started. No production,
WordPress, Desktop, email, real OAuth/MCP, full regression, Console or A/B was
accessed or executed. No retained R17 resource was restarted, deleted or changed.

A source incompatibility is confirmed: the existing re-consent regression makes
three positive generic RefreshToken `upsert()` calls, while the current adapter
explicitly rejects generic RefreshToken writes. This is NOT confirmation of
R17's earliest actual failure. Its retained report identifies only the test file,
test location and ERR_TEST_FAILURE; it does not show which preceding operation
completed. The historical failure is not rewritten.

Implementation: `1d4dd00a7e04fdc57214d93a2dd4b6d7739725f0`, with final additional
cleanup-only synthetic coverage at `0ee1d1661316d59321499985484e10482e082ee6`,
following R17 result commit `c23d97e`. The same candidate worktree/branch is used; only local commits,
with no push, PR, merge, deployment, dependency change or SQL change.

## Ordered source review

| Step in existing test | Source observation | R17 actual execution evidence |
|---|---|---|
| Connect/migrate/reset fixture | Explicit authorization migration profile; original setup retained | This file's completed ledger check not reached; NOT_CONFIRMED |
| Provision/load lifecycle Client | Existing repository checks exact registration metadata and active status | NOT_CONFIRMED |
| Create account, Tenant, owner and Site | Existing synthetic fixture operations retained | NOT_CONFIRMED |
| Begin/activate first Grant | Existing GrantService and repository path retained | NOT_CONFIRMED |
| Issue R0 through generic Refresh adapter upsert | Current adapter rejects this method/model combination | Confirmed source incompatibility, not proven first runtime failure |
| Consume R0, issue R1 | R1 also uses the rejected generic write | Not established as reached |
| Replay/revoke, inspect old Grant/tokens/Outbox | Original assertions retained | Not established as reached |
| Begin/activate same-tuple new Grant | Original isolation/re-consent assertions retained | Not established as reached |
| Issue token for explicit revocation | Third rejected generic Refresh write | Not established as reached |
| Explicit revoke, Client suspend/conflict/reprovision | Original assertions retained | Not established as reached |
| Close database | Original close operation retained | R17 does not independently identify cleanup success/failure |

The direct rejection is in `PostgresOidcAdapter.upsert()` in
`packages/database/src/index.ts`: for model RefreshToken it throws the existing
OAuthInvalidGrantError before the authorization-service database write. Its
fixed public error discriminator is `invalid_grant`. The re-consent fixture's
payload also lacks resource, scope and session binding, and supplies no parent
Code/Refresh relation; merely replacing the method name cannot repair it.

The current native issuance contract additionally requires:

- an active, correctly bound Grant/account/Client/Site/Tenant and membership;
- an appropriate classified Code parent with the native-offline mode;
- a consumed, unexpired parent artifact;
- matching account, Client, Grant, resource and session binding;
- non-expanding scope and bounded expiry/deadline;
- one permitted Refresh successor per parent.

These requirements are visible in the existing adapter and migration017
`issue_native_code`, `artifact_assert_binding`, `artifact_classify` and
`issue_native_refresh` functions. No function, guard or constraint was changed.
The offline review does not prove database permission or issuance success.

### Frozen-file scan

All 16 frozen database test filenames were read; no additional file was run.

- `grant-reconsent.test.ts`: three positive generic Refresh `upsert()` calls,
  for initial, rotated and explicit-revocation tokens; unchanged in R18.
- `tenant-isolation.test.ts`: its Refresh regression already builds and consumes
  a classified native-offline Code, then calls `upsertNativeRefresh()` with the
  parent lookup candidates. It is a source reference, not a new pass result.
  Its other generic adapter use is model Grant, not RefreshToken.
- `persistent-readonly.test.ts`: uses the separate receipt-linked `saveLinked()`
  path for Code and an ordinary Session adapter. These are not treated as
  equivalent to the rejected generic Refresh write.
- No other direct generic Refresh construction/write pattern was found in this
  finite scan. This is not a proof that all remaining tests are compatible or
  that indirect/runtime adapter callers have been exhaustively validated.

## Minimal instrumentation, not a repair

`grant-reconsent.test.ts` gained only:

1. a test-only opt-in diagnostic import/factory;
2. a main-operation wrapper which rethrows the original error;
3. fixed checkpoints before existing operation groups;
4. a wrapper around the original database close callback for separate cleanup
   reporting.

The original fixture/profile, Client operations, payloads, three generic writes,
token consume/replay/revocation operations, assertion text and assertion order
remain unchanged. The synthetic tool removes only the known instrumentation and
restores the close callback, then compares the complete remaining file with
`c23d97e`: byte-identical after newline normalization. In particular, this round
does NOT adapt the failing issuance path, change its expected result or mark an
expected denial as a successful positive regression.

Without both explicit diagnostic environment settings, the helper performs no
file I/O and delegates directly to the original callbacks. Partial/invalid
diagnostic settings fail closed. No application-source, connector, migration,
permission, dependency, protocol or API change was needed; therefore no approved
product contract or ADR was modified.

## Independent diagnostic schema and safe report chain

New helper: `packages/database/test/reconsent-diagnostic.mjs`.

The helper is independent of the R10 test reporter/envelope. Their schema,
version, acceptance criteria and historical results are untouched. The existing
process/test report remains authoritative for a test pass/fail; this companion
schema cannot replace that verdict.

The 23 main checkpoints cover setup, migration/reset, Client provisioning,
identity binding, first Grant begin/activate, Refresh setup, R0 issue/consume,
R1 issue, replay/revocation, assertions, second Grant begin/activate/assertions,
second Refresh issue/consume, explicit revocation/assertions and the remaining
Client lifecycle checks. A checkpoint means the preceding instrumented operation
group completed, not that a particular SQL statement or assertion was traced.

Only the following fields are accepted:

```text
schemaVersion / diagnostic run / fixed test file / main-or-cleanup channel
PASS-or-FAIL / fixed stage / completed fixed stages / monotonic elapsedMs
ledgerStatus=NOT_CONFIRMED / evidenceSaveFailed
optional fixed error category / whitelisted SQLSTATE / one-level safe cause
```

No names/messages/stacks, request or SQL bodies/parameters, Token/payload/keys,
connection strings, arbitrary actual/expected values or complete local variables
are read into the output. Error inspection reads only own data properties;
accessors are not invoked, prototypes are not traversed, and cause inspection is
limited to one level. Unknown errors become NOT_CONFIRMED.

The bounded SQLSTATE allowlist is
42501,P0001,23502,23503,23505,23514,42P01,42883,55P03,57014. Other safe categories
distinguish assertion, OAuth invalid_grant, module load, access and timeout; these
are diagnostic classifications, not proof of an underlying root cause.

Main and cleanup use separate records. A later cleanup failure cannot replace
the first main failure or its completed-stage prefix. Each channel can execute
only once, including overlapping cleanup calls. Original callback errors are
re-thrown by identity, even if evidence saving also fails. If an otherwise
successful callback cannot save required evidence, the helper throws a fixed
diagnostic-save failure rather than allowing a silent pass.

Actual future writes require the fixed `/evidence/r18` directory under private
`/evidence`, UID ownership,0700 directories and exclusive0600 `main.json` and
`cleanup.json` files. The helper does not create that directory or start a run.
No real diagnostic evidence files were created during R18.

The safe reader accepts only these two filenames, ordinary owned private files
up to16KiB each and exact schema/run/channel matching. Missing, duplicate,
wrong-run, invalid JSON, permission-denied, oversized or unexpected files cannot
produce complete diagnostic coverage. It projects only the validated records.

The reconciler preserves primary and cleanup failures separately. Its
`testVerdict` is always NOT_CONFIRMED: even two successful diagnostic records do
not prove that the parent test process/report passed. Ledger status likewise
remains NOT_CONFIRMED; no ledger success can be manufactured from checkpoints.

## Offline validation actually executed

```text
command: Node26 scripts/r18-reconsent-diagnostic.synthetic.mjs
result: PASS
checks: 312
databaseStarted: false
containerStarted: false
productionAccessed: false
businessOperationsUnchanged: true
firstR17FailureConfirmed: false
```

Coverage includes:

- failure at every one of the23 stages, completed-prefix correctness, original
  error identity, success of subsequent cleanup and no overwrite on repeat;
- primary failure plus cleanup failure, cleanup-only failure, missing checkpoint,
  duplicate/concurrent invocation and save failure;
- fixed OAuth/SQLSTATE/assertion/module/access/timeout and unknown categories;
- malicious accessor properties, cyclic/deep causes, primitive errors and
  sensitive sentinel exclusion;
- exact schema/run/stage/status fields, missing/extra fields and invalid values;
- disabled/partial opt-in behavior;
- mocked private directory/file ownership, permission, symlink and exclusive-write
  checks; mocked missing/denied/oversized/malformed evidence reads;
- complete/incomplete diagnostic aggregation without changing a test verdict;
- original business bytes, exact checkpoint ordering, the three unchanged
  positive Refresh writes and finite frozen-test scan.

JavaScript syntax, non-executing TypeScript strip-types syntax inspection and
`git diff --check` passed. All filesystem evidence I/O in these synthetic tests
was mocked; real source files were only read. No application module was imported
or executed. This is not a real Node24 diagnostic integration, PostgreSQL
reproduction, whole-repository typecheck/lint, full test suite or hosted CI pass.

Frozen hashes:

```text
instrumented test: 9e1752b2e3f46bed9f7a8d365d69d07a10ee29900ec65c60655d24b33d03e06f
diagnostic helper: f86f942b671fbbab740442c77538b6a6164af58146e24f8baa594634ede5731d
synthetic tool: 432259fd8999feb56d2667aa242b549015a569f1183231fea2610b29701fc60a
```

## Repair candidate: not implemented

If a separately authorized target reproduction confirms the incompatible write
as the first failure, prepare a test-fixture-only adaptation:

1. Build the necessary synthetic Session and properly bound native-offline Code
   using the existing reviewed adapter path, within the original active Grant.
2. Consume that Code and issue R0 with `upsertNativeRefresh()` and its actual
   parent lookup candidates; consume R0 and issue R1 with R0 as parent.
3. Build a separate valid issuance chain for the second Grant before explicit
   revocation; never reuse the old Grant's parent or classification.
4. Retain every original re-consent, old-token denial, refresh replay,
   revocation-reason/Outbox and Client lifecycle assertion.

No hand-inserted classifications, guessed parent keys, disabled guards, direct
table writes replacing issuance, parentless Refresh fallback, profile downgrade
or omission of016/017 is acceptable. Native-offline scope here would be confined
to the synthetic native regression contract; it does not change Desktop's
existing production `mcp:read` authorization.

The existing tenant-isolation fixture is a source starting point, not authority
to copy its synthetic binding into another Grant. A fixture adaptation requires
its own focused/adversarial tests and a new explicitly authorized validation.

## Next bounded operation sheet: separately authorized, NOT_RUN

The next task should wire these diagnostics into a new single-file harness and
then run only the unchanged-positive-path, instrumented re-consent test once.
Before that attempt:

- freeze fresh source/helper hashes and a new run/evidence identity;
- test the harness/result projection offline, including partial/missing
  diagnostics and original test failure preservation;
- reuse the approved fixed Node24/tsx/test image and PG16 identities, without
  rebuild/pull/install; mount this helper and instrumented file explicitly
  read-only, not merely the older image's copy;
- use a new internal-network/no-published-port disposable database cluster,
  synthetic credentials and private evidence storage; do not restart the R17
  failure cluster;
- verify the actual target database ledger against001–013,015–017 names/hashes,
  before business assertions and before teardown, without migrator interception;
- provide the private diagnostic directory and explicit opt-in, then aggregate
  both channels with the original bounded process/report and migration evidence;
- keep the existing150000ms file and300000ms group limits, preserve failure
  evidence and stop at the first failed target invocation; no patch/retry;
- stop run-owned containers by verified labels and retain evidence/resources.

R17's existing host entry point is not the next task's execution command: its
frozen source allowlist does not include these new R18 files, and it would run a
broader group. It was not loosened or executed in R18. Real fixed-Node24 wiring,
database reproduction, first-failure confirmation and any repair remain pending.

## Final states and stop

```text
P3E2SR4BR18_OFFLINE_REVIEW_COMPLETE=True
P3E2SR4BR18_SAFE_DIAGNOSTICS_TEST_PASS=True
P3E2SR4BR18_R17_FIRST_FAILURE_CONFIRMED=False
P3E2SR4BR18_DATABASE_REPRODUCTION_EXECUTED=False

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R18 ends with this offline record and repair/reproduction operation sheet. No
new database run, repair, full regression, startup or A/B is implicitly approved.
