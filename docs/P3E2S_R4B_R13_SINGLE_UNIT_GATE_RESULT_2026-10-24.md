# WPAuto P3-E2S-R4B-R13: single complete unit gate result

## Outcome and scope

The approved R13 scope was implemented. One complete unit attempt produced a
VALID report but **did not pass**: the existing Site B Compose-render test emitted
one unapproved skip. There were no recorded test failures, missing files or
unmapped events. Zero assertion failures is not a substitute for gate acceptance.

No post-failure repair, dependency installation, skip-policy change or retry ran.
Database, Console014, A/B and production remain NOT_RUN. No WordPress, Desktop,
OTP, OAuth or MCP activity occurred.

R13 code frozen at `bf3d6124c0b5537c48ff7ea540af7db8e0f45df6` on
`codex/p3e2sr4b-source-integration`, following R12 commits `0920ab5` and `a97ef69`.
The source was clean before execution and before this documentation addition.
Application/dependency/migration inputs were unchanged from fixed image revision
`c404ed52228ce5492a85674547998d2f5d31772e`.

## Independent coordinator and pre-execution checks

`scripts/run-r13-unit.mjs` is a new explicit one-shot entry; R11's entry and
historical results were not changed. Its exact read-only inventory includes the
repaired R10 test and new nested-report test that R11's inventory lacked.

The coordinator verifies clean source, R12 ancestry, fixed repaired-file/schema
hashes, exact helper inventory, the sorted unique56-file manifest, local Docker
context, fixed image/revision, runtime/loader, compiled inputs and disk limits.
Each setup failure has a safe stage/fixed category. A failed process cannot be
overridden by a passing report, successful cleanup or successful postcheck.

`scripts/r13-unit-coordinator.synthetic.mjs` executed13 in-memory cases, all
passed. No Docker was invoked by that simulation. Cases covered exact inventory
and missing mounts; one start only; creation failure with no start; preserved
failed report; missing/malformed report; nonzero transport with passing report;
report binding; prohibited skip; owned-only stop; stop/inspect/OOM failure;
postcheck failure; evidence-save failure; and raw-field suppression.

Host Node26 ran syntax and orchestration simulations only. Application/test
execution used the fixed container's Node24. No new `.test.mjs` was added in R13;
the current complete unit manifest remains56 files. No acceptance or skip policy
was relaxed and no previously failing assertions were removed.

