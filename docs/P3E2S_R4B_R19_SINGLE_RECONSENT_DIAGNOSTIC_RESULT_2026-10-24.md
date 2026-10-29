# WPAuto P3-E2S-R4B-R19: single isolated re-consent diagnostic reproduction

## Result

The one authorized diagnostic reproduction completed with sufficient evidence.
The original positive test still FAILED and was not repaired or retried.

The earliest main failure in this R19 invocation is `R0_ISSUE`, classified
`OAUTH_INVALID_GRANT`. Cleanup PASSED. The actual target database had the exact
16 migration names and source SHA-256 values,001–013,015–017, both after migration
and before closing;014 and Console objects were absent.

The checkpoint is immediately before the old positive
`refresh.upsert(r0, ...)` call. The unchanged current adapter explicitly rejects
generic RefreshToken writes with its existing OAuthInvalidGrantError. This
confirms R18's source incompatibility as the first failing operation in the new
R19 run: the legacy fixture tries to create a parentless/unclassified Refresh
through a method no longer permitted by the current issuance contract.

This does NOT prove the exact first failing operation of the historical R17 run,
whose safe report lacks that information. R17 and R18 records remain unchanged.
It is also not evidence of a production OAuth failure, a reason to relax the
classification guard, or a full database acceptance pass.

## Authorization, source and preparation

The operator authorized one isolated single-file diagnostic reproduction after
R18's report. The new harness was locally prepared and tested before that one
database attempt. Frozen implementation:
`fa1cae664d6ef796c6ab7d0a902eeca9cb105064`, following R18 record `5afc313`.

New test-only files:

- `scripts/run-r19-reconsent.mjs`: derived from the reviewed isolation runner,
  narrowed to a single target with no retained/Console/startup/A/B branches.
- `test/persistent-authorization/r19/reconsent-target.mjs`: bounded credential,
  connection, runtime, one test process and evidence collection envelope.
- `test/persistent-authorization/r19/target-schema.mjs`: safe host projection and
  explicit separation of reproduction completeness from a test pass.
- `packages/database/test/r19-target-ledger.mjs`: exact target-pool ledger reads,
  before/after pairing and close-on-observation-failure behavior.
- `scripts/r19-reconsent.synthetic.mjs`: offline synthetic wiring tests.

The target test gained only a ledger observation after its original migrate call
and an observation-before-close wrapper. Stripping these R19 lines/restoring the
R18 close wrapper reproduces the entire R18 test byte-for-byte after newline
normalization. All original business assertions, three obsolete generic Refresh
writes and R18 checkpoints remain unchanged. The diagnostic helper is unchanged
from R18. No application source, SQL, dependency, role/permission contract,
security guard, connector or production configuration was changed.

The host runner source allowlist, readonly mounts and input hashes explicitly
include the new helper, instrumented target, schema and worker; the older image
copy of the test was not accidentally used. Source was clean at run start and
at the frozen-input postcheck before this documentation addition.

### Offline checks

```text
command: Node26 scripts/r19-reconsent.synthetic.mjs
final result: PASS / 120 checks
formal database attempts in this synthetic command: 0
business operations unchanged: true
```

These cover credential/constructor/connect/query/runtime failures, missing
diagnostics/ledgers, evidence-save failure, one exact target invocation and
top-level expectation, unchanged150000ms file budget,300000ms group expiry,
complete reproduction with a failed test, rejection of fabricated passes,
unknown/malformed diagnostic fields, wrong-run/duplicate/missing/wrong-hash
ledger evidence, Console exclusion, private file boundaries and cleanup error
identity. The actual test source and narrowed host scope are also checked.

Local source-generation and synthetic syntax errors were corrected before the
final120-check pass and before freezing the implementation. They did not launch
Docker or constitute real test attempts. JavaScript syntax, non-executing TS
strip-types syntax and `git diff --check` passed. Host Node26 was used for
orchestration and pure checks only, not application/test execution.

## Single actual execution

