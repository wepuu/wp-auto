# P3-E2S-R4B-R91: offline fixed-runtime test context repair pass

## Outcome and boundary

R91 changes one existing test source, scripts/fixed-node-test.test.mjs.
The three real fixed Node+tsx startup tests now run only on Linux with
cwd exactly /workspace. Other contexts register the same tests with an
explicit pinned-image requirement as the skip reason. Existing five test
names, all runtime assertions, fixed runtime verification and manifests
are preserved. Context truth-table checks are added inside the existing
first pure test, not as extra top-level tests.

The local offline gate passed. Actual host Node testing reports five tests:
two pure tests passed, three image-specific tests skipped, zero failures.
This is not real image startup acceptance. VM and reporter controls pass,
but do not execute the image tests. No container/Docker, CI, commit, push,
production, database, migration, OTP or OAuth/MCP operation occurred.

Head remains 5cda5f299036df3df561aabb87c52914328ec48d. No public API,
declaration, helper, runtime/security validator, workflow, dependency or
test inventory changed. R90 failure remains historical.

## Backup and exact candidate

Target original SHA-256:
`3755fd04fcb1018756285d91327826ef11a371ef5a985e3f419db031410248d0`.
Fixed runtime verifier SHA-256, unchanged:
`7d3eed6e61d4c91df9c18898dfe741b78f4250c27e4628ddcb3df2e2613863db`.

Backup/state directory: .tmp/r91-offline-lYyEB8/. The original test bytes,
candidate bytes, permissions and hash identities are retained privately.
The target was verified regular/non-symlink and at the expected real path.
Owner/group/SDDL/mode and the previously verified ACL reader identity were
checked before/after. Raw ACL details are not exported.

Prepare receipt SHA-256:
`453f018a2184978f0a5c5dcb7b6462f87539d112436e858c6412b9a22363d60f`.
UTC preparation: 2026-10-27T15:26:26.916Z to 15:26:33.203Z.

One controlled patch applied the precomputed exact candidate and added
supplemental candidate metadata. Final test SHA-256:
`9959571736d2f93e9c5a17b0d23962013b138b8872d383c16a2555e3e396c854`.

The previous condition platform !== win32 implied all non-Windows hosts
supported the pinned image layout. Its replacement checks only platform
and execution root; it does not inspect file existence, version, UID,
loader or validation outcomes to decide whether to skip. In the selected
Linux /workspace context, all existing runtime checks still execute and
fail closed. No directory creation, symlink, fallback, install, repair or
automatic acceptance based on CI environment variables is added.

## Actual offline evidence

Receipt .tmp/r91-offline-lYyEB8/result.json, SHA-256:
`5f219cbb5a04d0c8469a31dd4de82a7a683cf0a43dd1d9bb25b9b29a23dec6bf`.
UTC validation: 2026-10-27T15:27:12.729Z to 15:27:17.223Z
(23:27 Asia/Shanghai). No failure or rollback occurred.

### Shared failure reproduction

The unchanged runtime module and original typedCase function are evaluated
in a VM with synthetic dependency operations, not imported as real startup
work. For each historical test definition at 36, 41 and 49, the trace is:

createRequire(/workspace/package.json) -> resolve(tsx) -> realpath ->
readFile(/workspace/node_modules/tsx/package.json) -> ENOENT.

The package read fails before runtime identity evaluation, fixture creation,
file writes or a child process. This reproduces the operation seen three
times in the safe R90 Hosted-log projection. The simulated foreign loader
resolution is controlled input, not evidence of how the actual runner's
resolver found its loader; no claim about NODE_PATH is inferred.

### Context and identity controls

Seven VM registration contexts preserve the original five names:

| Context | Image-specific skips |
| --- | ---: |
| Linux, exact /workspace | 0 |
| Linux, synthetic Hosted checkout | 3 |
| Windows, project directory | 3 |
| macOS, /workspace | 3 |
| Linux, /workspace-other | 3 |
| Linux, /workspace/subdir | 3 |
| Linux, literal /workspace/ input | 3 |

