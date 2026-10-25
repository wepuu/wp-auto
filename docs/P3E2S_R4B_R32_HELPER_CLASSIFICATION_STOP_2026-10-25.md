# WPAuto P3-E2S-R4B-R32 helper classification failure

## Result

R32 stopped in its first synthetic-helper run, before Docker. The reporter
path conversion and real local reporter loading passed their assertions.
The subsequent failure-projection test exposed an ordering bug in the newly
added helper: `killed=true` takes precedence over
`ERR_CHILD_PROCESS_STDIO_MAXBUFFER`, so a simulated output-limit failure is
classified as `CHILD_TIMEOUT` instead of `CHILD_OUTPUT_LIMIT`.

This is an implementation error in the local diagnostic helper, not an R28
application or OAuth failure. No repair-and-rerun occurred after the failed
assertion. Application compilation, focused typecheck, lint and the 19 target
mapping tests remain NOT_RUN.

## Changes and evidence

The starting commit was `3ea6815`. Changes are restricted to:

- `scripts/r31-focused.synthetic.mjs`: file-URL reporter argument, path cases,
  safe child checks and fixed top-level failure output.
- `test/persistent-authorization/r31/synthetic-child.mjs`: bounded synthetic
  reporter child and whitelist-only failure projection.
- `scripts/run-r31-focused.mjs`: R32 evidence/run naming and inclusion of the
  new helper in tool hashes; no container execution occurred.

The three helper syntax checks completed without syntax errors. Host Node
v26.11.1 then executed the synthetic suite once. It emitted:

```json
{"passed":false,"stage":"failure_projection","checksCompleted":76,"category":"SYNTHETIC_ASSERTION_OR_EXECUTION_FAILED","rawOutputSuppressed":true,"dockerInvoked":false,"applicationTestsRun":false}
```

The command exit code was 1 and was explicitly propagated by PowerShell.
The 76 completed checks do not constitute full-suite acceptance. The success
path, Windows/POSIX path conversion, actual reporter loading, intentional
unsupported-scheme child and preceding failure cases were reached before the
classification assertion failed. The synthetic temporary fixture remains local.

The failing input was synthetic, not a second actual output-limit process:

```text
code = ERR_CHILD_PROCESS_STDIO_MAXBUFFER
killed = true
expected category = CHILD_OUTPUT_LIMIT
implemented first branch = CHILD_TIMEOUT
```

The safe top-level result contained no exception body, stack, child output or
sensitive sentinel. The category must be corrected before accepting the helper.
The minimal preview is to classify the specific output-limit code before the
generic killed/timeout branch. That correction has not been applied or tested.

## Integrity and boundaries

Post-stop source verification occurred at 2026-10-25T07:01:34.7281891Z; this is
not an exact independently recorded failure timestamp. The R28 hashes remain:

```text
packages/database/src/index.ts
f27582998d85485c51124b0c5e501fe30fde2e664399b2f68a1ef5ca7a5f7708
packages/database/test/authorization-consume-mapping.test.ts
3fadc4c2d42d4a74cd76d6f28f8753951c5815269bf946a34bc4ea043f04fa16
```

No existing application, test assertion, TypeScript config, dependency or lockfile
changed in R32. No Docker invocation, image build, database, service, production
access, WordPress request, authorization or MCP call occurred. There is no new
container to clean up. No push, PR, merge or deployment was performed.

The R30 broader typecheck failure and R31 history remain unchanged. The helper
needs a subsequent correction and a complete successful synthetic run before
the single authorized-container validation can be considered again.

```text
P3E2SR4BR32_HELPER_SYNTHETIC_PASS=False
P3E2SR4BR32_FOCUSED_TYPECHECK_PASS=NOT_RUN
P3E2SR4BR32_TARGETED_LINT_PASS=NOT_RUN
P3E2SR4BR32_MAPPING_UNIT_TESTS_PASS=NOT_RUN
P3E2SR4BR32_R28_INPUTS_UNCHANGED=True
P3E2SR4BR32_CLEANUP_PASS=NOT_APPLICABLE

P3E2SR4BR30_TYPECHECK_PASS=False
P3E2SR4BR28_SOURCE_FIX_PASS=NOT_CONFIRMED
P3E2SR4BR28_CANDIDATE_BUILD_PASS=NOT_RUN
P3E2SR4BR28_EXPIRED_SESSION_PROTOCOL_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after recording this failure. Do not automatically fix and rerun, weaken
assertions, skip the helper gate or access production.
