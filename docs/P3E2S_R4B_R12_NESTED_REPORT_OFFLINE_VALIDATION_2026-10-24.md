# WPAuto P3-E2S-R4B-R12: nested reporter contract offline repair

## Scope and source

The approved R12 plan was implemented: characterize the report-shape conflict
before repair, make the smallest local caller change, then run one selected
synthetic validation gate. No complete unit, database, Console014, service/A/B,
production, WordPress, Desktop, OTP, OAuth or MCP execution occurred.

Baseline: `ea7850a` (R11 result), with launcher source at `fc0b154`.
Validated repair commit: `0920ab5facccee7a9bef1bae98b73895ec2a6451` on
`codex/p3e2sr4b-source-integration`.

Only test/tool files and the future unit manifest changed. Application source,
migrations, dependencies, lockfile, package-manager configuration, public APIs and
security contracts did not change. No image rebuild, download or install ran.

## Characterization before repair

One bounded execution of `scripts/persistent-r12-reproduce.mjs` used a temporary
synthetic test and the unchanged actual reporter/schema in the fixed image.
It required both a valid report and the expected assertion outcome, not merely
an arbitrary exit1:

| Context | Valid output | Old top-level assertion |
|---|---|---|
| No outer run ID | structured report, `passed=true` | passes |
| Valid inherited outer run ID | envelope with `report.passed=true` | throws `ERR_ASSERTION` |

Both cases suppressed the synthetic secret sentinel from captured output.
The characterization exited0 with `passed=true` and
`legacyAssertionRejected=true` in the inherited-ID case. The expected rejection
was not a failed validation gate and did not trigger an automatic retry.

This confirms the **current reproducible caller/reporter shape conflict**. It does
not recover an exact inner assertion stack from R11 or establish the historical
R10 first failure. Those original records remain unchanged.

## Minimal repair

The reporter transport test in `scripts/persistent-r10.test.mjs` now invokes
existing `runReportedProcess()` instead of parsing a nested reporter's stdout.
It passes only PATH and TMPDIR, uses a freshly owned private report directory,
and lets the existing helper allocate a distinct random run ID. The caller
requires category PASS, VALID report, `report.passed=true` and exit0.

The original positive completion, secret-output suppression and killed-child
rejection assertions remain. The killed-child assertion also uses the minimal
environment. Exact run-owned temporary files/directories are cleaned by the test.

No change was made to reporter/schema/helper acceptance rules, run-ID checking,
phase/file binding, verdict aggregation, output limits, timeout budgets or
offline skip policy. There is no dual-shape `.passed ?? .report.passed` fallback.
The historical optional pnpm probe was not run or modified.

`scripts/persistent-nested-report.test.mjs` adds five mandatory test cases. The
future complete unit manifest adds this file:55 ->56. The complete unit driver
was not invoked; the manifest expansion is not proof that all56 files pass.

## One selected offline validation gate

`scripts/persistent-r12-validate.mjs` ran only these files with frozen top-level
counts, using an outer dedicated reporter envelope:

| File | Expected and observed cases |
|---|---:|
| `scripts/fixed-node-test.test.mjs` | 5 |
| `scripts/persistent-nested-report.test.mjs` | 5 |
| `scripts/persistent-r10.test.mjs` | 8 |
| `scripts/persistent-report-channel.test.mjs` | 21 |
| `scripts/persistent-test-result.test.mjs` | 5 |
| Total | 44 |

```text
UTC start: 2026-10-24T10:34:29.809Z
UTC finish: 2026-10-24T10:34:38.129Z
category: PASS
reportStatus: VALID
process completed: true
process exitCode: 0
spawnFailed / timedOut / outputLimitExceeded: false / false / false
discarded child output bytes: 0
report total / fileCount: 44 / 5
skipCount / missing files / unmapped events: 0 / 0 / 0
topLevelCountsMatch: true
failures: []
```

Coverage includes standalone and inherited-context execution, an actual
outer->middle->leaf test chain with distinct report directories/run IDs,
assertion/module failures, wrong run/phase/file binding, malformed and missing
reports, secret sentinel filtering, actual timeout, fixed Node/tsx typed fixture
execution and existing report aggregation regressions. The passing-report
signal-precedence case uses a synthetic process state; actual process timeout,
nonzero-child and report-file transport cases are separately exercised by this
selected suite. No simulated state is claimed to be an actual signal trace.

