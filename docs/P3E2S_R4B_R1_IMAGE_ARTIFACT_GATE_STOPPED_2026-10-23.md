# P3-E2S-R4B-R1: frozen source checks and missing-image gate

Status: bounded local attempt stopped; candidate acceptance False. No production access.

## Authorization and frozen source

The operator approved implementation of the bounded continuation: one local acceptance sequence, then one Hosted CI execution only after all mandatory local checks pass. Migration014 remains allowed only in separate disposable legacy Console databases. Candidate/startup/A-B/B-to-A databases must exclude014.

The source under test is `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6` on `codex/p3e2sr4b-source-integration`. It adds only scenario failure projection and tests, and bounded offline-phase failure output, to integration candidate `726cccabf2143de1419c40670a6d5bbedd33197a`. The original worktree and user files were preserved.

Five synthetic child-process tests cover success, nonzero exit, timeout, invalid JSON and secret/exception filtering. Scenario summaries now retain begin/end UTC, monotonic elapsed time, step and fixed diagnostic fields, including when the Docker command exits nonzero. Raw stdout/stderr and exception text are not copied into these public summaries. The full driver-specific safe evidence remains separate.

## Executed results

| Mandatory check | Result |
| --- | --- |
| New collector tests on local orchestration Node | PASS, 5 tests; not the application runtime claim |
| Frozen test-image `pnpm check`, network disabled, Node24 | PASS: 203 passed, 0 failed, 27 skipped database tests |
| Compose configuration parse | PASS, no services started |
| Authorization build subprocess | Returned exit0 after approximately222 seconds; artifact acceptance NOT_CONFIRMED |
| Control build and local image | PASS, correct revision label, non-root and direct Control main |
| Test-stage build and local image | PASS, correct revision; root test stage is not represented as a non-root release image |
| Authorization expected local image lookup | FAIL: expected revision-specific tag absent from the selected local Docker daemon |
| Corrected45-test offline phase in this attempt | NOT_RUN; previous focused45-test PASS remains historical |
| Full database regression, including isolated014 | NOT_RUN |
| Both service startup and A/B/B-to-A acceptance | NOT_RUN |
| Draft PR / Hosted CI | NOT_RUN; local gate did not pass |

The test suite executed from the final test image contains the five collector tests under Node24; no database environment was provided. Its27 database skips are intentional at this stage, not a claim that full database acceptance passed.

## Artifact identities and earliest failure

Expected Authorization tag: `wepuu-r4br1-authorization:248f9cc6616c`.

Present local images:

```text
Control: sha256:78b5456efa95efd4283b207c4da93dc2b0aea2cdabd453ac018ae5aae69df5f8
Test:    sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2
```

Both carry revision `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6`. Control uses `node apps/control-api/dist/main.js` as user `node`. The test target uses `pnpm check`; database execution would explicitly select UID1000, but did not run.

The earliest failed acceptance gate is **Authorization artifact lookup**, not a Consent, database, Refresh, or runtime rejection. The local build wrapper classified subprocess exit0 as build success without checking that its output was available in the selected daemon. That classification is insufficient and is not accepted as an image PASS.

One bounded read-only diagnostic checked the expected tag, matching local image names, and Buildx history. The selected history lists this attempt's Control and test-stage completion, but not a corresponding Authorization release completion in the inspected history. A Go-template driver query was unsupported and supplied no driver evidence. There is not enough evidence to distinguish export/loading behavior, builder selection, or another build-output issue. The build invocation's original full output was suppressed rather than retained, so its precise exporter outcome cannot be reconstructed from that record. Root cause remains NOT_CONFIRMED.

No rebuild, retagging, cache export, full runner retry, database creation or Hosted CI trigger followed this failure. All launched bounded build/check commands finished. No new acceptance network/PostgreSQL/protocol containers were started. Docker's own BuildKit service is not a task-owned acceptance container and was not stopped.

## Minimal next task

Before another acceptance run, correct the build-output contract: select and record the intended local builder/context, specify local image loading explicitly where supported, record an image-ID/metadata output, and require subsequent image inspection to confirm expected revision, architecture, non-root release user and direct-main CMD before returning build PASS. A command exit0 without an inspectable artifact must fail the wrapper. Test this classification with synthetic absent/mismatched artifacts first.

This is a proposed next step, not an executed repair or a proven root cause. Do not reuse old Authorization images or manufacture the expected tag from another image. A fresh bounded build/export and remaining integration attempt requires the next continuation instruction; no automatic rerun occurred.

## Boundary and state

No production hosts, mail, Desktop, credential store, real OAuth, WordPress, MCP, production migration, backup or restore were accessed. The control plane data boundary and prior production/internal-trial acceptance history are unchanged.

```text
P3E2SR4BR1_FINAL_SOURCE_CHECK_PASS=True
P3E2SR4BR1_IMAGE_ARTIFACT_GATE_PASS=False
P3E2SR4BR1_DATABASE_REGRESSION_PASS=NOT_RUN
P3E2SR4BR1_AUTHORIZATION_STARTUP_PASS=NOT_RUN
P3E2SR4BR1_CONTROL_STARTUP_PASS=NOT_RUN
P3E2SR4BR1_AB_MATRIX_PASS=NOT_RUN
P3E2SR4BR1_B_TO_A_PASS=NOT_RUN
P3E2SR4BR1_HOSTED_CI_PASS=NOT_RUN
P3E2SR4BR1_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Readiness flags here refer to this candidate, not a revocation of the separately authorized existing single-site read-only trial.
