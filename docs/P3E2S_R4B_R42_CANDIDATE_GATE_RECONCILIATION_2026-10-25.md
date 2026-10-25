# WPAuto P3-E2S-R4B-R42 candidate gate reconciliation

## Decision

The fixed R40 candidate has accepted targeted HTTP and complete isolated A/B
evidence, but its candidate gate status is BLOCKED. Known broad test-type defects,
closed test inventories that exclude the two new pure mapping tests, and missing
current-candidate residual regression/Hosted CI evidence prevent a complete
candidate acceptance verdict.

R42 is a read-only reconciliation, not a new execution. No test, compiler,
Docker command, database, application, network request or production operation
was run. Only this record is added. Existing failures and approvals are unchanged.

## Unique candidate and evidence identities

The candidate is the R40 artifact set, not current HEAD, main or an arbitrary
image tag:

```text
image revision:2ab57076511732fb2b2fbb1c50a03ee6c59ece4d
application baseline:f020e0065664ae2f98cc65f343bcf79b05f807fd
application fix:06b011de6de7b491f883e073f9f2f27e2af50bb3
Authorization:sha256:a5062dbc9f3fb52b9eeecd6ba5d8273cc5ac223a09fa3c07d632f48356a7eaaa
Control:sha256:93577d94ba77b0f1f6c5350ef29b8f8809e67c5dabb1b5589b16bd104d0ed937
Test:sha256:f22b9a507d6d713f678fe5d35a6c83b9324572503c1dbba28cd0433f5348d7c9
compiled fingerprint:6179918471d90689ce8693ee1423488bfcb1fcd48b357ac01a8c7963cb86b35d
source manifest:dde36cc57b4b1a7de3b433cb13e68d846e889d4a1555ea135aa9670d8c7cb641
R42 audit base:819f8a090cde574449c3c574d1c62b2959a5799f
```

The audit base changes no application/package/dependency/migration/deployment
input from the R39 baseline. The retained R39 fixed receipt, R40 build/run
receipts and R41 run receipt exist and all four full SHA-256 values match their
records. This confirms custody of existing evidence, not new runtime health.

| Evidence | Source identity and observation time | Scope |
| --- | --- | --- |
| R14 composite | f5d70ce2c367f778266c54ffdaf763d961bb6b1c;2026-10-24 | Historical Compose render plus frozen56-file unit profile |
| R21 database/Console | b4e5f99be0446fee3d1324064df0244c27639496;2026-10-24 13:35–13:37 UTC | Old compiled fingerprint e26eb91d…;15 database/retained files plus independent Console |
| R22 Authorization startup | 8dc96b3c734231535ca4a572154ae3b88e5473c1;2026-10-24 14:15–14:16 UTC | Old candidate; Authorization passed, Control failed |
| R23 Control startup | da6c151b7e4e7d80710517a4bfd20a422208a06c;2026-10-24 14:40–14:41 UTC | Old candidate; corrected fixture, two normal start/stop cycles |
| R30 broad test typing | 4296559fddefc02678b3522abcc65d748e79b3ac;2026-10-25 03:45–03:46 UTC | Coherent test project failed with62 diagnostic records |
| R39 focused typing/mapping | 06b011de6de7b491f883e073f9f2f27e2af50bb3;2026-10-25 10:49–10:50 UTC | Strict focused typing,3-file lint and43 unit cases |
| R40 build/HTTP | 2ab57076511732fb2b2fbb1c50a03ee6c59ece4d;2026-10-25 11:09–11:11 UTC | Exact candidate build and two targeted HTTP scenarios |
| R41 matrix/transition | 9ed2efe5f8039e5f483e81c9807bb658066fa6f0;2026-10-25 11:30–11:31 UTC | Same R40 artifacts,37 matrix and17 transition checks |

The original requirements are in ADR-024 and
P3E2S_R4B_SOURCE_INTEGRATION_STOPPED_2026-10-23.md. ADR-024 remains a proposed
local candidate decision, not authorization for production migration or rollout.

## Unique acceptance matrix

PASS below is limited to the stated requirement. A historical PASS remains
historical even where the current-candidate row is NOT_CONFIRMED.