The selected gate was executed once and passed. No complete unit or post-failure
repair/retry was performed.

## Runtime and containment evidence

```text
Test image: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
image revision: c404ed52228ce5492a85674547998d2f5d31772e
Node: v24.22.1 / Krypton / UID1000
tsx: 4.23.13
loader: /workspace/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs
loader SHA-256: 7e3dba3b9b862a5fa1c741d54fc921ee8b17fc7a4d0087fa64e42a32142cf03d
```

Both containers used network none, user1000:1000, read-only root, no healthcheck,
capabilities dropped, no-new-privileges, log driver none and a64MiB temporary
tmpfs. All host file mounts were individually allowlisted and read-only. There
were no host credentials/config, SSH/Docker socket, ports or production variables.
Node26 on Windows performed syntax checks only, not application/test execution.

| Container | Bind files | Final state | OOMKilled |
|---|---:|---|---|
| `wepuu-r12-characterization-20261024a` | 5 | stopped, exit0 | false |
| `wepuu-r12-validation-20261024a` | 18 | stopped, exit0 | false |

The containers remain stopped; no other Docker objects were cleaned. These are
reviewed diagnostic overlays on the retained image, not baked-image acceptance.
The immutable image ID/revision and runtime/loader were checked this round; the
compiled application fingerprint recorded in R11 was not remeasured in R12.

D: free bytes were6315892736 before execution and6315880448 at postcheck, above
the existing initial5GiB and subsequent2GiB thresholds. No resource protection
was lowered. `git diff --check` and syntax checks passed.

## Frozen hashes and postchecks

The following hashes were identical before and after the selected validation:

```text
scripts/persistent-r10.test.mjs
654d528e1eb1f1c11f3eebbee7b73d6d7dd2fac216cfe177086d4d1eed2ecc11
scripts/persistent-nested-report.test.mjs
9fb419c3f598301b94254c835107dcfe367f7616be471ac4a97d7d0547538f4e
scripts/persistent-r12-reproduce.mjs
ae0c227212c3ae327282745dd38e430e1e901245264b4690a6017e21d1bc49e4
scripts/persistent-r12-validate.mjs
c710aedbfb86b81778efa8bee8a0f284e68fe954d9a649970c5989295cc69b78
test/persistent-authorization/r10/unit-manifest.json
50132d7047b6a90986b48a7a0a5d4681423af11ba015f78ca88da2d94692e827
test/persistent-authorization/r10/reporter.mjs
63d9ce88223fa41365116e7ffdc692a20b2b8e49e1eb8293f7179c5de81223cc
test/persistent-authorization/r10/report-schema.mjs
414e7b3fc37a995809e9b92a6d65799bf8065f38eef395aa0da6162227e772ca
test/persistent-authorization/r10/reported-process.mjs
e9958598b30c06df3ca68c1b264b23a3b3e1805a1fa71df106716b5a69053824
```

Only fixed projected results are recorded here. No raw child logs, assertion
values, secrets or exception stacks were retained in the delivery. No Hosted CI,
push, PR, merge or deployment occurred.

## State and required next decision

```text
P3E2SR4BR12_NESTED_CONTRACT_REPRODUCED=True
P3E2SR4BR12_OFFLINE_REPORT_FIX_PASS=True
P3E2SR4BR12_FULL_UNIT_EXECUTED=False
P3E2SR4BR12_DATABASE_EXECUTED=False
P3E2SR4BR12_AB_EXECUTED=False
P3E2SR4BR11_SINGLE_UNIT_GATE_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These are candidate gates, not a revocation or new validation of the historical
bounded internal trial. No historical failure was rewritten as a pass.

R12 stops here. A separate approved scope is needed for one fresh complete unit
gate. Before that run, freeze the56-file manifest and update the **new run's**
exact readonly overlay inventory to include the repaired R10 test and new nested
test. Do not invoke the historical R11 coordinator unchanged: it does not mount
these two changed/new files. Preserve its previous run evidence, make any new
launcher adaptation explicit, and keep database/Console/A/B independently gated.
