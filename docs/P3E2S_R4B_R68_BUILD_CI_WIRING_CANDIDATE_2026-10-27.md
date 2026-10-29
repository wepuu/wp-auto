# P3-E2S-R4B R68 — Formal build/CI wiring and frozen candidate submission

Date: 2026-10-27 (Asia/Shanghai)
Tested input HEAD: 24fba1c4dc8c30eb1c66a329a59d5b402651f67a
Candidate branch: codex/p3e2sr4b-r68-ci-20261027

## Scope and status at candidate freeze

R67 materialized the eleven dependency/typecheck files. R68 connects those
inputs to the formal image builds and Hosted CI, versions the current test
inventory and prepares one Draft PR/CI execution. This record is written
before submission: **Hosted CI and full regression are NOT_RUN at this commit.**
Actual Head/run/result will be recorded in a PR comment and a separate local
result record after the single run, not by amending this commit and triggering
another run.

The branch deliberately inherits the existing R4B source-integration history
(86 commits after origin/main e8778da33d850303d1ccbdfbebf088610bf6ac5f),
including ADR-024 and candidate migrations 016/017. The PR is a complete R4B
candidate integration, not a claim that those runtime changes were introduced
or accepted by R68. No main rebase/merge, production change or publication is
authorized. The original working tree and untracked historical tools remain.

## Docker cleanup requested before R68

A read-only inventory of the local desktop-linux named-pipe context found:

- 43 distinct images and 162 containers.
- 15 WePuu-tagged project images; all 15 have container references.
- 155 WePuu-named containers, none running.
- No unreferenced project image was eligible for direct safe deletion.
- Initial D: free bytes: 5472739328 (approximately 5.1 GiB).
- Docker reported 12.83 GB build cache, which was not within the image-only
  cleanup authority and was not pruned.

**Deleted images: 0. Reclaimed bytes: 0.** No forced image removal, container
removal, volume/network deletion, build-cache prune, other-project cleanup,
Docker restart or virtual-disk compaction was performed. Shared/reference
sizes must not be summed and reported as Windows reclaimed space. Further
cleanup would require explicit authority for stopped historical containers or
build cache. R65/R66 evidence resources and the fixed tool image were retained.

## Confirmed integration gaps and changes

### Build inputs

Both formal Containerfiles now COPY the exact root patches before the first
root frozen install. The Authorization test stage separately installs the
type-support workspace with --frozen-lockfile, --ignore-scripts and
--ignore-pnpmfile, and runs the explicit 18-file strict typecheck.

The production stages do not inherit that test-stage type-support install.
Fixed Node 24.22.1 image digests, pnpm 11.19.0, non-root production users and
direct service main commands remain. No automatic migration was added.

The two byte-pinned patch files are explicitly LF in .gitattributes. The
Bun patch's two required single-space blank context lines are exempt only
from blank-at-eol whitespace lint for that exact patch path. Their original
patch bytes and lock identities remain unchanged; source whitespace checks
are not disabled.

The retained R65/R66/R67 Markdown records also retain their existing two-space
hard breaks through a narrowly scoped whitespace attribute; their evidence
bytes are not rewritten merely to satisfy source-code whitespace rules.

### Typecheck source ownership

The R67 helper unconditionally rejected /workspace/apps and /workspace/packages,
which also rejected the legitimate formal image root. R68 changes only that
test-tool guard: every TypeScript program source must be within the actual
candidate root, using platform-aware path.relative boundary checks.

A real /workspace candidate is allowed; foreign /workspace source for a
/tmp candidate, sibling-prefix paths, parent escapes and another Windows
drive are rejected. Existing declaration realpath/hash checks and all strict
options remain. This is not removal of the old foreign-source protection.

The root core test file now has four tests rather than R67's three. These two
helper files intentionally differ from their R67 materialized bytes; R67's
historical exact-byte result is not rewritten. Runtime code, both declaration
patches, root package manifest and candidate lock bytes are unchanged by R68.

### Versioned current inventories

The new r68 unit manifest contains exactly 59 files: frozen R43's 58 plus
scripts/database-test-typecheck-core.test.mjs. R10/R43 history is unchanged.

The active image unit entry now uses r68/unit.mjs with the existing safe R10
reporter/process contract. It also executes a declared no-database mapping
count subgate for the two pure mapping files (19 + 24 = 43 top-level tests).
This is a planned count gate, not an automatic retry of a failed full suite.