| Requirement | Evidence and current applicability | Result | Blocks candidate gate | Minimum remaining action |
| --- | --- | --- | --- | --- |
| Fixed artifact/source identity and successful source build | R40; unchanged application inputs, same probes in R41 | PASS | No | Preserve exact IDs and receipt; no rebuild by default |
| Exact Code/RT rejection mappings and normal transactions | R39 fixed43-case suite; same application source in R40 | PASS, focused | No for this scope | Retain; do not call it complete typing/unit regression |
| Missing RT link through compiled HTTP service | R40 and R41,400 invalid_grant/no Tokens/no consumption | PASS | No | No repeat targeted scenario |
| Complete persistent A/B matrix | R41,37 unique checks, protected state and ledgers | PASS | No | No additional local matrix by default |
| B-stop/A takeover and lifetime/replay floor | R41,17 unique checks, independent DB, normal exits | PASS | No | No additional local transition by default |
| Complete strict database test-project typing | R30 failed; config/dependencies/helper declaration gaps have no recorded repair | FAIL, unresolved historical gate; not rerun | Yes | Repair accurate test-type boundaries and check the original complete project |
| Current complete unit/lint profile and inventory | R14 passed56-file profile; current tree has58 and R39 only focused lint | NOT_CONFIRMED | Yes | Correct closed inventory explicitly, then run complete remaining offline gates once |
| Complete database and retained native compatibility regression | R21 historical PASS predates both adapter mappings; current DB inventory also differs | NOT_CONFIRMED for R40 | Yes | Reuse15-file group with explicit pure-test partition and current artifact binding |
| Independent legacy Console regression | R21 historical1-file/1-case PASS; Console path unchanged but current image not exercised | NOT_CONFIRMED for R40 artifact | Yes for final regression package | One isolated Console run after successful DB group;014 only there |
| Direct startup/no-auto-migration prerequisites and Control initializer | R22/R23 historical passes; R41 covers normal Authorization A/B lifecycle, not every missing-schema/ledger/Control gate | NOT_CONFIRMED for the full current-artifact requirement | Yes | One residual startup package using current artifacts and reviewed fixtures; no A/B rerun |
| Compose/static ingress/deployment constraints | R14 historical PASS; relevant template/assertion files unchanged | PASS for unchanged static coverage; fresh render NOT_RUN | Composite package still needs final execution | Carry static contract; run only the existing content-free render with the final unit composite |
| Complete final Hosted CI and compatibility/security gates | Current local records report no push/PR/run for this candidate; workflow inspected only | NOT_RUN in reviewed evidence | Yes | Separately approve final branch/CI execution and verify actual Head/jobs |
| Production readiness, recovery/migration transition and real Desktop account switching | Outside these local passes; no new evidence collected | NOT_RUN | Separate release/product gates | Separate authority and plan; cannot be inferred from candidate acceptance |

## Why old regression passes cannot become current passes wholesale

The app/package diff from R21 to the R40 revision has exactly two runtime method
changes, both in packages/database/src/index.ts: the Code consume denial mapping
and the RT find classification denial mapping. It also adds the two pure test
files/two focused configs and the R34 build recipe. Other app/package runtime
sources, runtime dependency inputs and migrations are unchanged.

This supports inheritance of unchanged policy/static assertions, but adapter
find/consume participate in native multi-Site, tenant/provider and persistent
flows exercised by the wider database suite. The R41 custom matrix and focused
mock tests cannot establish all of that retained behavior. R21 therefore remains
accepted for its original artifacts, with a bounded current-artifact rerun
required rather than an invented failure or unqualified carry-forward PASS.

Console source/test and its store path have no change in the two-method diff.
Its historical behavior is supporting evidence. One isolated final smoke remains
in the original regression package to bind that result to the current Test image.
That does not authorize014 in a candidate/startup/matrix database.

R41 already proves current Authorization readiness and clean A/B exits. It does
not repeat R22's missing-schema42P01, missing-ledger-permission42501 or repeated
default startup checks, nor R23's production-compatible Control initializer and
no-send configuration. Retain those historical assertions and reuse them once
in a residual startup package; do not relaunch the accepted37+17 protocol cases.

## Two concrete test integration blockers

Read-only filesystem enumeration gives:

```text
closed unit manifest:56 files
actual unit inventory:58 files
removed unit files:0
added files:
  packages/database/test/authorization-consume-mapping.test.ts
  packages/database/test/refresh-find-mapping.test.ts
actual database-folder test inventory:18 files
existing database profile inventory:13 candidate +2 retained +1 legacy =16
```

The two additions are pure PoolClient-mocked unit files, with19 and24 cases
already verified by R39. They require no real DB. The current unit worker asserts
exact equality with unit-manifest.json, while the database worker compares all
database-folder .test.ts files against the16-file profile. The inventory mismatch
is established by source/filename inspection; no worker was launched to make it
fail again.

