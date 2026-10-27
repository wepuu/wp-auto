# P3-E2S-R4B-R90: Hosted root tests stopped at fixed-runtime path

## Single submitted candidate and actual result

- Draft PR: https://github.com/wepuu/wp-auto/pull/104
- Head: `5cda5f299036df3df561aabb87c52914328ec48d`.
- Parent: `29ba03f642c32125d9c74dfc129ee9dd1f80530c`.
- Branch: `codex/p3e2sr4b-r68-ci-20261027`.
- Run: https://github.com/wepuu/wp-auto/actions/runs/40527029694
- Event/workflow: pull_request / Phase 2 Platform; attempt 1.
- Job: validate / 122269271516, completed, failure.
- Created UTC `2026-10-27T15:02:34Z`; run final updated_at
  `2026-10-27T15:04:08Z` (23:02-23:04 Asia/Shanghai).

Exactly one ordinary append commit and one non-force push occurred. Its
four files are the R89 fixture correction, R88 actual failure record,
R89 offline pass record and R90 pre-CI candidate record (435 insertions,
5 deletions). No helper, public declaration, dependency, ESLint, tsconfig
or workflow change was included. Other untracked histories, local tools,
snapshots, ACL data and backups remain local and unchanged.

PR #104 remains OPEN/Draft at the exact submitted Head. No second commit,
push, workflow dispatch/rerun, merge, image publication or deployment was
performed. The committed pre-CI record is not rewritten as a passing result.

## Local preflight

Fresh receipt `.tmp/r90-preflight-vay3pC/result.json`, SHA-256:
`637bc0c120a0d8e8943364467e2bb92417115558cd3dfe847d2f7728344a7a67`.
All seven grouped gates passed:

- Fixed parent Head and all 117 R89 candidate input hashes.
- Original backup, unchanged target ACL and historical identities.
- Direct bounded R89 worker replay: original four findings, repaired
  full-rules single-file lint/scoped types, six negative cases and both
  public-type regression controls.
- Current 45 wiring checks and four typecheck-core tests.
- Workflow YAML/trigger/isolation checks and final file protection.

The worker ran with a 90-second limit; no old exclusive result file was
rewritten. Local checks remain host Node 26 with isolated automatic ambient
types, not the Hosted complete Node 24 environment. No local Docker,
database, dependency install or application runtime test was executed.

## Hosted stage coverage

| Stage | Actual result |
| --- | --- |
| Checkout/setup/current wiring | PASS |
| Pinned pnpm/root frozen install | PASS |
| Isolated type-support frozen install | PASS |
| Deployment manifest syntax | PASS |
| Strict checks: root typecheck | PASS by command-sequence evidence |
| Strict checks: full root lint | PASS by command-sequence evidence |
| Strict checks: root test command | FAIL |
| Separate complete database test typecheck | NOT_RUN (skipped) |
| Frozen-input postcheck | NOT_RUN (skipped) |
| OCI builds and isolated image matrix | NOT_RUN (skipped) |
| Signing OCI/isolated backup/PHP | NOT_RUN (skipped) |
| Audit/SBOM/conformance/evidence checks | NOT_RUN (skipped) |
| Checkout cleanup and service-container stop | PASS |

The unchanged `pnpm typecheck && pnpm lint && pnpm test` chain reached its
tsx root test command. Therefore the preceding root compiler and full lint
completed successfully. There were no lint-rule or TypeScript diagnostic
records in the safe log projection. This confirms progress beyond R88's
lint failure, not full candidate acceptance or the skipped database gate.

Root reporter totals: tests 372, pass 337, fail 3, skipped 32, cancelled 0,
todo 0, suites 0. The 32 skips are observed reporter counts only; their
required coverage was not independently accepted because the image matrix
was skipped. No skipped required gate is marked passing.

## Safe failure evidence and limits

Classification: ROOT_TEST_FAILURE. All three failures are in
`scripts/fixed-node-test.test.mjs`:

| Definition line | Repository-static test title |
| --- | --- |
| 36 | R11 actual readonly Node+tsx runs typed fixture through dedicated reporter |
| 41 | R11 actual assertion and missing-module typed cases retain failed reports |
| 49 | R11 actual invalid reporter and typed timeout fail closed without retry |

The safe failure-window projection finds ENOENT and references to the fixed
/workspace tsx path in the detailed failures. Source inspection confirms
typedCase calls fixedNodeTestCommand, which resolves the loader and package
under /workspace, checks the pinned identity, and supplies /workspace as
the child cwd. The current root Hosted tests run outside that container
layout. This indicates a host-versus-container fixture path assumption,
not an observed OAuth, token, tenant or production service failure.

The exact missing-path operation and the minimal compatible repair still
require a subsequent offline reproduction. No production inference is made
and no runtime identity check, pin, assertion or test was relaxed here.

The first broad title-matching projection also matched successful tests
whose names contain the word failure. It was not used to identify failures.
A subsequent restricted projection required the actual failure marker and
matched only repository-defined static titles, yielding the three above.
Repeated appearances in the log summary are not additional failed tests.

Logs were processed in memory only. Output was restricted to command
markers, rule/code IDs, numeric totals, repository-static test titles,
allowlisted locations and fixed-path presence booleans. Raw error bodies,
assertion values, request data and stacks were not saved or published.

## Interrupted observation and completion

After the run had completed, automatic approval review hit the usage limit.
The rejected read command did not execute. No alternative path was used to
bypass that check. Following the operator's explicit continuation, normal
reviewed read-only calls confirmed the same completed attempt and performed
the safe log projection. No new CI execution followed the interruption.

This actual-result record remains local/uncommitted. A single PR result
comment reports the same failure and coverage without a result-only push.
The existing candidate and recovery artifacts are retained. Final candidate
input protection is checked against the R89 local 117-input manifest; the
historical R87 manifest remains unchanged, not falsely asserted to match
the intentionally changed fixture.

```text
R90_R89_CANDIDATE_VERIFIED=True
R90_LOCAL_PREFLIGHT_PASS=True
R90_MINIMAL_COMMIT_CREATED=True
R90_HOSTED_CI_HEAD_MATCH=True
R90_HOSTED_ROOT_TYPECHECK_PASS=True
R90_HOSTED_ROOT_LINT_PASS=True
R90_HOSTED_STRICT_CHECKS_PASS=False
R90_FULL_DATABASE_TYPECHECK_PASS=NOT_RUN
R90_HOSTED_IMAGE_MATRIX_PASS=NOT_RUN
R90_FULL_REGRESSION_PASS=False
R90_HOSTED_CI_PASS=False
R90_CI_RUN_ATTEMPTS=1
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
R90_PRODUCTION_DEPLOYED=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop. The next task may offline-reproduce the fixed-runtime test's missing
path and design explicit host/container execution boundaries. It must not
automatically retry CI, weaken runtime verification, reopen accepted helper
annotations, access production or change Desktop OAuth/MCP authorization.
