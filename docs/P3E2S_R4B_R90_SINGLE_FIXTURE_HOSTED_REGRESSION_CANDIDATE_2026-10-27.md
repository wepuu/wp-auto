# P3-E2S-R4B-R90: single contract-fixture repair for one Hosted regression

## Candidate before CI

R90 submits the exact R89 offline-validated compiler-fixture change to the
existing Draft PR https://github.com/wepuu/wp-auto/pull/104. This record is
written before the append commit and Hosted result; it is not evidence
that full CI passed.

Verified parent Head (local, remote and PR):
`29ba03f642c32125d9c74dfc129ee9dd1f80530c`.
Branch: `codex/p3e2sr4b-r68-ci-20261027`. PR is OPEN/Draft. Existing inherited
R4B integration scope remains; no rebase, squash, force push, main update,
new PR, release workflow or deployment is included.

Only four files are selected for the ordinary append commit:

- packages/database/test/r43-helper-types.ts
- R88 actual Hosted failure record
- R89 offline contract-fixture pass record
- This R90 pre-CI candidate record

No helper, public declaration, ESLint/tsconfig, dependency, lockfile or
workflow changes are made. Other untracked histories, tools, local snapshots,
backups, ACL data and private .tmp artifacts are not staged or removed.

## Exact single source change and preserved contracts

Fixture SHA-256:
`08fa756a03d0e3da320217b151944f5800fefd95dd0e36238b41ffca24266836`.
The diff is exactly three insertions and five deletions: export the existing
kind/category witnesses instead of voiding non-call variables, and express
the forbidden diagnostic message access as an exported type-only index.
All six descriptive @ts-expect-error contracts remain active. The indexed
type is one line so the directive covers its actual diagnostic location.

There is no new any escape, suppression, public API, runtime validator or
security-contract change. This fixture is compile-only and is never
executed/imported as a runtime test by the offline checks.

R88 run 40521493678 is preserved as a failure in full-root lint: four
findings in this fixture, while the subsequent database/image/conformance
stages were skipped. R86/R87 helper acceptance and exact landing remain
unchanged and are not substituted for these missing full-regression gates.

## Fresh local preflight

R89 original receipt SHA-256:
`202ec392265051b17f24ea7aca9ed6993f40d8346f282f868e1c10599fd2d386`.
R89 local candidate-manifest SHA-256:
`7278900d8fdc99ec5f044ed5ccf84325712616aa210d665242f27a127555c934`.
The 117 candidate input hashes, R87 parent lineage, original backup,
owner/group/SDDL/mode and historical tool/evidence identities matched.

Fresh R90 preflight passed seven grouped gates. Receipt
`.tmp/r90-preflight-vay3pC/result.json`, SHA-256:
`637bc0c120a0d8e8943364467e2bb92417115558cd3dfe847d2f7728344a7a67`.

The existing R89 worker was invoked directly once with a 90-second limit
and safe output limit. The old exclusive result writer was not reused or
reset. Original four lint findings reproduced exactly; repaired single-file
full-rule lint/scoped typing was clean. Six removed-marker negative cases,
message-exposure TS2578 control and wrong-kind TS2322 control all passed.

Current wiring passed 45 checks: 59 unit files, 18 database-directory files,
43 pure-mapping top-level cases, two legacy-compatible files and one native
database file. Four typecheck-core tests passed. Existing js-yaml 4.3.2
parsed both workflows and confirmed the unchanged event/version/isolation
boundary. Staged bytes, file allowlist, whitespace and sensitive-pattern
checks are mandatory before commit.

Host checks use Node 26.11.1 with TypeScript 5.9.3, typescript-eslint 8.70.0
and ESLint 9.39.5. The in-memory fixture Program preserves strict language
options but isolates automatic ambient types and supplies its Program to
the parser. This is not the complete Node/Bun/React project-service check,
whole-workspace validation or Hosted Node 24 acceptance. No local dependency
installation, container start, image build or database run is performed.

## One Hosted run and stop policy

One ordinary commit/push to the existing branch is permitted after staged
checks and a final remote-parent check. Observe only its automatic
pull_request Phase 2 Platform run at the exact new Head. No dispatch,
rerun, corrective push or result-only follow-up commit is permitted.

The unchanged 20-minute workflow must execute its required root strict
checks, full 18-file database typecheck, frozen-input guard, OCI builds and
image matrix, signing, isolated backup/restore, PHP, audit/SBOM and retained
conformance/evidence stages. Designated offline/profile skips are disclosed
and correlated with the required real matrix coverage; unexplained missing
coverage prevents full acceptance.

Candidate database profiles exclude 014. The existing allow-isolated
permission permits 014 only in disposable legacy regression databases.
There is no production migration/access, image publication/deployment,
Connector or existing Site/Grant operation, OTP or real Desktop OAuth/MCP.

After the run, record the exact Head, run ID/attempt, stage coverage and
safe first-failure diagnostics locally and in one PR Conversation comment.
Never save raw logs, exception bodies or request data. A failure or skipped
required gate remains false/NOT_RUN rather than pass; stop without repair.

Pre-commit state in THIS document:

```text
R90_R89_CANDIDATE_VERIFIED=True
R90_LOCAL_PREFLIGHT_PASS=True
R90_MINIMAL_COMMIT_CREATED=NOT_RUN
R90_HOSTED_CI_HEAD_MATCH=NOT_RUN
R90_HOSTED_STRICT_CHECKS_PASS=NOT_RUN
R90_FULL_DATABASE_TYPECHECK_PASS=NOT_RUN
R90_HOSTED_IMAGE_MATRIX_PASS=NOT_RUN
R90_FULL_REGRESSION_PASS=False
R90_HOSTED_CI_PASS=NOT_RUN
R90_CI_RUN_ATTEMPTS=0
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
R90_PRODUCTION_DEPLOYED=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Keep this historical pre-CI record immutable; actual results belong in the
separate result/comment. Stop after the single run and coverage review,
without merging, deploying or reopening the accepted helper annotations.
