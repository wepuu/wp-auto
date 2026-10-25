# WPAuto P3-E2S-R4B-R28 source fix and test typecheck stop

## Outcome

R28 stopped at the first unsuccessful offline validation stage. The minimal
application source change compiled, but the database test-project typecheck
command failed. Focused Lint and unit tests were NOT_RUN. No candidate image
was built, and the strict A/B expiry regression was NOT_RUN. The fix is an
unvalidated local candidate, not an accepted protocol repair.

The safe stage record contains no matching compiler diagnostic, so the exact
test-project failure remains NOT_CONFIRMED. This is not evidence that the new
test alone failed or that the application source failed compilation. No retry,
threshold change, test weakening or follow-up container invocation occurred.

## Source change and planned tests

Implementation commit: `a9ea96ceea6e7160d4ac59594a36af5934b9c0a1`.
Only one application file changed: `packages/database/src/index.ts`.
The narrow catch surrounds the existing `consume_classified_artifact` query.
It converts only AuthorizationCode consumption with an Error instance,
SQLSTATE P0001 and exact known `persistent_grant_denied` message into the
existing generic OAuthInvalidGrantError. It does not catch the rest of the
transaction or change the SQL function, model classification, Session/receipt/
binding checks, one-use state transition, Refresh Replay or rate-limit branches.
The existing Database transaction still rolls back before rejection; a failed
rollback takes precedence rather than being hidden as invalid_grant. These are
source properties pending the planned behavioral validation.

The new `packages/database/test/authorization-consume-mapping.test.ts` defines
19 focused cases against the actual adapter and actual Database transaction,
with its Pool connect method mocked to a synthetic client. No real connection
is needed. Cases cover exact denial conversion, differing messages/SQLSTATEs,
permission/connectivity/timeout/unknown errors, non-Error values, wrong models,
earlier transaction failures, rollback failure, normal/missing consumption,
Refresh Replay/rate-limit preservation and sensitive-output exclusion.
These cases were not executed in this run. They are not19 passing tests.

`test/persistent-authorization/r28/focused.mjs` and
`scripts/run-r28-focused.mjs` coordinate the offline gate. The intended second
unit file is the existing resource-grant test. Source build, database test-project
typecheck, focused Lint and the structured unit reporter are sequential gates;
the worker stops on any failure instead of running later stages.

## One offline invocation

```text
run:r28-focused-20261025012059975
UTC start:2026-10-25T01:20:59.978Z
UTC finish:2026-10-25T01:21:30.376Z
Asia/Shanghai window:2026-10-25 09:20:59 to09:21:30
offline attempts:1
candidate builds:0
targeted service attempts:0
```

| Gate | Result |
|---|---|
| Host helper syntax and diff formatting | PASS |
| Fixed test-image identity and local Docker Context | PASS |
| Node v24.22.1/Krypton, pnpm11.19.0 and frozen tsx loader | PASS before source build |
| `pnpm build --pretty false` | PASS |
| Database test-project TypeScript check | FAIL, COMMAND_FAILED |
| Focused ESLint | NOT_RUN |
| Mapping/resource-grant unit tests | NOT_RUN |
| New candidate image build and compiled-difference check | NOT_RUN |
| Strict A/B expiry protocol regression | NOT_RUN |
| Owned test container stopped, no OOM | PASS |

The failing command was:

```text
pnpm exec tsc --project packages/database/test/tsconfig.json --noEmit --pretty false
```

It checks the database test-project scope, not only the new test. The test
container reused the retained test image with only the changed database source
and new test file overlaid read-only; it did not replace the entire historical
test tree. That coverage distinction must be considered during diagnosis, but
is not itself a proven reason for the failure.

The worker's safe compiler extractor accepts only two named file paths followed
by `(line,column): error TS...`. No line matched, leaving `diagnostics=[]`.
Diagnostic absence cannot be interpreted as no compiler errors. The worker
discarded raw stdout/stderr and did not retain a raw compile log, so the exact
error cannot be recovered from the saved result. It may be a different-file,
configuration/global or other unrecognized diagnostic; none is asserted as the
actual cause. No second compiler run was used to fill the gap.

## Isolation evidence and retained state

The fixed image was:

```text
sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
revision:c404ed52228ce5492a85674547998d2f5d31772e
platform:linux-amd64
```

No dependency installation or image pull occurred. The single offline compiler
container had network=none, no host write mounts, no Docker socket, no healthcheck,
disabled logging, all capabilities dropped and no-new-privileges. Its root
filesystem was writable only for disposable compilation outputs. Unlike the
previous formal service runs, this compiler container used UID0 to write the
retained image's root-owned workspace. It held no production credentials and
started no service main. This is not a UID1000 service-runtime acceptance.

Container `wepuu-r28-focused-20261025012059975` stopped with exit1 and no OOM.
No database, migration, synthetic OAuth flow or MCP request ran. No candidate
image was committed from this writable layer. The stopped container is retained;
no unrelated resource was removed or compacted.

Initial D free space was5811920896bytes, above the5GiB gate. Recorded input hashes
were unchanged through execution. The host evidence directory and result ACLs
were verified for the current user, SYSTEM and administrators:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r28-focused-kJJxrP\result.json
SHA-256:7b335c14e8b14241792c6299184b6f4a0e8e6ed8d8ec8b6ec3c9756d0cd63aec
```

No application file outside the approved database source was changed. The only
other package change is the new mapping test. SQL migrations, dependencies,
deploy definitions, WordPress and production configuration remain unchanged.
The platform content boundary is unaffected: no WordPress content, inputs or
outputs were received or relayed. There was no push, PR, merge or deployment.

## Next boundary and status

The next separately approved task should first improve safe TypeScript failure
classification to preserve compiler codes and sanitized locations, including
fileless/configuration diagnostics, without dumping arbitrary messages. It
should review the test-project scope and new test source offline, then propose
one bounded typecheck continuation if existing evidence remains insufficient.
Do not build a new candidate, change the application patch further or start the
R27-style protocol regression to diagnose this compiler failure.

```text
P3E2SR4BR28_SOURCE_PATCH_IMPLEMENTED=True
P3E2SR4BR28_APPLICATION_SOURCE_COMPILE_PASS=True
P3E2SR4BR28_SOURCE_FIX_PASS=NOT_CONFIRMED
P3E2SR4BR28_FOCUSED_TESTS_PASS=False
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4BR28_CLEANUP_PASS=True

P3E2SR4BR27_EXPIRED_SESSION_PROTOCOL_PASS=False
P3E2SR4BR24_AB_MATRIX_PASS=False
P3E2SR4BR24_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The existing R27 findings and historical failures are unchanged. Stop after
this record; source compilation alone does not establish the fix is correct.