The minimal future partition is13 candidate DB +2 retained DB +1 legacy DB
+2 pure unit files, covering all18 explicitly. Keep the original15 DB/retained
files and separate Console intact. Update manifest/profile accounting and safe
expected counts, not the negative assertions or skip policy. The two new files
must not acquire artificial migration observations or be dropped from coverage.

For typing, packages/database/test/tsconfig.json still includes all test/helper
TS plus raw database source, with skipLibCheck=false. It is unchanged from R30,
as are tsconfig.base.json, account-auth's existing project config, package/lock
inputs and the old problem test/helper files. No companion .d.mts files currently
exist in packages/database/test. Only the new RT test and two focused configs
were added after R30. The exact current diagnostic count was not measured and
must not be asserted still62.

Known unresolved categories are Web/Crypto ambient references in locked auth
dependency declarations, React-related Resend declarations, accurate signatures
for five local .mjs helpers, two incompletely attributed dependency records and
eight concrete old test call/inference sites. R30 gives file/position/package
identities; R42 does not propose a guessed broad cast or dependency upgrade.

The future repair should scope necessary types to tests, supply real helper
signatures and then re-evaluate remaining sites. Do not enable skipLibCheck,
remove tests, add wildcard any modules or change production base types to hide
the errors. A pinned type-only dependency, if necessary, needs an explicit
decision; no version, install or lockfile edit is approved by this record.

Root pnpm typecheck is tsc -b over source projects. It does not run the complete
database test tsconfig. Thus source build, focused PASS or even pnpm check cannot
alone clear this separately identified hard test-typing gate.

## Finite completion package for later approval

1. **Repair only test integration and type boundaries.** Preserve protocol/runtime
   code. Resolve the known type blockers, admit the two pure tests explicitly and
   validate the complete unchanged database test-project command. No repeated
   diagnosis invocation merely to rediscover the same gaps. If runtime source or
   dependencies must change, stop and reassess the candidate rather than silently
   retaining R40 identity.
2. **Run one residual local regression package after those repairs.** Include the
   complete offline source/lint/unit composite and content-free Compose render;
   the15-file candidate/retained DB group; only after its success/normal stop, the
   independent Console file; and current-artifact startup prerequisites/Control
   lifecycle. Preserve existing time, output, disk, permission and fail-stop
   budgets. Explicitly bind any reviewed read-only test overlays to their hashes;
   do not call overlaid tests a newly baked release image. No R40 targeted HTTP
   or R41 matrix/transition rerun is part of this local package by default.
3. **Authorize final branch/Hosted CI separately.** The current
   .github/workflows/phase-2-foundation.yml performs frozen dependency install,
   pnpm check, ordinary portable image builds, the entire persistent image
   workflow, signing OCI, disposable backup/restore, PHP proof interoperability,
   dependency audit/SBOM and retained OAuth/contract checks. These requirements
   must not disappear behind a documentation-only green run. It also does not
   explicitly run the strict database test tsconfig, so that gate needs its own
   retained result or approved CI integration.

The existing Hosted workflow rebuilds images and reruns the matrix. This is a
separate final-CI policy decision, not authorization to launch another local
matrix now. Either explicitly run that unchanged final workflow once, or first
approve an equivalently strict staged workflow with enforceable artifact/source
linkage. Do not simply skip its jobs and claim full CI from R41.

Test-only config/declaration changes do not automatically require a protocol
rerun. Their actual effect on emitted runtime files, runtime dependencies and
artifact provenance must be reviewed before deciding evidence applicability.
A new source label or changed lockfile cannot be silently represented by the
old fixed image. Any further runtime change invalidates an automatic complete
carry-forward verdict and requires targeted impact review.

## Status and stop

```text
P3E2SR4BR42_EVIDENCE_RECONCILIATION_COMPLETE=True
P3E2SR4BR42_REMAINING_GATES_DEFINED=True
P3E2SR4BR42_CANDIDATE_GATE_STATUS=BLOCKED

P3E2SR4BR41_AB_VALIDATION_PASS=True
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This audit preserves the separately approved historical single-Site read-only
trial; it neither revalidates it nor revokes it. OTP production policy is not
queried or changed. No new application/test/config/profile file, credential,
backup, image or protocol state was written. No test/CI, Docker command, SSH,
production login, OAuth, MCP, push, PR, merge or deployment was performed.
Stop after this candidate verdict and finite completion list. The next minimal
implementation task is the test-type/profile repair, not deployment or another
protocol matrix.
