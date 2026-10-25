# WPAuto P3-E2S-R4B-R35 stale fixture baseline stop

## Result

R35 stopped in its first synthetic wiring invocation. The new runner and tests
retained R24's fixture freeze at `1105aa0`, which predates the R25 expiry
diagnostics commit `3a41e09`. This makes the fixture gate incompatible with the
current reviewed diagnostic inputs. It is a local wiring/baseline error, not
a failed OAuth candidate matrix.

No Docker command, image probe, build, service, database, migration, authorization,
Refresh/Replay or MCP operation occurred. Both matrix and transition remain
NOT_RUN. The failure-stop rule was honored: the baseline was not changed and
the suite was not rerun.

## First failure evidence

The worktree started clean after `78d5c8a`. Two new files were prepared:
`scripts/run-r35-ab.mjs` and `scripts/r35-ab.synthetic.mjs`. The runner derives
from R22/R24 without editing those historical files. It fixes the three R34
image IDs, candidate revision `1df4c857e667398ac71487f352fc3daa7ddbac8a`, and
compiled fingerprint `260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691`
with 163 files. Its selected scenarios are restricted to matrix then transition.
These actual images were not re-probed in R35.

The synthetic invocation emitted and exited 1:

```json
{"passed":false,"stage":"frozen_protocol","checksCompleted":139,"category":"R35_SYNTHETIC_FAILURE","rawOutputSuppressed":true,"dockerInvoked":false}
```

The first failed check compares the `test/persistent-authorization/r8` tree
against `1105aa0` and requires an empty `git diff --name-only` result. The
offline diff is nonempty. The 139 completed checks are not a complete-suite
PASS. Earlier synthetic result/identity/order checks and syntax-only child
execution do not substitute for the failed fixture gate.

The post-stop read-only comparison at 2026-10-25T10:05:46.7260058Z identified:

```text
test/persistent-authorization/r8/integration.mjs
test/persistent-authorization/r8/expiry-evidence.mjs
test/persistent-authorization/r22/report.mjs
```

The differences originate from:

```text
3a41e09 test: preserve expiry-stage diagnostics and record R25 offline review
```

The same scoped diff against `ab29f07` was empty. That later baseline is already
used by R27/R34's helper freeze. Current integration source SHA-256 is:

```text
9ae4dc84533c8d619bb117f158eb68029bbe1324767c8fdd08e2076ef1abbd4f
```

This matches the source accepted by R27/R34's scenario generator, not an
unexplained new worktree mutation. No app/package/deployment/config input
diff against the R34 candidate revision was found.

## Offline scope review and correction preview

The historical R25 change adds expiry stages, a bounded whitelist projection
and an `inspectExpiredSession` helper around the sequential A/B expiry checks.
It adds Code/link presence and one-row update assertions, retaining the existing
`denied` response assertions. The report change adds expiry fields to safe
projection. The expected 37/17 check-name sets were not edited by that diff.

The helper explicitly preserves the old sequential reuse of one Code across
A/B; it must not be presented as independent expiry testing. R34 separately
proved independent expiry cases. R35 did not execute either full scenario.

The next correction must explicitly review and freeze the intended R25 inputs
in both the R35 runner and its synthetic test, preserving all existing response,
permission, count, exit and stage-order checks. A precise manifest/hash freeze
or the reviewed later revision is appropriate only after that review; deleting
the freeze or ignoring differences is not. Both outdated locations remain in
the stopped implementation and must not be invoked as an accepted runner.

No runtime fixture change, image rebuild, dependency update or application
repair is needed to address this specific baseline mismatch. A subsequent
successful complete wiring suite is required before a newly authorized single
matrix/transition attempt.

## Boundaries and final status

Only local harness files and this record were added. Existing application,
protocol assertions, dependencies, migrations and production configuration were
unchanged. No production content, account, credentials, Site A or Grant was
accessed. There are no R35 containers to clean up. No push, PR, merge or
deployment occurred. Prior R34 success and R30/R24 failures are preserved.

```text
P3E2SR4BR35_WIRING_SYNTHETIC_PASS=False
P3E2SR4BR35_FIXED_CANDIDATE_IDENTITY_PASS=NOT_RUN
P3E2SR4BR35_AB_MATRIX_PASS=NOT_RUN
P3E2SR4BR35_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4BR35_MIGRATION_AND_PERMISSION_PASS=NOT_CONFIRMED
P3E2SR4BR35_CLEANUP_PASS=NOT_APPLICABLE

P3E2SR4BR34_EXPIRED_SESSION_PROTOCOL_PASS=True
P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after this record. Do not change the gate and rerun automatically, rebuild
candidates, weaken protocol assertions or continue to Desktop/production.
