# P3-E2S-R4B-R88: exact landed candidate for one Hosted full regression

## Candidate scope and pre-CI status

R88 submits the already accepted/landed helper and ESLint repairs for a
single new run of the existing Phase 2 Platform workflow. This document
records the candidate BEFORE that CI result. It is not a full-regression
pass. The eventual result must identify this candidate's actual commit
and run rather than treating R86's helper acceptance as full CI evidence.

Existing Draft PR: https://github.com/wepuu/wp-auto/pull/104
Branch: codex/p3e2sr4b-r68-ci-20261027.
Verified pre-append local/remote Head:
`1db6d3429876862025eab24ad2466c5f90aa030c`.
PR was OPEN and Draft; index had no pre-existing staged changes.

This PR inherits the R68 candidate's broader R4B history (86 earlier local
R4B commits plus the R68 integration commit). This is not a newly isolated
six-file PR. R88 is an ordinary append commit: no rebase, amended history,
force push, main update, merge, release workflow or deployment is authorized.

## Exact formal changes

Only six existing source/config files are selected:

- eslint.config.mjs
- packages/database/test/otp-migration-evidence.mjs
- packages/database/test/r17-migration-evidence.mjs
- packages/database/test/r19-target-ledger.mjs
- packages/database/test/reconsent-diagnostic.mjs
- packages/database/test/reconsent-native-fixture.mjs

The native helper is the earlier R79/R80 accepted landing. The other four
are the exact R85 candidates accepted by R86 and landed by R87. Their
executable ASTs are unchanged from the original implementations. No public
declaration, SQL, API, protocol validator, timeout or runtime logic changed.

The precise config includes the original typed-context repair for d.mts/mjs,
five explicit allowDefaultProject helper paths and the existing strict
project options. Only the baseline-justified exact-file readonly globals
are added. No typed rule, public contract or strict compiler setting is
disabled. Final config SHA-256:
`d378e2be5000a5aeff59eee695014d6d849cdf662e25ea9217efb7a8f9d04dc3`.

The six tracked files have 309 insertions and 75 deletions including the
previous native/ESLint draft work. Necessary sanitized records R68, R79,
R80, R83, R85, R86, R87 and this R88 record accompany the append commit.
Other untracked history/tools are not batch-staged or removed.

No local backup, ACL descriptor, private original, .tmp tree, credential or
retained dependency/cache is submitted. Local R87 recovery manifests and
custody tools are not CI runtime dependencies and remain local. Their
hashes below establish local acceptance lineage, not a nonexistent Hosted
dependency on private evidence files.

## Verified acceptance lineage

| Local evidence | SHA-256 / result |
| --- | --- |
| R79 native fixed-environment acceptance | `0447ab9ab4f1b0cc812bfef598a022565c67192582a5160276c5e35e5f0dd878`, pass |
| R80 native exact landing | `7a1c9e193a643106765379ac803460395cfe7b09acec00fbfc9da96451a4a32d`, pass |
| R86 four-helper fixed-environment acceptance | `53e1ec467dab02cb0cd9c8f7c63cd88fce055fa680ebd1ba391a7410aaea3c48`, pass |
| R87 exact landing | `0e267b3d105b23f127481ae41e7eef05ea065ddfd87f72c4704846806acc11dc`, pass |
| R87 117-input derived manifest | `8286d4011cbc2ba5f31861abec36c195a54b73e4307179c3f22683bf939fb74d`, verified |

R86 passed full configured ten-file lint, scoped strict checkJs, original
public contracts, 187 Node 24 behavior comparisons and four Linux private
write comparisons. R87 landed the exact accepted bytes and passed ACL,
AST, hash/manifest and 187 host behavior comparisons. These do not replace
the full root/database/image/conformance gates that R68 CI skipped.

Historical R68 CI 40421601069 failed in Strict checks at the ESLint typed
context gap, not an observed OAuth runtime failure. R83's 16 candidate lint
findings and R85's diagnostic-code-expectation failure remain recorded.
No prior failed run is rerun, erased or relabeled as passing.

## Lightweight local preflight

- R87 parent/acceptance hashes and all 117 landed input hashes verified.
- Current candidate wiring contracts: 45 checks passed.
- Inventories: 59 unit files, 18 database-directory files, pure mapping
  top-level counts 43, two legacy-compatibility files, one native DB file.
- Four database typecheck-core path/options/safe-diagnostic tests passed.
- Staged content, syntax/whitespace and unchanged workflow triggers checked.

Local utility checks use available host Node 26; the supported application
runtime is still Node 24.22.1. R88 does not install dependencies, build local
images or repeat local full compiler/database/application regressions.

## One Hosted run and immutable boundaries

Push only this ordinary candidate append to the existing branch. Let its
pull_request event create one Phase 2 Platform run. Do not issue another
workflow_dispatch, rerun job/run, corrective push or automatic repair after
the first result. Keep the PR Draft and do not trigger Publish production
images, which is a separate manual-only workflow.

The unchanged workflow performs fixed dependency/type-support installs,
strict root checks, complete database-test typechecking, frozen-input
postchecks, three OCI builds and isolated image regression, signing OCI,
isolated backup/restore, PHP interoperability, audit, SBOM and retained
conformance/evidence checks. A green early stage is not an overall pass;
all required stages must execute and pass at the exact candidate Head.

Candidate database profiles continue to exclude 014. The existing explicit
allow-isolated setting permits 014 only in disposable legacy regression
databases. There is no production database access/migration or automatic
migration in image startup. Images are built/tested only on the runner,
not published or deployed. Content/data-plane and auth isolation boundaries
remain unchanged.

## Reporting and stop

After the run, preserve safe step conclusions and project only the first
failure's fixed category, rule/diagnostic IDs, location and exit state.
Do not save raw logs, exception text, tokens or synthetic request bodies.
Report skipped required steps as NOT_RUN, never as pass. CI timeout,
dependency/audit failure or incomplete evidence cannot establish acceptance.

Record the actual append Head, run ID/attempt, required-stage coverage and
final result in a separate local result record and PR Conversation comment.
Do not push a result-only commit that triggers an unnecessary second run.

Pre-submission states in THIS candidate document:

```text
R88_LANDED_BASELINE_VERIFIED=True
R88_LOCAL_WIRING_CHECK_PASS=True
R88_CANDIDATE_COMMIT_CREATED=NOT_RUN
R88_HOSTED_CI_HEAD_MATCH=NOT_RUN
R88_HOSTED_STRICT_CHECKS_PASS=NOT_RUN
R88_FULL_DATABASE_TYPECHECK_PASS=NOT_RUN
R88_HOSTED_IMAGE_MATRIX_PASS=NOT_RUN
R88_FULL_REGRESSION_PASS=False
R88_HOSTED_CI_PASS=NOT_RUN
R88_CI_RUN_ATTEMPTS=0
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
R88_PRODUCTION_DEPLOYED=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after the single result and coverage review. No production OAuth/MCP,
account/Grant change, Connector edit, real email, release, PR merge or
automatic follow-up repair is included.
