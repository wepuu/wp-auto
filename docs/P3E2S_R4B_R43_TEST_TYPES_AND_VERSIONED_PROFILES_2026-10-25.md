# WPAuto P3-E2S-R4B-R43: test type boundaries and versioned profiles

Date: 2026-10-25. Parent evidence/source baseline: `b3ac0a9feac9c8841cdc5069b5cfde25558af18c` (R42).
Result: **PARTIAL / BLOCKED**, not full candidate acceptance.

## Authorized implementation

Only test declarations, test configuration/call sites and new versioned local
validation/profile tooling changed. Runtime source, migrations, dependency
manifests/lock, production configuration, R40 artifacts and frozen R10 profiles
were not changed. No install, pull, image build, service/DB startup, production
access, OAuth/Refresh/MCP, Hosted CI, push or PR operation was performed.

Added adjacent .d.mts declarations for r17-migration-evidence,
reconsent-native-fixture, otp-migration-evidence, r19-target-ledger and
reconsent-diagnostic. They expose closed stages/profiles/categories, structured
evidence and actual async results rather than wildcard any modules. Unknown
evidence is validated into typed observations. Diagnostic read results retain
the VALID/failure discriminated union; no raw exception body is exposed.
The dedicated r43-helper-types project exercises valid calls and six
@ts-expect-error negative contracts. It is compile-only, never executed.

The database **test** tsconfig adds standard ES2024/DOM/DOM.Iterable libraries.
Strict flags, exactOptionalPropertyTypes and skipLibCheck=false remain effective.
These libraries supply real Web API types used by dependency declarations;
they do not install browser code or change production base types.

An exact test-only paths entry maps @wepuu/database to ../src/index.ts. Without
it, tests mixed their source Database with the built package Database accepted
by imported Control code; private class fields made the types nominally
incompatible. This is not an unsafe cast or an application/runtime alias.
Both source prerequisites and focused tests compile in the fixed container.
Two existing tests now explicitly assert present audience/kid fixtures before
strict JOSE calls, and the redirect-loop Response has an explicit type.
No token/tenant/audience check or negative assertion was weakened.
An initial attempted cleanup-return adjustment was unrelated to the real
diagnostic locations and was fully reverted.

## Versioned profile

New r43/unit-manifest.json contains the exact current 58 top-level unit files
(the frozen 56 plus the two mapping files). New r43/profiles.mjs consumes the
unchanged R10 database classifications and adds a separate pureMapping group:

| Group | Files | Evidence expectation |
| --- | ---: | --- |
| Candidate database | 13 | Original database profile, unchanged |
| Retained database | 2 | Original retained profiles, unchanged |
| Legacy Console | 1 | Separately gated legacy database profile |
| Pure mapping | 2 | 19 Code-consume + 24 RT-find tests; no DB ledger |

The actual 18 database-folder test filenames are checked for exact coverage,
no duplicates and no unclassified files. Pure mapping files are not put into
the database skip list and do not fabricate migration evidence.

The new profile has an executable inventory/synthetic consumer:
`node test/persistent-authorization/r43/profiles.test.mjs`.
It passes 36 checks: inventory/partition drift and negative cases, plus
aggregation checks proving each missing/failed required stage prevents PASS.
Frozen R10 unit/database consumers and Hosted workflows were not silently
rewired. Running all 58 tests and integrating the versioned profile into the
later residual composite remain separately gated; this record is not that run.

## Bounded validation and chronology

Fixed pre-existing compiler image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
revision `c404ed52228ce5492a85674547998d2f5d31772e`.
Node 24.22.1/Krypton, pnpm 11.19.0, TypeScript 5.9.3.
Disposable containers used network=none, read-only source/harness mounts,
no new capabilities and no-new-privileges. Compiler prerequisite outputs stayed
inside disposable container filesystems, not application source directories.
Sanitized result.json evidence was saved in four new private host evidence
directories; no raw compiler messages or secret values were retained in this doc.

| Run UTC identifier | Result |
| --- | --- |
| r43-fixed-20261025121847113 | Runner stopped at config_parse: inherited DOM libraries differed from its old ES2024-only assertion. No compiler feedback iteration ran. Container exit 1. |
| r43-fixed-20261025121921386 | Compiler iteration 1: full command exit 2, 13 diagnostics (8 old test sites + 5 dependency declarations). Mapping 43/43. Its inherited old aggregate incorrectly ignored the new full-typecheck stage and emitted top-level PASS/exit 0. **That aggregate verdict is invalid and is not acceptance evidence.** |
| r43-fixed-20261025122207050 | Compiler iteration 2: full command exit 2, 10 diagnostics (5 old test sites + 5 dependency declarations). Dedicated declaration check, focused check, lint and mapping passed. Corrected aggregate FAIL, container exit 1. |
| r43-fixed-20261025122431916 | Compiler iteration 3/final: full command exit 2, **5 dependency-only diagnostics**, no first-party test diagnostics. All other required stages passed. Aggregate FAIL, container exit 1. |

