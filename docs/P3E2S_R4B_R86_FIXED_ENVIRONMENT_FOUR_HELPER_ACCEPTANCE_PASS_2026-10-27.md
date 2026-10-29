# P3-E2S-R4B-R86: fixed-environment four-helper acceptance pass

## Outcome and boundary

R86 passed one real trial of the four frozen R85 annotation candidates in
the retained, network-isolated R74 container. Full configured lint for five
implementations and five declarations was clean. Scoped implementation
checkJs and public-contract consumers passed with the complete installed
Node/Bun/React environment. All 187 Node 24 behavior comparisons and four
Linux private-write/read comparisons passed.

All original 117 container inputs were restored, four owned probes removed,
and the container stopped. Independent host verification confirmed the R80
baseline and all 79 tracked historical/current tool and frozen-artifact
identities unchanged. No formal source landing occurred.

No dependency installation, image build/pull, new container, network change,
production access, database connection, migration execution, OAuth/MCP/OTP,
full workspace regression, Hosted CI, commit, push, PR change, merge or
deployment occurred. The four accepted trial candidates remain independent
artifacts. Historical R81/R83 failure and R85 preparation failure remain
unchanged. Candidate-level and public-registration readiness are not raised.

## Fixed preparation evidence

Original R85 pass receipt `.tmp/r85-offline-wTTZ0b/result.json`, SHA-256:
`85a1c2bbca86cd9a8c3f0b289f7547fed99d8bbda65cb5f72ea04cc926ad6e93`.

Before the real trial, R85's complete 12-check offline entry was run again.
It passed, including its 187 host behavior comparisons. New preparation
receipt `.tmp/r85-offline-5fQWR4/result.json`, SHA-256:
`6de345d1a14251346d2280120c4c4ff265c48997aa0426c0ca9d64273a0f00b4`.
This host evidence is separate from the later real Node 24 result.

R86 offline gate passed all 24 checks:

- Receipt `.tmp/r86-offline-JxsQSk/result.json`.
- SHA-256 `0757326ba37a551ebcbb048dbdcf203add37d9467b5e748d59a6a26620841b28`.
- Verified the existing complete R82 replay receipt and classifier hashes;
  the R82 replay itself was not rerun during R86.
- Verified fresh R85 preparation, frozen candidates and all four ASTs.
- Syntax-checked generated runtime assets and new entry modules.
- Checked narrow per-file readonly globals, unchanged rule/parser settings,
  retained independent zero-error gate and new run namespace.
- Tested valid/failed gates, source/candidate drift and duplicate claims.
- Tested successful phase sequence, type failure, timeout, malformed JSON,
  owner/network denial, partial application and concurrent recovery drift.
- Tested ordinary lint failure collecting types once but never behavior;
  lint first-cause preservation when types also fail; fatal/truncated lint
  refusing type collection; and original contract-prefix preservation.
- Verified all protected host inputs and historical tools before/after.

Only the new R86 exclusive claim was consumed. No prior claim or historical
output was reset, deleted or reused for real execution.

## Frozen candidates and minimal wiring

Candidate bytes are from `.tmp/r85-offline-wTTZ0b/candidates/`:

| Candidate | SHA-256 |
| --- | --- |
| otp-migration-evidence.mjs | `34806061a680d5427fd4b16f0909a04c096454144422cb39e0ca4510485e4880` |
| r17-migration-evidence.mjs | `03d44172d2aa07129abc59d8901a91dd70bd37f7c82c810fec10f075a9ff5f48` |
| r19-target-ledger.mjs | `8ce96cfa2e2753c3332a4e7e297ef4687218795ce4fb980357bf51af77b6d471` |
| reconsent-diagnostic.mjs | `2b0cff4b488d066d50a46a869a368e0bd386cc5120b090a5f0600ddb5d89c0a0` |

R86 reuses the R83/R82 worker and restore framework. The generated worker
has only exact inverse-checked namespace changes and a safe eligibility
flag for collecting type diagnostics after ordinary lint findings. R82's
baseline classifier, candidate classifier and original zero-error assertions
are retained. Candidate bytes were not edited during this trial.

The parent collects lint and type results separately. An ordinary, complete,
nonfatal lint-result failure may permit one diagnostic type phase; it still
sets the first failure, blocks behavior and prevents overall acceptance.
Malformed/truncated/parser/environment/timeout failures stop immediately.
This was tested offline; the real run did not need the ordinary-failure
branch because both diagnostic phases passed on their first execution.

The original R81 contract fixture is retained as an exact prefix. Five new
expected-error cases and a native QueryClient-to-query-view assignment are
appended, using the exact internal type extracted from the frozen candidate.
The negatives cover a synchronous return, missing rows, numeric query input,
unknown row-to-string flow and unknown JSON-to-string flow. The original
negative public-contract cases remain present. No public declaration or
global pg/JSON type augmentation is substituted.

| R86 asset | SHA-256 |
| --- | --- |
| model.mjs | `aa7748b69c30c14a5bbc288ca759886f717d5f4734e3e2f7f2076f043c7bc3f9` |
| orchestrate.mjs | `3235e3f4b0b810baed9e8532202286eadc68ea67184f33914423b1fb69daf664` |
| run-once.mjs | `c6bf961a674f0b1e14956c3a51530194fee5084ac1817d4413c47384d4488f2a` |
| validate-offline.mjs | `182ffd397e85d853130290aeac23a85a113225659b09af2634e9fa6b7dc6617c` |
| Actual generated worker | `3b9710e2ed5e59f2ebae472ebae003504824be601da6d3c061276d0b13f887cd` |
| Actual contract probe | `3f37830f6ecd27514435a855606caa4b802c95a883c570d12fab4ae19474045e` |

## One actual fixed-container execution

