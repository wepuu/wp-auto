# P3-E2S-R4B-R79: fixed-environment single-helper candidate acceptance pass

## Outcome and scope

The authorized R79 used the retained R74 container exactly once and accepted
the hash-pinned R78 candidate for `reconsent-native-fixture.mjs` within the
single-helper scope. Executable AST, typed-rule controls, implementation and
declaration lint, real scoped checkJs, consumer public-contract tests and
172 Node 24 synthetic behavior comparisons all passed. Original inputs were
then restored and the exact container stopped. R79 overall is True.

This is not formal-source materialization, all-helper acceptance, full
application type checking/regression, hosted CI or production deployment.
R75/R77 failures and R78's synthetic evidence remain unchanged. No commit,
push, PR update, merge or deployment occurred.

HEAD remains `1db6d3429876862025eab24ad2466c5f90aa030c` on
`codex/p3e2sr4b-r68-ci-20261027`. The pre-existing tracked ESLint draft and
all historical untracked work were preserved. No public API, declaration,
database schema, OAuth/Refresh contract or production configuration changed.

## Independent wiring and preparation

R79 adds `assets.mjs`, `orchestrate.mjs`, `run-once.mjs`,
`validate-offline.mjs` and `diagnostics.mjs` under
`test/persistent-authorization/r79/`. The first four retain the R77 structure
with the new run namespace, candidate, evidence/gate references and reviewed
diagnostic changes. R75-R78 files were not rewritten.

The generated worker requires the exact existing R75 worker/helper hashes,
the fixed R78 candidate, unchanged AST and known original input hashes. Its
scoped type phase now records separate environment/options/global,
implementation and consumer groups. It still uses the real project options,
real Codec types and unchanged public declaration; no synthetic replacement
is used in that actual phase.

R78's diagnostic function accepts only one synthetic file. R79 adapts that
whitelist pattern in a separate module, not by changing the historical tool:

- Allowlisted real helper/current contract-probe paths map to safe relative
  labels; no-file option/global diagnostics retain null position fields.
- Output fields are only code/category/file/line/column.
- Unknown paths are never printed; they are counted and marked
  NOT_ALLOWLISTED, making acceptance impossible.
- Invalid/missing positions are null, not invented source locations.
- Projection is capped at 100 entries, retaining total/truncation; any
  diagnostics, truncation or unknown files prevent the relevant pass.
- No message text, source fragments, raw exception or stack is retained.

Fresh R78 full preparation passed all 17 checks, including 172 host
comparisons. Receipt `.tmp/r78-offline-lNINfn/result.json`, SHA-256
`f2721d0fc22ecaeac1b9b4d097ddf4ace9d914fbdeacbae11066fb99075f91f7`.

R79 offline preparation passed 27 checks: the reused gate/asset/syntax,
identity/network, exclusive claim, mock sequence/budget, timeout/malformed
JSON, first-failure and exact-restore/drift tests, plus eight new projection
and generated-worker tests. Those cover two real-file roles and global
diagnostics, empty diagnostics, unknown files without path disclosure,
missing/invalid positions, truncation, sensitive message suppression,
unsafe labels/invalid codes and all three strict type-result groups.
Mocks do not invoke Docker.

Offline receipt `.tmp/r79-offline-jWV1l5/result.json`, SHA-256
`9ce39f384b9a7b86c3c52407cdd7d99057c4d5aa24ba5d8084bb129463a9d573`.
The real entry checked current tool hashes, the protected manifest, exact
candidate and AST before claiming its new one-use execution marker.

## Actual retained environment and baseline

Run `r79-3a155db5-877e-4e7a-a40f-fbc410bdd33a`.

| Item | Verified value |
| --- | --- |
| Container | `0a7c8a932bf20190355f8db3c337d65e91e2850b7e0fa25b98282e3ce572858c` |
| Retained owner | `wepuu-r74-6b6f5139-7e49-4c27-ba30-f86244385d0c` |
| Image | `sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c` |
| Runtime | Node v24.22.1; pnpm 11.19.0 |
| Compiler/linter | TypeScript 5.9.3; typescript-eslint 8.70.0; ESLint/@eslint/js 9.39.5 |

