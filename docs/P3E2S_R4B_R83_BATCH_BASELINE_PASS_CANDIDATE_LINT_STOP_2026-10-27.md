# P3-E2S-R4B-R83: fixed-environment batch baseline pass, candidate lint stop

## Outcome and scope

R83 performed exactly one start of the retained R74 container. The repaired
R82 classifier accepted the fresh baseline as classified findings, without
claiming a baseline lint pass. Environment, explicit Program/type-source
checks, four executable-AST comparisons, candidate application and rule
controls passed. Candidate lint then reported 16 errors across the four
frozen R81 candidates. The zero-error gate rejected them and execution
stopped before type-contract and Node 24 behavior acceptance.

The container's original 117-input state was restored, all four owned
probes were removed, and the container stopped normally. Host R80 state
remains unchanged. No candidate or formal source was repaired after this
failure, and no second trial occurred.

No dependency install, image build/pull, network adjustment, production
access, database connection, migration execution, OAuth/MCP/OTP, full CI,
commit, push, PR change, merge or deployment occurred. SQL files were only
retained test inputs; no SQL was executed. No public declaration, protocol,
runtime validation or security rule was changed.

## Offline preparation and execution identities

Fresh R82 replay passed all 34 checks:

- Receipt: `.tmp/r82-offline-UFO6sN/result.json`
- SHA-256: `31d84d4095685d4c4e24f3b94a7f4c238a07506d3786405c9a0d9b1693ddff6e`

R83 preparation passed all 19 checks:

- Receipt: `.tmp/r83-offline-vg7bXU/result.json`
- SHA-256: `f128c924f8280cbe8ddb4113bce42fe0af11545b4961dec9af7de9289b893e68`

These covered fixed candidate identities and AST, the actual worker's R82
gate wiring and retained zero-error assertions, scoped readonly globals,
exclusive one-use claim, candidate/tool drift denial, missing gate denial,
phase budgets, malformed results/redaction, partial application, protected
recovery, and first-failure preservation. Mock execution is not represented
as a second real container trial. No fresh host behavior comparison was
performed; R81's historical 187-case result is not new Node 24 evidence.

The new entry reuses the R81 execution/state/cleanup structure and R82
tested classifier. The generated R82 template receives only three exact,
inverse-checked namespace changes for R83. Candidate bytes are not generated
or changed by this entry.

| Execution asset | SHA-256 |
| --- | --- |
| R83 model.mjs | `931cbe6fc772ad9613c7e18623d376f1aaf14a82552e72de300c337712b7ec6d` |
| R83 orchestrate.mjs | `6d1e547f2015a9efb1cac14a61ec52e7e3e4b9fb7314db090577f3fef1f5aa60` |
| R83 run-once.mjs | `d77dba13a393c818edf9f7983097468c2f743aeb950662901754a19ca9a40c27` |
| R83 validate-offline.mjs | `d29a35dd5fc3e1706917a01a1c697d42a77be52d1525ba5c66cace5e9aba3da5` |
| Actual generated worker.mjs | `64262d82bba063497ac921bbc07349bfa8aaf375e5fa2246af176379f1753fd2` |
| R82 classifier.mjs | `e694eae2af1a888319c929a1a6057bdcfdc466f4dc7ab4c2a3ea2c0da4379c27` |

Frozen candidate identities:

| Candidate | SHA-256 |
| --- | --- |
| otp-migration-evidence.mjs | `98073ce10ad675ad0b70c408337ece70ab7fe68482fca8dd2855577625b34c29` |
| r17-migration-evidence.mjs | `e374d7dd77e62722ccd0b183ccdbc013e954649cd473ea8a3eb5c237d0704223` |
| r19-target-ledger.mjs | `22731ad98981b81e8297036ce64252d0b22b2e4be8006e51424059170ac267de` |
| reconsent-diagnostic.mjs | `3ceb21513a173bf22b8b19797e01d2a920f3e41de65424c16023d2388ac7367f` |

## Single real trial

Receipt: `.tmp/r83-batch-HlVXOa/result.json`

SHA-256: `00ab3e8c72d9d7155b96983369560a6ebb308eda9656dc0f29c38a13ff7c43eb`

Run: `r83-a2a15f3f-b018-4faf-9543-90a8acc7b01e`.
UTC window: `2026-10-27T13:21:55.064Z` through `13:23:16.755Z`
(21:21:55 through 21:23:16 Asia/Shanghai). Monotonic execution 78,751 ms,
independent cleanup 2,939 ms, total 81,691 ms. No stage timed out.

