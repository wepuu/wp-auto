# P3-E2S-R4B-R92: fixed-runtime test context for one Hosted regression

## Pre-CI candidate

R92 submits only the R91 test-context repair to existing Draft PR
https://github.com/wepuu/wp-auto/pull/104, branch
codex/p3e2sr4b-r68-ci-20261027. Verified pre-append local/remote/PR Head:
`5cda5f299036df3df561aabb87c52914328ec48d`.
This document precedes the actual append/CI result and is not a CI pass.

Only four files are selected: scripts/fixed-node-test.test.mjs, R90 actual
failure record, R91 offline pass record, and this R92 candidate record.
All other untracked tools, backup/ACL metadata, supplemental manifests and
private .tmp evidence stay local. No new PR, rebase, amend, force push,
main update, release publication, merge or deployment is included.

## Exact accepted offline repair

Target candidate SHA-256:
`9959571736d2f93e9c5a17b0d23962013b138b8872d383c16a2555e3e396c854`.
The test diff is ten insertions and four deletions. It replaces the broad
non-Windows condition with Linux plus exact /workspace cwd, adds context
truth-table checks inside the existing pure test, and gives the three
image-specific cases an explicit skip reason elsewhere. Five original
test names and their original runtime assertions remain unchanged.

Context selection does not inspect loader existence, UID, version, hashes
or error outcomes. In the intended image context, all fixed identity and
failure assertions still execute; no missing dependency becomes a skip.
The fixed runtime verifier SHA-256 remains
`7d3eed6e61d4c91df9c18898dfe741b78f4250c27e4628ddcb3df2e2613863db`.
No helper, declaration, lint/tsconfig, dependency or workflow is modified.

## Fresh preflight and evidence limits

R91 actual offline receipt SHA-256:
`5f219cbb5a04d0c8469a31dd4de82a7a683cf0a43dd1d9bb25b9b29a23dec6bf`.
R91 supplemental candidate map SHA-256:
`bf89cd7e90f7f52ec5b8bb0e07dbdd296a6fb4d02f381a9d33229d39f61df55c`.
The original 117 entries are not rewritten or expanded: this test and its
fixed runtime verifier are covered by the independent supplemental map.

R92 fresh preflight passed all seven grouped checks. Receipt
.tmp/r92-preflight-1Xc6df/result.json, SHA-256:
`e0a8d8b7ceea0273adf9dc4d4f7fafe45bfcadce849a6453189792b540ca0dc4`.
It verified parent/head, candidate, backup, ACL and historical protections;
replayed R91 VM path/context/identity/reporter controls with a 90-second
limit; ran the actual host test and existing wiring/core tests; parsed the
unchanged workflows; and rechecked single-source/permission boundaries.

Actual host test totals: five registered, two pure tests pass, three
explicit Requires-the-pinned-/workspace-image-runtime skips, no failure
or cancellation. This is host routing evidence, not startup acceptance.
VM evidence confirms Linux /workspace registers zero skips; incorrect
identities reject. Existing reporter controls reject any of the three
image cases skipped. Synthetic identity/events are not real image tests.

Current wiring: 45 checks, 59 unit files, 18 database-directory files,
43 pure-mapping top-level cases, two legacy-compatible files and one native
DB file. Four typecheck-core tests pass. The skip allowlist is unchanged
and does not include fixed-node-test.test.mjs. Host utilities use Node 26;
full supported-runtime/image acceptance remains Hosted work below.

## Single Hosted run and coverage contract

After exact staged allowlist/hash/sensitive/whitespace checks, make one
ordinary append commit and non-force push to the existing branch. Confirm
the remote parent again before pushing; drift stops execution. Observe
only the resulting automatic Phase 2 Platform pull_request run and exact
Head. Do not dispatch, rerun or issue a corrective/result-only second push.

Required coverage is the unchanged 20-minute workflow: root compiler/full
lint/unit tests; complete database test typecheck; frozen-input guard;
OCI builds/non-root identity; real isolated image unit/database/legacy/
startup/matrix/transition coverage; signing, backup, PHP, audit/SBOM and
retained conformance/evidence checks. Required skipped stages are NOT_RUN.

The host may explicitly skip the three fixed-image callbacks, but the image
must execute them successfully. Require the exact committed test bytes,
the unchanged five-test registrations, image execution at Linux /workspace,
the existing 59-file inventory including this file, and a valid passing
report with no missing file or prohibited skips. Overall skip counts alone
are not sufficient to prove this target coverage; other suites have
separately declared skips. If safe evidence cannot establish the required
image link, record NOT_CONFIRMED rather than modifying report/workflow
policy during the run or declaring full acceptance.

Candidate databases still exclude 014; only separately authorized disposable
legacy regression databases may execute 014. Images are built/tested only
on the runner, not published. No production host, database, email, actual
OAuth/MCP, Site/Grant or Connector action is included.

## Pre-submission state and stop

```text
R92_R91_CANDIDATE_VERIFIED=True
R92_LOCAL_PREFLIGHT_PASS=True
R92_MINIMAL_COMMIT_CREATED=NOT_RUN
R92_HOSTED_CI_HEAD_MATCH=NOT_RUN
R92_HOST_CONTEXT_ROUTING_PASS=NOT_RUN
R92_REAL_IMAGE_STARTUP_TESTS_PASS=NOT_RUN
R92_HOSTED_STRICT_CHECKS_PASS=NOT_RUN
R92_FULL_DATABASE_TYPECHECK_PASS=NOT_RUN
R92_HOSTED_IMAGE_MATRIX_PASS=NOT_RUN
R92_FULL_REGRESSION_PASS=False
R92_HOSTED_CI_PASS=NOT_RUN
R92_CI_RUN_ATTEMPTS=0
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
R92_PRODUCTION_DEPLOYED=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Record the actual commit/run/attempt, stage coverage and safe first failure
locally and in one PR result comment. Preserve R90/R91 history. Keep the
candidate commit and artifacts without automatic recovery, helper repair,
retry, merge or deployment. Stop after the single run and coverage review.