Receipt `.tmp/r86-batch-LYC9hz/result.json`, SHA-256:
`53e1ec467dab02cb0cd9c8f7c63cd88fce055fa680ebd1ba391a7410aaea3c48`.

Run `r86-e8b0f455-0812-457b-bf47-901c93c0ec83`; starts = 1.
UTC `2026-10-27T14:06:33.994Z` to `14:07:52.412Z`
(22:06:33 to 22:07:52 Asia/Shanghai). Monotonic total 78,418 ms,
independent cleanup 2,184 ms. All command records passed; no timeout or
truncated command output occurred. First failure is absent; cleanup failures
are empty.

Container:
`0a7c8a932bf20190355f8db3c337d65e91e2850b7e0fa25b98282e3ce572858c`.
Image:
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`.
Owner, image, initially-stopped state, zero mounts/ports, nonprivileged state,
empty network attachments and passive loopback-only route checks passed.

Actual versions were Node v24.22.1, pnpm 11.19.0, TypeScript 5.9.3,
typescript-eslint 8.70.0 and ESLint/@eslint/js 9.39.5. Dependency provenance,
type versions and reviewed patch identities passed. Explicit baseline
Program checks confirmed original options and Node/Bun/React type sources.

### Baseline, AST and rules

Fresh baseline: 385 errors, zero warnings/fatal findings across the ten
files. Errors remain confined to original OTP/R17/R19/Diagnostic bodies:
77/66/86/156 respectively. The native helper and all declarations were clean.
The R82 classifier accepted this as classified baseline findings with
lintPass=false, not as clean lint.

All four executable AST comparisons passed before application. Only the
baseline-justified exact-file readonly globals were added in the container:
process for OTP/R17; process and Buffer for R19; process, Buffer and
structuredClone for Diagnostic. Native configuration, rules, parser settings,
SQL timeouts, public declarations and runtime validation were unchanged.

Positive rule control was clean. Negative controls each reported their
intended await-thenable or no-floating-promises violation without a parser
failure. Candidate lint used the full existing configured rules, not the
five-rule host subset from R85.

### Complete bounded acceptance results

| Check | Actual result |
| --- | --- |
| OTP implementation and declaration lint | 0 errors, 0 warnings, 0 fatal |
| R17 implementation and declaration lint | 0 errors, 0 warnings, 0 fatal |
| R19 implementation and declaration lint | 0 errors, 0 warnings, 0 fatal |
| Diagnostic implementation and declaration lint | 0 errors, 0 warnings, 0 fatal |
| R80 native implementation and declaration lint | 0 errors, 0 warnings, 0 fatal |
| Scoped checkJs, five implementations | Zero projected diagnostics |
| Five original declarations | Zero projected diagnostics |
| Original/additional contract consumers and r43-helper-types.ts | Zero diagnostics, expected-error cases consumed |
| Options/global diagnostics | Zero; no truncation or unknown diagnostic files |
| Declaration module resolution | All five resolve to original .d.mts |
| Node 24 behavior comparison | 187 passed, including 14 independent golden assertions |
| Linux private-write/read comparison | 4 passed |

Unlike R85's host projection, the actual type phase uses the existing
database test compiler configuration with Node/Bun/React types intact,
allowJs/checkJs enabled, all strict options and skipLibCheck=false.
It checks the five helpers, five declarations and the two scoped consumers;
this remains a bounded helper contract check, not workspace-wide typechecking.

Behavior compares saved original and frozen candidate graphs, including
R19's real module link to R17. The four Linux comparisons cover paired
record/read operations, file modes/ownership and owned cleanup. Query
clients are synthetic and no database is connected. SQL files are copied
as fixed data only. Raw outcomes, error text and stack traces are not saved.

## Restore and independent final verification

The worker restored all six owned files (four helpers, native helper and
ESLint configuration) to original container A state, removed four owned
probes, verified all 117 original inputs, and confirmed private evidence
cleanup. The retained container was normally stopped by the single entry.

Independent post-run Docker inspect confirmed the same image with
State.Status=exited and State.Running=false. No second start occurred.
Independent pure-file verification confirmed all 117 host R80 inputs and
all 79 identities recorded by the gate, with zero drift.

Host R80 native/config hashes remain
`2e1bedc491e07ee733d2e9d409b46f5cc3987ccbb27e06d91cc51d237e22897f`
and `48f441f06813133caf39e6440333ce005e3e5b2cf865c870e3ab15b737734ee0`.
Tracked diff remains two files, 35 insertions and 7 deletions, including the
earlier ESLint draft. New R86 tooling/evidence and this record are local and
uncommitted. No unrelated user file or design/ file was changed.

## State and mandatory stop

```text
R86_OFFLINE_PRESTART_GATE_PASS=True
R86_ENVIRONMENT_REUSE_PASS=True
R86_BASELINE_CAPTURED=True
R86_EXECUTABLE_AST_PASS=True
R86_RULE_CONTROLS_PASS=True
R86_FULL_HELPER_LINT_PASS=True
R86_SCOPED_CHECKJS_PASS=True
R86_PUBLIC_CONTRACT_PASS=True
R86_NODE24_BEHAVIOR_PASS=True
R86_CONTAINER_PRIVATE_WRITE_PASS=True
R86_ORIGINAL_INPUTS_RESTORED=True
R86_HOST_R80_INPUTS_UNCHANGED=True
R86_CONTAINER_STOPPED=True
R86_OVERALL_PASS=True

R86_FORMAL_SOURCE_MATERIALIZED=False
R86_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop. The four exact candidates now have fixed-environment landing evidence.
Formal source/config landing, full application regression, Hosted CI and
production OAuth/account-switch validation are not performed or implicitly
authorized by this helper trial.