```text
run: r19-20261024130610792
target context: r19-20261024130610792-target
UTC start: 2026-10-24T13:06:10.793Z
UTC finish: 2026-10-24T13:06:27.858Z
target attempts: 1
file: packages/database/test/grant-reconsent.test.ts
expected / observed top-level count: 1 / 1
test result: FAIL
diagnostic reproduction complete: true
host failure: TARGET_TEST_FAILED
inputs unchanged: true
evidence saved: true
```

The unchanged R18 diagnostic schema retains its `r18-` identifier namespace and
fixed `/evidence/r18` subdirectory. For this invocation its identifier is freshly
derived from the R19 timestamp: `r18-20261024130610792`. It is explicitly bound
to the R19 credential/run context and a new evidence volume; it is not a reused
R18 execution, artifact or database. The R18 offline historical result is not
presented as new production or integration evidence.

The existing R10 process/report gate returned:

```text
category: TEST_FAILURE
reportStatus: VALID
process completed: true
exitCode: 1
spawnFailed / timedOut / outputLimitExceeded: false / false / false
signal: null
raw output bytes: 0
report total / fileCount: 1 / 1
missing / skips / unmapped events: 0 / 0 / 0
topLevelCountsMatch: true
failure category: ERR_TEST_FAILURE
reported location: grant-reconsent.test.ts, line1
```

The old line1 report alone still does not locate an assertion. The separate
validated diagnostic evidence supplies the first stage/error:

```text
readStatus: VALID
diagnosticCoverage: COMPLETE
mainStatus: FAIL
primaryFailure.stage: R0_ISSUE
primaryFailure.error.category: OAUTH_INVALID_GRANT
cleanupStatus: PASS
cleanupFailure: null
```

The main-stage ordering means setup, migration, fixture reset, Client
provisioning, identity binding, first Grant begin/activation and Refresh setup
completed before R0 issuance failed. R0 consumption, R1 issuance, replay,
re-consent, second Grant assertions and explicit revocation were not reached and
must not be marked passed. No error message/stack, Token, raw payload, SQL
parameter, connection string or credential was exported.

The companion schema's `testVerdict=NOT_CONFIRMED` and `ledgerStatus=NOT_CONFIRMED`
are intentional: it does not certify the test or database. The independent test
process report determines FAIL, and independent actual-pool observations certify
the target ledger. Complete diagnostics are not a test PASS.

## Actual migration evidence

Both records have identical actual database identity and exact migration set:

```text
database SHA-256: ba9335662e3f2f0159f694f3e598689ebc0c7922d64221c38a04655f4230dbbe
stages: before / after
entries per record: 16
profile: 001–013,015–017
canonical ledger SHA-256: 797bb34ec9ce55f1b34e5f0648f2e6982e335bcb8c1c76f5eb7580643b896879
Console objects: absent
```

The helper queries the actual test pool's `current_database()` and requires the
run-created name shape and exact SHA-256 identity supplied by the worker. Each
name/hash is compared with the closed source migration expectation. This is not
the outer `postgres` database or a scheduling-parent substitute. Observations
occur after the original migration and before business fixture mutation, then
before closing on teardown. No migrator/prototype interception or extra migration
was used. Cleanup still closes the original database, even if observation fails;
no such cleanup failure was observed here.

## Fixed runtime, isolation and stop verification

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
Image revision: c404ed52228ce5492a85674547998d2f5d31772e
PG image: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
PG identity: 16 / linux-amd64
Test runtime: Node v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
compiled163-file hash: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
new diagnostic modules loaded by fixed Node24 probe: true
```

The initial no-network probe imported the actual new JS helpers/schema without
initializing a test or database. A new internal network, data volume, evidence
volume and synthetic credential were then used. No host port was published.
The UID1000 test container used the PG namespace's loopback only, readonly root,
capability drop, no-new-privileges, log driver none and bounded tmpfs. Only the
explicit test/helper files were bound read-only, not a whole user/repository,
Docker socket, credential store or production configuration.

The root evidence seeder was restricted to the new owned evidence volume,
no network, readonly root and CHOWN above cap-drop ALL. It prepared0700 evidence
directories and0600 synthetic credential ownership for UID1000. PostgreSQL used
its normal fixed-image initialization and dedicated writable data volume. Test
admin credentials are not application least-privilege acceptance.

The file timeout remained150000ms, group deadline300000ms, outer transport330000ms
and existing output caps were not increased. There was one bounded readiness
phase and one test launch, not a failed-test retry. No pull/build/install or
default application startup was performed.

All four owned containers were independently inspected stopped, matching run
labels, no OOM and no published ports. Test exit1 is preserved as a real failure;
probe, seeder and PostgreSQL exit0 are infrastructure cleanup results, not a
way to override that failure.

```text
wepuu-r19-20261024130610792-probe
wepuu-r19-20261024130610792-target-tests
wepuu-r19-20261024130610792-target-pg
wepuu-r19-20261024130610792-target-seed