Initial container was stopped, had no mounts or bound/published ports, was
not privileged and had no OOM flag. Its network attachment map was empty
before and after the one normal start. Passive observation confirmed only
loopback addresses and no non-loopback routes. No network edits or external
connectivity probes occurred.

Dependency provenance, exact Node/Bun/React type versions and existing
Better Auth/Bun patch hashes passed. The baseline parser Program had no
option diagnostics and included all three type sources. There was no
package install, build/pull, new container, dependency substitution or switch
to host types.

Fresh baseline lint, one invocation:

| File | Fatal | Errors | Warnings |
| --- | ---: | ---: | ---: |
| reconsent-native-fixture.mjs | 0 | 34 | 0 |
| reconsent-native-fixture.d.mts | 0 | 0 | 0 |

The baseline rule counts were unsafe-argument 4, unsafe-assignment 9,
unsafe-call 2, unsafe-member-access 18 and no-undef 1. The only no-undef token
was Buffer. These are actual R79 observations, not a copied historical count.

## Candidate application and acceptance

Exact accepted trial candidate:
`test/persistent-authorization/r78/candidate.mjs`, SHA-256
`2e1bedc491e07ee733d2e9d409b46f5cc3987ccbb27e06d91cc51d237e22897f`.

Original/candidate AST normalized hashes both equaled
`569890f5ef9a0a755a1899204956e834b0d1a62c7e2659af750389dbaf0c8e19`.
The comparator was not relaxed. R78's change from R76 remains only the
internal explicit optional/unknown input annotation; executable validation
and public types were not weakened.

The worker temporarily overlaid only the pilot. Because the baseline
confirmed Buffer, it also applied only the existing pilot-file Buffer
readonly block. Candidate config SHA-256:
`48f441f06813133caf39e6440333ce005e3e5b2cf865c870e3ab15b737734ee0`.
Pilot rules/parser and the other four helpers' effective configurations
remained equal to baseline. No rule exception or broad Node globals added.

| Acceptance | Actual result |
| --- | --- |
| Positive typed-rule probe | Zero errors/warnings |
| Await negative | Exactly one await-thenable error; no parser failure |
| Floating negative | Exactly one no-floating-promises error; no parser failure |
| Candidate implementation lint | Zero fatal/errors/warnings |
| Declaration lint | Zero fatal/errors/warnings |
| Real implementation syntactic/semantic diagnostics | Zero |
| Consumer contract syntactic/semantic diagnostics | Zero |
| Program option/global diagnostics | Zero |
| Existing Node 24 synthetic behavior/outcome/call-trace comparisons | 172 passed |
| Final applied-input manifest verification | Passed with only known pilot/config overlays |

The real scoped check used inherited strict settings, including
noPropertyAccessFromIndexSignature, noUncheckedIndexedAccess,
exactOptionalPropertyTypes and skipLibCheck=false. It retained actual
node/bun/react types, with noEmit/allowJs/checkJs for the scoped roots.
R78's synthetic-only library/ambient-type isolation was NOT used here.

The consumer resolves to the original `.d.mts`, whose hash was unchanged.
Positive literal types held. All five existing negative contract cases
remained invalid: missing binding fields, unsupported model, non-string
raw ID, malformed Codec result and mutation of readonly output. The
existing negative-test @ts-expect-error directives were consumed (no
unused-directive diagnostics); no suppression was added to the candidate.

No real type diagnostics were generated, so the safe real-file position
projection had no actual error positions to display in this successful run.
Its nonempty/multifile/truncation/error-path coverage is the offline evidence,
not invented production or container error output.

This proves the stated single-helper scope only, not every dependency's
semantic diagnostics or a full project build. The 172 comparisons cover the
existing corpus, not all possible JavaScript inputs or OAuth protocol flows.