## Frozen runtime and containment

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
image revision: c404ed52228ce5492a85674547998d2f5d31772e
compiled SHA-256: e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
compiled fileCount: 163
Node: v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader: /workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
```

The preflight probe remeasured the compiled fingerprint and runtime/loader, and
exited0. The image's default user is root; actual probe and unit invocation
explicitly used1000:1000. The coordinator neither rebuilt/pulled an image nor
invoked a package manager; the selected launcher used Node directly and added no
dependency-installation step. The retained image plus reviewed helper overlays is diagnostic execution,
not proof that a new release image includes these helpers.

Both containers had network none, read-only root, dropped capabilities,
no-new-privileges, no healthcheck, log driver none and bounded tmpfs. There were
no ports, host credentials, user config, SSH or Docker socket mounts. The16
allowlisted source files resulted in25 read-only bind mounts (including the9
helper aliases under `/harness/r10`). The runtime probe used one read-only file
mount. No entire repository or user directory was mounted.

The internal unit deadline remained240000ms; the outer transport deadline was
260000ms. Existing report/output budgets and test concurrency were retained.

## Single formal result

```text
run: r13-20261024110411210
UTC start: 2026-10-24T11:04:11.225Z
UTC finish: 2026-10-24T11:05:22.413Z
unitAttempts: 1
stage: unit_report
overall passed: false
category: TEST_FAILURE
reportStatus: VALID
process completed / exitCode: true / 1
spawnFailed / timedOut / outputLimitExceeded: false / false / false
process outputBytes: 0
report total / fileCount: 326 / 56
missing / unmapped events: 0 / 0
unexpectedEvent: false
recorded failures: []
skipCount: 33
```

`topLevelCountsMatch=true` is the reported field; the complete unit invocation
does not provide a per-file expected-top-level-count map, so it is not claimed
as independent frozen per-case-count proof. R12's separate44-case gate has that
explicit count map. The R12-related files have no recorded failure or skip in
this complete run, but the whole unit gate is still false.

### Skip classification

| Classification | Count | Coverage |
|---|---:|---|
| Existing approved offline skips | 32 | database-backed/service/PHP/Windows-only and explicitly profiled historical cases |
| Unapproved skip | 1 | `scripts/wordpress-site-b-template.test.mjs` Compose rendering |

The safe result contains the full per-file skip summary. In the approved group:
the closed database profiles account for25 skips; Control server, account-auth
PostgreSQL, PHP interoperability, Windows evidence ACL and R9 database each
account for1; R7's historical cases account for2. Their absence here is not a
database, PHP, Windows or service acceptance result.

### Static indication of the blocking dependency

`scripts/wordpress-site-b-template.test.mjs` is unchanged from the image revision,
SHA-256 `c0d9e341b30508e59262e5fa0f8ce55ad84a67532f5a21608818b65097591f32`.
Its sole skip branch is line47: `result.error?.code === 'ENOENT'` from spawning
the Docker CLI for `compose ... config --format json`. The test uses dummy
credentials and explicitly does not claim rendering passed when skipped.

This source condition plus the observed skip indicates that the Compose-render
invocation was unavailable in this test environment. The safe report does not
retain the skip message or raw child error, and no separate post-failure binary
probe was run. No Compose rendering result is claimed. The approved skip list
does not include this file, correctly causing the whole report to fail closed.

This does not identify a production fault and does not reconstruct R10/R11's
unretained inner diagnostics. No historical failed result is rewritten as PASS.

## End state and evidence

| Container | Final state | OOMKilled | Read-only binds |
|---|---|---|---:|
| `wepuu-r13-20261024110411210-probe` | stopped, exit0 | false | 1 |
| `wepuu-r13-20261024110411210` | stopped, exit1 | false | 25 |

The unit's nonzero exit is recorded as `UNIT_CONTAINER_FAILED`; that is not an
assertion that cleanup failed. Both owned containers were independently inspected
stopped. No unrelated containers, images, caches or files were removed.

The end postcheck passed: all16 overlay hashes and both coordinator hashes were
unchanged and source stayed clean. D: free bytes were6315241472 before and after,
above initial5GiB and subsequent2GiB thresholds. No threshold was reduced.

Private result (not committed):
`C:\Users\liulo\AppData\Local\Temp\wepuu-r13-unit-vlJdwl\result.json`

```text
result SHA-256: e8f52eca799d1ef186c540ab4a81b86f36fef54e4077462afe16834070a59ae9
coordinator SHA-256: a66c293df0cdd896467fc75c840bc9c2cafd8116e673e671165af14beb22940a
simulation SHA-256: 5c3f63d3f7b0d545c824aa6a8c613a53aaa5a3350cae4e6b355670c27789588a
```

The new evidence directory was made private to the current user, SYSTEM and
Administrators; the existing ACL verifier checked it before execution and again
before saving. The result was saved successfully with exclusive creation. It
includes every overlay hash, safe skip summary, process/report status and
postchecks, not raw stdout/stderr, exception bodies, credentials or assertion
values. No Hosted CI, push, PR, merge or deployment occurred.

## State and next separately gated scope

```text
P3E2SR4BR13_FULL_UNIT_EXECUTED=True
P3E2SR4BR13_SINGLE_UNIT_GATE_PASS=False
P3E2SR4BR13_DATABASE_EXECUTED=False
P3E2SR4BR13_AB_EXECUTED=False
P3E2SR4BR11_SINGLE_UNIT_GATE_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These candidate flags do not revoke or revalidate the historical bounded internal
trial. R12's offline pass is preserved without upgrading complete unit acceptance.

Stop here. The next scope should explicitly design an isolated execution/profile
for the required Compose-render check, with real equivalent rendering evidence
before considering any profile change. Merely adding the file to the allowed
skip list is not a repair. Do not install Docker into the readonly container,
mount its socket, switch to privileged/root execution or rerun this gate without
a separately approved plan. Database, Console and A/B remain independently gated.
