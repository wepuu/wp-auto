# WPAuto P3-E2S-R4B-R33 focused mapping validation

## Result

R33 passed the complete 83-check local helper suite and one isolated focused
validation. The strict focused typecheck, two-file lint and all 19 existing
AuthorizationCode mapping unit tests passed. There were no skipped, cancelled
or TODO tests. The R28 application source and assertions remained unchanged.

This establishes focused typing and synthetic transaction/adapter behavior.
It does not establish real PostgreSQL rejection handling through the Provider
HTTP endpoint, expired-session protocol acceptance, Desktop account-switch
recovery or release readiness. R30's broader database test-project typecheck
remains failed; R31 and R32 failures are retained.

## Minimal helper correction

The helper now checks `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` before generic
`killed` handling. For the previously failing synthetic input it produces
`CHILD_OUTPUT_LIMIT`, `outputLimit=true`, `timedOut=false` and `passed=false`.
The suite explicitly asserts these fields and preserves safe output filtering.

The only other edits were those assertions and R33 run/evidence labels in the
existing runner. No application, existing mapping test, tsconfig, dependency,
lockfile, SQL, OAuth contract or production configuration changed in R33.

The implementation was committed locally before container execution:

```text
e76cd4a38a7db007b23ff5aafa89036c2567b768
test: fix output-limit classification for R33 focused validation
```

Host Node v26.11.1 ran only the helper syntax and synthetic checks. The suite
completed once and emitted a successful aggregate with 83 checks. It covered
reporter URL/load handling, intentional loader failure, error classification,
timeout/output-limit handling, sensitive sentinel suppression, result counts,
strict configuration and stage aggregation. Synthetic failure cases are
intentional assertions, not extra application attempts.

## Single isolated execution

```text
run: r33-20261025070921979
UTC start: 2026-10-25T07:09:21.999Z
UTC finish: 2026-10-25T07:09:59.888Z
Asia/Shanghai: 2026-10-25 15:09:21 to 15:09:59
container attempts: 1
container: wepuu-r33-20261025070921979
```

The fixed test image was
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
revision `c404ed52228ce5492a85674547998d2f5d31772e`. The actual application-test
runtime was Node v24.22.1/Krypton, pnpm 11.19.0 and TypeScript 5.9.3.
There was no image pull, dependency installation or candidate image build.

Host/container input verification covered 101 files, 18 complete source/test
directory mounts and 10 projects, including the focused config added in R31.
The manifest remained unchanged before and after execution:

```text
823b47911c9bff241bce98582d04147c163b82c642131e86630623f4d5547233
```

The focused config selected exactly the mapping test as its root. The actual
transitive TypeScript program contained 305 files, including database source,
the persistent-readonly source, dependency/library declarations and workspace
declarations produced by the prerequisite build. Other database tests were
not selected. The private receipt retains the complete public path list.
Imports were not replaced by stubs to obtain a green typecheck.

Strict options, NodeNext resolution, `noEmit=true`, `skipLibCheck=false` and
the inherited ES2024 library remained unchanged. No DOM/React types, wildcard
module declaration or ignored diagnostic was added.

| Stage | Result | Evidence |
|---|---|---|
| Runtime/input/config gates | PASS | Fixed runtime, one root, strict options, complete manifest |
| Prerequisite `pnpm build --pretty false` | PASS | Exit 0, no TypeScript diagnostics |
| Focused typecheck | PASS | Exit 0, empty stdout/stderr, no diagnostics |
| Two-file lint | PASS | Exit 0, no errors/warnings/fatal errors, empty stderr |
| Mapping tests | PASS | 19 passed, 0 failed/cancelled/skipped/TODO, exit 0 |
| Input postcheck | PASS | Source/config/tool hashes and clean worktree unchanged |
| Container cleanup | PASS | Stopped exit 0, OOMKilled=false |

The prerequisite build produced 24 stderr bytes, one unparsed line, with no
TypeScript diagnostic. Its raw text was discarded, not independently classified
as harmless. The focused typecheck, lint and mapping tests had empty stderr.
No timeout, output cap or diagnostic truncation was recorded.

The focused commands were:

```text
pnpm exec tsc --project packages/database/test/tsconfig.consume-mapping.json --noEmit --pretty false
pnpm exec eslint packages/database/src/index.ts packages/database/test/authorization-consume-mapping.test.ts --format json --max-warnings 0
pnpm exec tsx --test --test-concurrency=1 --test-reporter=/harness/r31/reporter.mjs packages/database/test/authorization-consume-mapping.test.ts
```

The tests exercise the actual adapter and Database transaction code through a
synthetic PoolClient. They cover precise Code-only mapping, generic outward
error shape, rollback/release behavior, other SQLSTATE/errors, other artifact
models, earlier transaction errors, rollback failure, normal/missing consumption
and existing Refresh replay/rate-limit behavior. They do not execute real
database functions, HTTP token exchange or independent Tenant isolation.

## Safety and receipt

The container had no network, capabilities or production credentials; host
mounts were read-only, healthcheck/logging disabled, no Docker socket mounted,
and no-new-privileges enabled. UID0 and a writable disposable container layer
were used only for compilation/test outputs, not service-runtime acceptance.
The stopped container is retained; no image commit, prune or deletion occurred.

Free space was 5808771072 bytes both before and after, above the existing
5 GiB startup and 2 GiB final gates. The private directory and evidence files
passed the current-user/SYSTEM/administrator ACL checks.

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r33-focused-rXppDF\result.json
SHA-256: fe4031077063e3f0ecd9108657579ca712e89fb0c7e2fcb047d4d843cfeedb0c
```

R28 file hashes still match:

```text
packages/database/src/index.ts
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
packages/database/test/authorization-consume-mapping.test.ts
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

No production host, WordPress, account login, real authorization, MCP or content
was accessed. No service, database or migration was started. No push, merge or
deployment occurred. Existing full-project failures and historical phase results
are not overwritten by this focused acceptance.

## Status and stop

```text
P3E2SR4BR33_HELPER_SYNTHETIC_PASS=True
P3E2SR4BR33_FOCUSED_TYPECHECK_PASS=True
P3E2SR4BR33_TARGETED_LINT_PASS=True
P3E2SR4BR33_MAPPING_UNIT_TESTS_PASS=True
P3E2SR4BR33_INPUTS_UNCHANGED=True
P3E2SR4BR33_CLEANUP_PASS=True

P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after recording the result. The next separately authorized task is candidate
construction and a minimal isolated expired-session protocol regression: verify
the real database rejection becomes `400 invalid_grant`, without Token issuance
or Code consumption. Do not infer that outcome from the synthetic tests or
automatically start the integration run.