The final literal case tests the pure predicate; it does not claim the OS
returns trailing separators from process.cwd(). The predicate describes
the existing pinned image execution contract, not proof of container
ownership or a general container detector.

The existing first pure test executes in each VM context, including all
new truth-table assertions and unchanged verifier assertions. The exact
original fixedNodeTestCommand source additionally receives synthetic
identity providers: pinned identity accepts, while wrong UID, Node version,
LTS, loader path, loader hash or tsx version rejects with
TEST_RUNTIME_MISMATCH. Missing resolution rejects MODULE_NOT_FOUND.
Synthetic hash success is labelled synthetic; it is not real runtime or
loader-byte acceptance.

### Required image coverage cannot pass by skipping

The real existing reporter collect function receives synthetic events.
Skipping each image-specific case separately, or all three together,
returns a failing report with unallowed skips. Five non-skipped successful
events pass the control. The fixed test file is not added to the skip
allowlist. Thus a later image run with this file skipped must fail.

The existing 59-file image unit inventory includes the file. Actual future
image coverage is still required; synthetic report events and a host skip
do not prove the positive, assertion/missing-module or timeout/reporter
image cases passed. R91 intentionally stops before that acceptance.

### Actual local execution and wiring

Host Node v26.11.1 invoked the changed file through node --test with a
30-second limit and parsed only TAP numeric totals: tests=5, pass=2,
fail=0, skipped=3, cancelled=0. The three skipped callbacks do not invoke
fixedNodeTestCommand or create test fixtures. This actual execution
supports host routing and pure-test behavior only.

The VM child has a 90-second limit and bounded JSON output. New tools and
the changed test pass syntax checks. Current R68 wiring checks pass all
45 assertions, with 59 unit files, 18 DB files, 43 pure-mapping top-level
cases, two legacy-compatible files and one native DB file unchanged.
Raw VM errors/stacks, reporter values and host TAP text are not saved.

## Supplemental candidate protection

The target test and runtime verifier are outside the existing 117-input
map. Therefore R91 does not add entries to or rewrite the historical map.
It adds local supplemental-candidate-inputs.json with the base R89 manifest
identity, target original/candidate hashes and unchanged runtime hash.

Supplemental manifest SHA-256:
`bf89cd7e90f7f52ec5b8bb0e07dbdd296a6fb4d02f381a9d33229d39f61df55c`.
Base R89 candidate manifest SHA-256:
`7278900d8fdc99ec5f044ed5ccf84325712616aa210d665242f27a127555c934`.
All 117 inputs remain identical before/after. Reporter, skip allowlist,
image unit entry, test manifest, R90 failure record and historical tool
identities match the preparation snapshot. The target ACL is unchanged.

Tool hashes:

- worker.mjs: `94bc2df3e05c72435ba71a4f3a01832e90f8d1f5fd102104b4b3d118c7713921`
- validate.mjs: `b05415e197946cef3029c94d739c2aa683d31fe6aedfd273fd873e31e9a2f239`

All new tools, metadata, backups and this record remain local/uncommitted.
The only tracked source change is the test file. No unrelated user file
or design/ file changed, and no existing index content was staged.

## State and stop

```text
R91_MISSING_PACKAGE_PATH_REPRODUCED=True
R91_CONTEXT_ROUTING_PASS=True
R91_STRICT_RUNTIME_GUARD_PRESERVED=True
R91_IMAGE_SKIP_REJECTION_PASS=True
R91_ORIGINAL117_INPUTS_UNCHANGED=True
R91_PERMISSIONS_UNCHANGED=True
R91_OFFLINE_CANDIDATE_PASS=True
R91_CONFIGURATION_ROLLBACK_PERFORMED=False

R91_REAL_IMAGE_STARTUP_TESTS_PASS=NOT_RUN
R91_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop with the single-file candidate retained. A later separately approved
Hosted regression must prove both the explicit host skips and actual
non-skipped image execution. Neither scope alone establishes full
candidate acceptance, and this result authorizes no automatic CI retry.