The database directory's exact 18-file inventory is split into 13 candidate,
2 retained, 1 legacy Console and 2 pure mapping files. The mapping files run
without a database. Existing no014 assertions are retained. Additionally:

- scripts/multisite-r9-database.test.mjs runs as one native/classification
  database regression using the existing test's isolated authorization profile.
- account-auth-postgres.test.ts (1 top-level test) and Control server.test.ts
  (24 top-level tests) run against separate disposable legacy-compatible
  databases, not candidate/startup/matrix databases.
- The reporter uses basename keys for expected counts when a full test path
  is supplied; it still rejects skipped/missing/failed required tests.

014 remains allowed only in explicitly isolated legacy databases. The
authorization candidate profile remains exactly 001–013 + 015 + 016 + 017,
16 migrations and no014. The runtime non-DDL and role-separation tests remain.

Historical opt-in R7 characterization skips are not enabled or misrepresented
as current acceptance. Current R9 native/classification, candidate database
and A/B runtime tests provide the relevant replacement coverage. Linux skips
of Windows ACL checks and image skips of PHP are disclosed: Windows custody
has historical R64/R67 evidence, and CI retains the separate PHP gate.

### CI identity and steps

The read-only-contents validation workflow explicitly checks out the PR head
SHA (or ordinary github.sha outside PRs) and uses that same candidate revision
for image labels and source gates. A synthetic merge SHA is not silently used
as if it were the submitted Head.

Before existing checks, CI runs the new wiring contracts. It installs the
isolated type-support workspace, runs pnpm check, runs the explicit complete
database strict typecheck after the build, and rejects frozen-input drift.
It then retains the formal non-root builds and existing image matrix,
signing OCI, backup/restore, PHP, audit/SBOM and conformance gates.

The 20-minute workflow budget, security checks and read-only repository
permissions remain. The production-image publishing workflow is not modified
or dispatched. This task will open one Draft PR and observe its automatic
validation run; no extra workflow_dispatch/rerun is planned.

## Local verification

Performed using the pinned host Node 26 utility, not as a substitute for the
Node 24 compilation or application test gate:

- 45 pure wiring/inventory/negative checks passed in the clean candidate tree.
- Four core tests passed, zero skips/failures; none creates a compiler program.
- Current unit/database entries passed syntax checks.
- Workflow parsed with the existing read-only js-yaml 4.3.2 utility.
- Exact current 59-file and 18-file inventories were checked.
- Historical patch/lock versions were not regenerated.
- No local pnpm install, TypeScript build, application start or database run.
- No local candidate Docker build or runtime matrix was executed.

The local result is not a Hosted CI pass. Any required CI failure, incomplete
coverage or unavailable result must stop the run and leave full regression
unconfirmed; no dependency upgrade, relaxed rule or automatic retry follows.

## Data boundary and delivery

R68 modifies build/test/CI plumbing only, in addition to carrying the R67
formal inputs. No Connector or OAuth protocol implementation was changed by
R68. Existing strict signature/issuer/audience/site/tenant/grant/scope checks
remain. CI uses local synthetic accounts, OTP senders, keys and protocol
artifacts; it must not use production secrets, hosts, accounts or content.

Only the formal candidate, required current harness wiring and sanitized
R65–R68 records are submitted. No private original backup, permission
descriptor, .tmp tree, environment file, token or workstation credential is
submitted. Earlier tracked integration history is preserved, not bulk-copied
from untracked diagnostic directories.

At submission:

    P3E2SR4BR68_BUILD_INPUT_WIRING_PASS=True
    P3E2SR4BR68_CURRENT_TEST_MANIFEST_PASS=True
    P3E2SR4BR68_LOCAL_CONTRACT_CHECK_PASS=True
    P3E2SR4BR68_FULL_REGRESSION_PASS=NOT_RUN
    P3E2SR4BR68_HOSTED_CI_PASS=NOT_RUN
    P3E2SR4BR67_OVERALL_PASS=True
    P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
    NOT_READY_FOR_PUBLIC_REGISTRATION=True

Stop after the single run/result record. Do not merge, deploy, publish images,
migrate production, run real Desktop OAuth/MCP or change existing internal
trial authorization.
