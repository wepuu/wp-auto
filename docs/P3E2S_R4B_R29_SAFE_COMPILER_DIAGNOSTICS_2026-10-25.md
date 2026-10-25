# WPAuto P3-E2S-R4B-R29 safe compiler diagnostics

## Outcome

The safe diagnostic chain passed, and the single exact typecheck continuation
reproduced the failure with exit2. It captured54 TypeScript error locations:
46 dependency declarations and8 errors across three other database tests.
There was no direct diagnostic at the new mapping test or changed database
source. This does not certify either file or the unexecuted unit tests as passed.

The failing project is broader than the new test: configuration parsing selected
23 root files and imported dependency declarations. Two of the three failing
test files in the retained image differ from the current worktree. The mixed
test-input scope and failure locations are confirmed. The exact missing types/
dependency relationships and required test changes remain NOT_CONFIRMED; no
TypeScript message text, type values or declaration source was exported.

R28's source patch, new test and both tsconfig inputs were unchanged. No further
source/configuration repair, dependency install, Lint, unit test, candidate image
build, database, service main, OAuth or MCP action followed. R29 stopped at
diagnosis, not repair or acceptance.

## Diagnostic changes and references

Implementation: `9e49ea7b472cf34edfc0d029b36c46b30c4e8d12`.
Four new R29 tool files provide separate bounded stdout/stderr decoding,
diagnostic projection, process observation, fixed-input container coordination
and synthetic tests. R28's worker/result were not overwritten.

The collector retains only channel, numeric TS code, severity, approved relative
file path/category, line/column and count. Unknown paths are masked; dependency
paths are reduced to DEPENDENCY_DECLARATION, and fileless diagnostics to GLOBAL.
It handles ANSI, line splitting, UTF-8 chunks, wrapper prefixes, duplicate
diagnostics, bounded line/row/stream sizes and final unterminated lines. It
separately records stream byte/parsed/unparsed counts. Unknown text is counted
and discarded, never printed or persisted as a raw log.

The process layer records successful completion, spawn category, exit code,
signal, explicit timeout and output-limit flags. Failure without explanatory
compiler/wrapper diagnostics remains DIAGNOSTIC_INCOMPLETE; empty diagnostics
cannot make a nonzero command pass. A successful diagnostic reproduction is
distinct from a successful typecheck.