Fixed container:
`0a7c8a932bf20190355f8db3c337d65e91e2850b7e0fa25b98282e3ce572858c`.
Image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`.
Identity and passive network-isolation gates passed. No mounts, exposed
ports or external network attachment were added.

Actual versions: Node v24.22.1, pnpm 11.19.0, TypeScript 5.9.3,
typescript-eslint 8.70.0, ESLint/@eslint/js 9.39.5. Dependency provenance,
type package versions, reviewed patches and explicit Program checks passed.
This does not substitute for the later, unexecuted candidate type check.

### Fresh baseline and candidate application

| File group | Baseline errors | Candidate errors |
| --- | ---: | ---: |
| OTP implementation | 77 | 1 |
| R17 implementation | 66 | 5 |
| R19 implementation | 86 | 7 |
| Diagnostic implementation | 156 | 3 |
| R80 native implementation | 0 | 0 |
| All five original declarations | 0 | 0 |
| Total | 385 | 16 |

Every file had zero fatal errors and zero warnings; all ten result records
were retained without truncation. The baseline result is
`BASELINE_CLASSIFIED_WITH_FINDINGS`, `passed=true`, `lintPass=false`.
The classifier defect from R81 no longer blocks this captured baseline.

The actual baseline justified only the existing closed per-file readonly
global policy: process for OTP/R17; process and Buffer for R19; process,
Buffer and structuredClone for Diagnostic. Native R80 configuration and
all rule/parser settings remained protected. Candidate configuration hash:
`d378e2be5000a5aeff59eee695014d6d849cdf662e25ea9217efb7a8f9d04dc3`.

All four AST comparisons passed before candidate application. The positive
rule probe had zero errors; each negative probe hit its intended rule:
await-thenable and no-floating-promises. Rules were not suppressed to obtain
the remaining candidate results.

### First failed phase: candidate lint

The parent first failure is `lint / R83_GATE_NOT_CONFIRMED`. The worker
records `helper_lint / R83_BATCH_NOT_CONFIRMED`; the independent candidate
classifier returns `CANDIDATE_LINT_NOT_CLEAN`. These are layers of the same
observed lint failure, not a timeout or cleanup failure.

Coordinates below refer to the frozen annotated candidate files, not the
restored formal sources. Rule names omit only the `@typescript-eslint/`
prefix for readability.

| Candidate | Line:column | Rule |
| --- | --- | --- |
| OTP | 76:9 | no-unsafe-assignment |
| R17 | 48:7 | no-unnecessary-condition |
| R17 | 110:9 | no-unsafe-assignment |
| R17 | 110:89 | await-thenable |
| R17 | 110:320 | no-unsafe-member-access |
| R17 | 112:47 | await-thenable |
| R19 | 28:162 | no-unnecessary-condition |
| R19 | 30:90 | no-unnecessary-condition |
| R19 | 57:9 | no-unsafe-assignment |
| R19 | 57:89 | await-thenable |
| R19 | 57:320 | no-unsafe-member-access |
| R19 | 59:47 | await-thenable |
| R19 | 91:67 | no-unsafe-argument |
| Diagnostic | 125:92 | no-unnecessary-condition |
| Diagnostic | 160:66 | no-unsafe-argument |
| Diagnostic | 174:92 | no-unnecessary-condition |

Totals: unsafe-assignment 3, unnecessary-condition 5, await-thenable 4,
unsafe-member-access 2, unsafe-argument 2. The observation proves these
specific candidates do not meet the unchanged lint gate. It does not yet
establish the exact annotation/type-resolution cause of every finding.
No source repair or offline reproduction of those findings was attempted
after this stop.

Candidate scoped checkJs/public-contract checks, negative consumer cases,
187 Node 24 behavior comparisons and container private-write comparisons
were all NOT_RUN. No matching-failure comparison is represented as success.

## Restoration and independent final verification

Independent cleanup restored all six owned files (four helpers, native
helper and ESLint configuration) to the original container A snapshot.
Four owned probes were removed and all 117 original inputs matched.
Cleanup failures are empty, and normal stop completed.

After reading the receipt, a separate read-only Docker inspect confirmed
the same image and `State.Status=exited`, `State.Running=false`. No second
start or execution entry was invoked. Pure-file verification independently
confirmed all 117 host R80 inputs and all 66 recorded historical/current
tool identities, with zero drift.

Host R80 hashes remain:

- Native implementation:
  `2e1bedc491e07ee733d2e9d409b46f5cc3987ccbb27e06d91cc51d237e22897f`.
- ESLint configuration:
  `48f441f06813133caf39e6440333ce005e3e5b2cf865c870e3ab15b737734ee0`.

The tracked diff remains exactly two files, 35 insertions and 7 deletions,
including the earlier ESLint draft. Historical R75-R82 records and candidates
are preserved. Only R83 local tooling/evidence and this record were added.
HEAD stays `1db6d3429876862025eab24ad2466c5f90aa030c` on
`codex/p3e2sr4b-r68-ci-20261027`. No public-readiness status is raised.

## State and stop

```text
R83_OFFLINE_PRESTART_GATE_PASS=True
R83_ENVIRONMENT_REUSE_PASS=True
R83_BASELINE_CAPTURED=True
R83_BASELINE_CLASSIFICATION_PASS=True
R83_BASELINE_LINT_PASS=False
R83_EXECUTABLE_AST_PASS=True
R83_RULE_CONTROLS_PASS=True
R83_BATCH_TYPED_LINT_PASS=False
R83_PUBLIC_CONTRACT_PASS=NOT_RUN
R83_NODE24_BEHAVIOR_PASS=NOT_RUN
R83_CONTAINER_PRIVATE_WRITE_PASS=NOT_RUN
R83_ORIGINAL_INPUTS_RESTORED=True
R83_HOST_R80_INPUTS_UNCHANGED=True
R83_CONTAINER_STOPPED=True
R83_OVERALL_PASS=False

R83_FOUR_HELPER_FORMAL_SOURCE_MATERIALIZED=False
R83_FULL_HELPER_CI_PASS=NOT_RUN
R83_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. A later task should first reproduce and explain these 16 typed
lint findings offline against the fixed candidates and reviewed declaration
contracts. Any new annotation candidate must preserve executable AST and
strict gates; it needs separate authorization and a new one-use trial rather
than reusing this consumed R83 claim. No automatic repair or retry follows.