retained network: wepuu-r19-20261024130610792-target-net
retained data volume: wepuu-r19-20261024130610792-target-data
retained evidence volume: wepuu-r19-20261024130610792-target-evidence
```

No old R17 resource was reused, and no current resource was automatically removed.
D: free bytes were6219726848 before the run and6186172416 at the runner's postcheck,
above the unchanged5GiB initial/2GiB ongoing gates. All frozen input hashes still
matched at both runner and subsequent host-only verification. Worktree was clean
before this record was added.

Host private evidence was ACL-verified for the current user, SYSTEM and
Administrators. Container evidence uses fixed schema, ownership/permissions,
size limits and exclusive writes. Backups/credentials/raw artifacts are not
committed or published. Private result:
`C:\Users\liulo\AppData\Local\Temp\wepuu-r19-reconsent-sWke7A\result.json`.

```text
result SHA-256: baa894de066ec93177a6813908b20c0d0938d449201eec95328661bd01e1c729
instrumented test: 40fc41b48b02f5fb99e9ecfdbaab5f983956590c0e54cc97ea0d7e93374d90c3
unchanged R18 diagnostic helper: f86f942b671fbbab740442c77538b6a6164af58146e24f8baa594634ede5731d
target ledger helper: d36afca44c3ec5d25bcc3bd9623b79046aac53f1b64a55bbbbc16159455f88bf
worker: f445cc0dab8aa46caf9f5e3902bd6bd4da15aa4f2300409b12c3050a856e8be6
target schema: f39bfd41441adf99d3aa9fb7e158723141661cc14e099d517a3938d9fe8f3e2c
host runner: 9b1fde14a1e8745780d93b50e77052d7ee0c697075ee59f130b3b2d830d36895
synthetic tool: 73d9127dde686db0058b4066a484901db9ec9b91a99964cc53d44ad95c198ba7
```

## Final states and next boundary

```text
P3E2SR4BR19_SINGLE_TARGET_ATTEMPTS=1
P3E2SR4BR19_DIAGNOSTIC_REPRODUCTION_COMPLETE=True
P3E2SR4BR19_FIRST_FAILURE_IDENTIFIED=True
P3E2SR4BR19_TARGET_DATABASE_TEST_PASS=False
P3E2SR4BR19_TARGET_MIGRATION_COVERAGE_PASS=True
P3E2SR4BR19_CLEANUP_PASS=True
P3E2SR4BR19_REPAIR_PERFORMED=False
P3E2SR4BR19_FULL_DATABASE_REGRESSION_EXECUTED=False
P3E2SR4BR19_LEGACY_CONSOLE_EXECUTED=False
P3E2SR4BR19_SERVICE_STARTUP_EXECUTED=False
P3E2SR4BR19_AB_EXECUTED=False

P3E2SR4BR18_R17_FIRST_FAILURE_CONFIRMED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The next candidate is a test-fixture-only adaptation using the reviewed classified
Code-to-R0-to-R1 issuance path and a separate chain for the second Grant, while
preserving all original re-consent/replay/revocation assertions. It requires a
new approved task and validation. This round did not implement that repair,
relax any guard, retry the target, run the full regression/Console, or touch
production. Local commits only; no push, PR, merge or deployment. Stop here.
