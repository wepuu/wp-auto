# WPAuto P3-E2S-R4B-R31 focused validation stopped at synthetic reporter loading

## Result

R31 stopped during the first local synthetic-helper invocation. A Windows
filesystem path was passed directly as the Node custom test reporter module
specifier. The ESM loader rejected the drive-letter protocol with
`ERR_UNSUPPORTED_ESM_URL_SCHEME`. This is a confirmed helper wiring error,
not evidence that the R28 OAuth mapping or its unit tests failed.

No Docker command, prerequisite compilation, application typecheck, lint,
target mapping test, service, database, OAuth, MCP or production access was
performed. The failure-stop rule was honored: no repair-and-rerun occurred.

The worktree started clean at
`290e6dacf868e2f48d57b8e42f54e02154249cb0`. Post-stop file verification was
recorded at 2026-10-25T05:26:36.6365325Z; this is the verification time, not
an independently captured exact synthetic failure timestamp.

## Prepared changes

The new `packages/database/test/tsconfig.consume-mapping.json` contains:

```json
{
  "extends": "./tsconfig.json",
  "files": ["authorization-consume-mapping.test.ts"],
  "include": []
}
```

Its SHA-256 is
`5049d6cff35a1fa04558d5d718f56f4615352efa3ea2040377eb717d389166b5`.
It selects a focused entry without changing the existing broader database test
config, root strict options, libraries, dependency versions or lockfile.
Actual TypeScript parsing and transitive-program validation remain NOT_RUN.

The prepared local harness consists of the runner, synthetic tests and the
`r31` worker, result projections and custom reporter. It reuses the R30 input
manifest verifier and R29 bounded TypeScript diagnostic collector. The intended
container sequence is fixed runtime/input checks, prerequisite compilation,
focused typecheck, two-file lint, 19 mapping tests and input postcheck. It is
not an accepted or successfully exercised runner at this point.

Host Node v26.11.1 was used only for helper syntax/synthetic work, not as the
authorized application runtime. The runner/worker syntax commands reported
no syntax errors. The synthetic suite did not complete or emit its aggregate
success JSON; no synthetic PASS count is claimed. The final PowerShell command
bundle returned zero after unrelated later checks, which does not override the
failed Node child invocation.

## First failure and bounded correction preview

The first failing check was the real synthetic child test that loads the custom
reporter. Earlier assertions did not produce a retained aggregate receipt.
Its invocation was equivalent to:

```text
node --test --test-reporter=<absolute Windows drive path>/reporter.mjs <dummy.test.mjs>
```

The child exited 7 while loading the reporter; the synthetic suite propagated
failure. The dummy file contains one harmless Node test, not an import of any
WePuu application module. The local temporary dummy fixture is retained.

The failure identifies protocol `d:` as unsupported. Node's official
[ESM documentation](https://nodejs.org/api/esm.html#urls) describes URL-based
module resolution and recommends `pathToFileURL` when importing a path.
The official [URL API](https://nodejs.org/api/url.html#urlpathtofileurlpath-options)
provides conversion with platform-specific path handling and escaping.
The current documentation consulted is not claimed to be the exact installed
Node patch's source; the actual local error establishes this failure.

The minimal next correction is to use
`pathToFileURL(path.resolve(reporterPath)).href` for the synthetic reporter
specifier and handle helper-child failure through a fixed safe category instead
of allowing a default exception dump. Apply that only to the local helper; do
not modify the R28 source, assertions or production settings. The Linux worker's
reporter path has not failed or been tested and must not be conflated with this
Windows failure.

Before another authorized run, verify conversion for drive paths, Chinese
characters, spaces and URL-reserved characters; retain a synthetic loader
failure case and ensure it produces no raw exception or child stdout/stderr.
Then require the full helper suite to complete before any single container
execution. This preview was not applied or tested in this attempt.

## Integrity and scope

The R28 source and test retain their recorded hashes:

```text
packages/database/src/index.ts
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708

packages/database/test/authorization-consume-mapping.test.ts
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

Only the new focused config, harness and this record were added. There were no
edits to existing application, test, dependency, ESLint, base TypeScript or
runtime configuration files. No dependency installation or image build occurred.
No container was created, so container cleanup is NOT_APPLICABLE rather than a
new container-cleanup PASS. Existing containers and images were not changed.

No WordPress content or production credential entered the test path. The dummy
fixture is synthetic; its failed child emitted local loader diagnostics to the
tool channel, exposing a helper failure-reporting gap. Raw exception text is
not copied into this record. No production secret disclosure is observed.

R30's whole-project typecheck failure remains unchanged. R31 cannot establish
source correctness, complete tenant isolation, Provider response behavior,
Desktop account-switch recovery or controlled-use readiness.

## Status and stop

```text
P3E2SR4BR31_HELPER_SYNTHETIC_PASS=False
P3E2SR4BR31_FOCUSED_TYPECHECK_PASS=NOT_RUN
P3E2SR4BR31_TARGETED_LINT_PASS=NOT_RUN
P3E2SR4BR31_MAPPING_UNIT_TESTS_PASS=NOT_RUN
P3E2SR4BR31_R28_INPUTS_UNCHANGED=True
P3E2SR4BR31_CLEANUP_PASS=NOT_APPLICABLE

P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4BR28_SOURCE_FIX_PASS=NOT_CONFIRMED
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. No migration, deployment, new authorization, token processing or MCP
call is authorized by this failure record. Helper correction and a new bounded
validation attempt require a subsequent instruction; neither happened here.