## Recovery, protection and timing

Independent restoration reported:

```text
pilotRestore=RESTORED
configRestore=RESTORED
probeCleanup=[REMOVED, REMOVED, REMOVED, REMOVED]
originalInputsRestored=true
cleanupFailures=[]
containerStopped=true
hostInputsUnchanged=true
```

All 117 original manifest inputs were verified after restoration. All tested
host tool hashes matched after the run. The existing container and its
dependencies/history were retained; no image, volume, cache or historical
asset was deleted. No formal helper/configuration bytes were materialized
on the host. The original tracked diff remains the prior ESLint draft,
13 insertions and 2 deletions. `git diff --check` passed.

UTC window `2026-10-27T11:18:09.432Z`–`2026-10-27T11:18:40.692Z`
(19:18:09.432–19:18:40.692 Asia/Shanghai).
Monotonic execution 29,183 ms, independent cleanup 2,077 ms, total 31,260 ms.
Baseline/candidate/restore workers and host launcher all exited 0. Exactly
one start occurred; no timeout, output truncation or retry occurred.

## Evidence and tested identities

Actual receipt `.tmp/r79-pilot-Hto49X/result.json`, SHA-256
`0447ab9ab4f1b0cc812bfef598a022565c67192582a5160276c5e35e5f0dd878`.
It contains safe stage/result metadata, grouped diagnostic projections and
the tested tool/asset hashes, not raw exceptions, credentials or complete
synthetic outcomes.

| R79 asset | SHA-256 |
| --- | --- |
| assets.mjs | `2bb8f20c10106fb6f6f744219e4719d6e4b27cf5ee364585e25672c3a4181d1d` |
| orchestrate.mjs | `80d31f8505a6523f8187615abc7bb755140a653d3bbe7e015121a04115deb999` |
| run-once.mjs | `28f797cb717132a240d927e24896e4e6377212997868fbd75ebac0d9a28c60ea` |
| validate-offline.mjs | `fa216d3bffa3fbd2f600bb0fc694b60998968d099b2acfb75851502f0d68168c` |
| diagnostics.mjs | `ffce3e53558a009d6a7eec78b134b19aca06c35f5120d3690b442495f9d345a4` |
| Generated worker.mjs | `e299bdacacc53a5f7e7a5abd2f6ff307614f9bd3f95f345c63a1365f3825e965` |

Trial assets and separate state remain under the unique run namespace in
`/r72/test/persistent-authorization/` and `/r72/.r79-.../`. Historical labels,
claims, evidence and failures were not reset or reclassified as passes.

No production, WordPress, real OAuth/Refresh/MCP/OTP, credential store,
signing/Proof rule, migration, `design/` or unrelated user file operation
occurred. The client-to-WordPress data-plane boundary and existing limited
internal trial authority are unchanged.

## Final state and stop

```text
R79_OFFLINE_PRESTART_GATE_PASS=True
R79_ENVIRONMENT_REUSE_PASS=True
R79_EXECUTABLE_AST_PASS=True
R79_RULE_CONTROLS_PASS=True
R79_PILOT_TYPED_LINT_PASS=True
R79_IMPLEMENTATION_TYPECHECK_PASS=True
R79_PUBLIC_CONTRACT_PASS=True
R79_NODE24_BEHAVIOR_PASS=True
R79_ORIGINAL_INPUTS_RESTORED=True
R79_CONTAINER_STOPPED=True
R79_OVERALL_PASS=True

R79_FORMAL_SOURCE_MATERIALIZED=False
R79_FULL_HELPER_LINT_PASS=NOT_RUN
R79_HOSTED_CI_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. This candidate now has fixed-environment evidence supporting a
later formal pilot landing, including its narrowly scoped Buffer setting.
That landing and the remaining helpers are subsequent scoped work, not
automatic follow-up changes in R79. No full acceptance/readiness promotion.