The implementation follows the fixed
[Node24 child-process contract](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/child_process.md)
for separate streams and process exit observation. The
[official Compiler API examples](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
distinguish file and fileless diagnostics. R29 uses the installed TypeScript
5.9.3 API only to parse existing configuration/root files, not to execute a
second typecheck or emit files. The authoritative check remains the original
CLI invocation with `--project`; passing only one filename would change config
semantics according to the [TypeScript CLI documentation](https://www.typescriptlang.org/docs/handbook/compiler-options.html).

The previously consulted [pnpm output issue14197](https://github.com/pnpm/pnpm/issues/14197)
concerns pnpm12, not this fixed11.19.0 environment. It motivated robust wrapper
handling, not a diagnosis of this failure. R29 observed no pnpm wrapper error
and did not upgrade pnpm or bypass `pnpm exec`.

## Offline helper validation

95 checks passed once before Docker access. They covered both channels, relative
and absolute paths, fileless/configuration/other-file diagnostics, unknown paths,
ANSI/chunking/UTF-8, duplicates, bounds, wrapper masking, sensitive sentinels,
empty failed reports and distinct process classifications. Synthetic Node
children exercised compiler-like stderr/exit2, missing executable, timeout and
output overflow. They did not import the application or run its typecheck.
Host Node was v26.11.1; fixed container runtime was independently verified below.
Worker/runner syntax and diff formatting checks passed. No whole-repo test or
Hosted CI result is claimed.

## Exact continuation and effective configuration

```text
run:r29-20261025032948929
UTC start:2026-10-25T03:29:48.930Z
UTC finish:2026-10-25T03:30:16.090Z
Asia/Shanghai window:2026-10-25 11:29:48 to11:30:16
container attempts:1
authoritative test typecheck attempts:1
```

The fixed retained test image was
`sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c`,
revision `c404ed52228ce5492a85674547998d2f5d31772e`, linux-amd64.
The worker verified Node v24.22.1/Krypton, actual pnpm11.19.0, TypeScript5.9.3
and the existing frozen tsx loader. The resolved local tsc entry hash was:

```text
2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983
```

The following input hashes matched the worktree and container before execution:

| Input | SHA-256 |
|---|---|
| database source index | f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708 |
| new mapping test | 3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16 |
| database test tsconfig | 8b5959ff6fe546f232c55d42d133566280430226bd91ea7b4d86024e392acd4c |
| base tsconfig | 7d2494ace55228a0b7cd736fc55ee5525d4503e5dab58f08b915ee52fa547383 |

Config parse found23 roots, both the new mapping test and database source
included, zero project references and zero config-parse diagnostics. Effective
options retained noEmit=true, composite=false, strict=true, skipLibCheck=false,
declaration/declarationMap/sourceMap=true, NodeNext module/resolution, and the
existing unchecked-index, optional-property, override, return, index-signature
and unknown-catch checks. Nothing was relaxed or added to tsconfig.

One `pnpm build --pretty false` prepared the same prerequisite outputs as R28
and completed exit0, without invoking service main or migrations. It is not a
new candidate image build or a repeated R21–R27 acceptance gate. Then the
single authoritative command was:

```text
pnpm exec tsc --project packages/database/test/tsconfig.json --noEmit --pretty false
```

It completed exit2 with no signal, spawn failure, timeout, output cap or
diagnostic truncation. Its stdout was17386bytes,54 parsed diagnostic lines and
35 unparsed lines; stderr was empty. Unparsed lines were discarded rather than
asserted to be harmless continuations. The54 captured error records are enough
to establish failure sources, not proof that every descriptive detail survived.

## Located failures and input mixture

| Source class | Error records | Captured TS codes |
|---|---:|---|
| Dependency declarations |46|2304,2749,2307,2536,2503|
| multi-site-provider.test.ts |1|2769|
| otp-send-budget.test.ts |3|2345|
| tenant-provider-http.test.ts |4|2345,2379,7022,2769|
| New mapping test |0 direct records|none|
| Changed database source |0 direct records|none|

DEPENDENCY_DECLARATION is the collector's masked node_modules-path category;
the exact dependency filenames/extensions were not retained for independent
identification. The dependency paths/messages were intentionally masked. Missing
name/module and type-related errors do not establish which dependency or ambient
type definition needs changing. No claim of a rootDir, Node version, pnpm bug,
missing DOM library or particular dependency defect is made.

The other database-test records are at the retained versions' locations:

```text
multi-site-provider.test.ts:247:28 TS2769
otp-send-budget.test.ts:170:37,194:37,202:39 TS2345
tenant-provider-http.test.ts:146:37 TS2345
tenant-provider-http.test.ts:190:27 TS2379
tenant-provider-http.test.ts:215:13 TS7022
tenant-provider-http.test.ts:262:28 TS2769
```

Read-only comparison of the reported file manifest to the worktree confirmed:

| Test | Retained container SHA-256 | Worktree SHA-256 | Match |
|---|---|---|---|
| multi-site-provider |82713c019efefb4375779aca903d5d7e99c3762965707079cc607336a22e069e|6d6f821a623ea888052dc2ed14575a0877f1e9183c1af501436767b9fbcef1d4|No|
| otp-send-budget |19d1511315e2fa399749595b3cd72fa51be3203b1338f1a939bcce2840dc4152|516f7101651614df07941ababa49bfdbfdd4c56769b9d8a27c9b24876b030ec0|No|
| tenant-provider-http |ede0e483d848901f457204a07f003ef4457c7cf1a59c426976d29acc380b7d18|ede0e483d848901f457204a07f003ef4457c7cf1a59c426976d29acc380b7d18|Yes|

Thus a project-wide check of the retained image plus only the two R28 overlays
is not a check of the complete current worktree test tree. This input mixture
is confirmed but does not prove the newer test versions pass, explain all46
dependency errors, or make the unchanged failing third test valid. Retained
line numbers must not be used blindly to edit a different current file version.
The observed errors cannot be attributed directly to the new mapping test.

## Safety custody and stop

The sole container `wepuu-r29-20261025032948929` had network=none, no credentials,
no host write mounts, no Docker socket, disabled healthcheck/logging, dropped
capabilities and no-new-privileges. Like R28's compiler container it used UID0
and a disposable writable root for prerequisite outputs; this is not a formal
UID1000 service test. It stopped exit0/no OOM because the diagnostic completed;
the inner typecheck still failed exit2. No retry or second typecheck occurred.
The stopped container was retained, not committed as an image or pruned.

The source patch/new test/config hashes and all tool inputs remained unchanged.
Disk was5811179520bytes free at both checks, above the5GiB initial and2GiB
ending gates. The host result directory and files had verified private ACLs
for the current user, SYSTEM and administrators:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r29-typecheck-StCdpz\result.json
SHA-256:1fb7b490d27b777602cb7f7d6a206e54203165d9019a83606bb5a4432761ce2b
```

Only diagnostic/helper files and this record changed. No real database, service,
email, authorization, WordPress content, MCP tool or production resource was
accessed. No Lint, unit test, image build, push, PR, merge or deployment occurred.

Next, separately approve a bounded read-only dependency-declaration identity
review and a coherent test-input baseline. Preserve strict checks and keep the
application fix untouched. Resolve whether to validate the current complete
test project or an explicitly scoped new-test project without misrepresenting
one as the other. Do not enable skipLibCheck, suppress tests, upgrade dependencies
or start candidate/protocol execution merely to obtain a green result.

```text
P3E2SR4BR29_SAFE_DIAGNOSTICS_PASS=True
P3E2SR4BR29_FAILURE_SOURCES_CLASSIFIED=True
P3E2SR4BR29_TEST_INPUT_MIXTURE_CONFIRMED=True
P3E2SR4BR29_TYPECHECK_CAUSE_CONFIRMED=False
P3E2SR4BR29_TYPECHECK_PASS=False
P3E2SR4BR29_CLEANUP_PASS=True

P3E2SR4BR28_SOURCE_FIX_PASS=NOT_CONFIRMED
P3E2SR4BR28_FOCUSED_TESTS_PASS=False
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The cause flag remains false for the unresolved exact declaration/test type
relationships; failure locations and the mixed input baseline are confirmed.
Stop here without a new repair or execution attempt.