The aggregation correction is in new R43 tooling only; the historical helper
was not edited. All four owned containers ended stopped, with OOMKilled=false.
Nonzero exits above are recorded test/runner failures, not normal success.
No fourth compiler feedback iteration was launched.

Final full command, unchanged:

```text
pnpm exec tsc --project packages/database/test/tsconfig.json --noEmit --pretty false
```

Final results:

| Gate | Result |
| --- | --- |
| Runtime identity / hash baseline / strict config | PASS |
| Compiler source prerequisites (no service start) | PASS |
| Dedicated declaration positive/negative check | PASS |
| Complete database test-project typecheck | FAIL: five dependency declaration diagnostics |
| Focused Code-consume/RT-find typecheck | PASS |
| Relevant lint, six files | PASS: zero messages/warnings |
| Pure mapping regressions | PASS: 43 passed, zero failed/skipped/cancelled/todo |
| Versioned profile and fail-closed aggregation synthetic checks | PASS: 36 |
| Source/tool input postchecks | PASS |
| Full 58-test suite, real DB/Console and startup regressions | NOT_RUN |
| Hosted CI / candidate image rebuild / production | NOT_RUN |

## Remaining precise blocker, not hidden by skipLibCheck

All five remaining rows have lock-verified package metadata and declaration
file hashes in private evidence:

| Package | Declaration / position | Code | Scope of finding |
| --- | --- | --- | --- |
| @better-auth/core 1.7.7 | dist/types/init-options.d.mts:16:26 | TS2307 | Declaration module resolution fails; exact missing public module NOT_CONFIRMED by the safe projection. Do not guess it from optional peer listings. |
| better-auth 1.7.7 | dist/plugins/organization/routes/crud-members.d.mts:1012:9 | TS2536 | Upstream generic indexing/type constraint diagnostic; no upstream fix or dependency upgrade claimed. |
| resend 6.32.1 | dist/index.d.mts:1:26 | TS2307 | react module does not resolve in this pinned compiler environment. |
| resend 6.32.1 | dist/index.d.mts:945:11 and 2198:10 | TS2503 (two rows) | React namespace unavailable. |

R30's 62-error failure remains historical evidence. New declarations plus
test-local Web types/type-source alignment remove the observed first-party
blockers; five dependency rows still prevent full acceptance.

No package was installed, no lockfile updated, no third-party declaration
patched, no wildcard ambient module created, and no skipLibCheck exception added.

Minimal next decision, **not executed here**:

1. Approve a test-toolchain-only dependency resolution task: identify the exact
   unresolved core import with bounded public-declaration AST evidence, select
   exact compatible real declaration dependencies (including React types where
   justified), and present the precise dev-only package/lock delta before install.
   A React typing addition is a candidate fix, not proof that all five rows vanish.
   Optional peer declarations alone do not establish the core missing module.
2. Reproduce the Better Auth TS2536 declaration constraint in a minimal offline
   type fixture. Do not upgrade Better Auth, change runtime deps or patch it as
   part of this already exhausted R43 feedback budget. Any eventual version/
   patch choice needs its own compatibility and artifact-provenance decision.
3. Then authorize a newly bounded full-command verification, followed only when
   clear by R42's finite residual unit/DB/Console/startup package. No repeated
   protocol matrix, deployment or production diagnosis is implied.

## Frozen inputs and state

Database runtime source SHA-256:
`8d59679bdc93517480e3fe634d13798bb7dfa5d896568e894b6f5279dcd08f35`.
Code mapping test SHA-256:
`3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16`.
RT mapping test SHA-256:
`4a66ec574fe35cc7812b418e1669b68fd8cce12cfa63b8030a978bac7fbcdee0`.
Unchanged lock SHA-256:
`cea3bc64773f878a668cabeb9d366086f69ad2c6921e5095ed6d49292bddad87`.

Only test/profile/validation/doc changes are present relative to R42; all
application sources, migrations and dependency metadata retain their bytes.
R40 images were neither rebuilt nor relabeled. This does not certify future
runtime provenance after any later dependency change.

```text
P3E2SR4BR43_TEST_PROFILE_PASS=True
P3E2SR4BR43_DECLARATION_TYPECHECK_PASS=True
P3E2SR4BR43_FULL_DATABASE_TEST_TYPECHECK_PASS=False
P3E2SR4BR43_MAPPING_REGRESSION_PASS=True
P3E2SR4BR43_RUNTIME_INPUTS_UNCHANGED=True

P3E2SR4BR41_AB_VALIDATION_PASS=True
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after this partial delivery. Historical single-Site read-only trial and
OTP policy are neither revalidated nor altered. No production state was read.
