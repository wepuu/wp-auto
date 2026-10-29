# P3-E2S-R4B-R5: retained-image acceptance stopped at database regression

Status: one authorized local sequence executed; database regression failed. No automatic retry or later acceptance stages.

## Frozen tools and artifacts

The starting candidate was `53b81eefb5275ff4def84602898d0a48f134871a`. R5 entry protection and focused tests were frozen at `30dffd0c52a9474cee49931cdc54268e72256be3`, on the independent `codex/p3e2sr4b-source-integration` worktree. The original dirty worktree, user files and `design/` were not modified.

The entrypoint now requires explicit immutable image IDs, original build revisions, a clean expected source HEAD and an exact local context. It removes the PostgreSQL pull fallback, records per-phase disk gates, disables irrelevant scenario-container healthchecks, and verifies ownership/stopped state during cleanup. New isolated compiled-output probes are nonce-owned and included in cleanup. CI's existing caller was updated locally to label its future builds and resolve tags to IDs before invoking the stricter runner; CI was not triggered.

Focused synthetic validation: **12 passed, 0 failed, 0 skipped**, first on the host orchestration runtime and then in the retained Node24 image with network disabled, UID1000, read-only filesystem and a read-only scripts mount. Tests cover missing/incorrect image inputs, remote contexts, image user/CMD/revision drift, disk boundary and invalid samples, compiled-output mismatch, cleanup ownership/running state, timeout/nonzero-result propagation and sensitive-output suppression. These helper tests did not perform real authorization or database work.

| Role | Immutable image | Actual build revision |
| --- | --- | --- |
| Authorization | `sha256:26c094ab8280e5071bf42e072597ef364f04b57cec2817137d2ed15f874497d3` | `a3aaf70780adc93aadba030716e61ed9648a00df` |
| Control | `sha256:78b5456efa95efd4283b207c4da93dc2b0aea2cdabd453ac018ae5aae69df5f8` | `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6` |
| Test | `sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2` | `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6` |

Application, dependency, Containerfile and mounted integration-harness inputs were unchanged from those build revisions. Each image retained its original revision; no relabeling or rebuilding occurred. Release metadata confirmed linux/amd64, user `node` and the corresponding direct main CMD. The test image's root default is disclosed; all three identity probes and the database test process used explicit UID1000.

All three probes returned Node `v24.22.1`, LTS `Krypton`, UID1000 and the same **162-file** application identity hash:

```text
9442beded35953e7c105a5ef47b3201e4f24fa206bce0914d4aa063fcd4004b4
```

The hash covers compiled application output, package manifests, frozen dependency inputs and migration source. It excludes later verification-only helper scripts, and is not a claim that all bytes of differently purposed images are identical.

## One actual sequence

```text
run: 7311c79527e4
context: desktop-linux, verified local named-pipe endpoint
started UTC: 2026-10-23T11:31:37.006Z
finished UTC: 2026-10-23T11:33:22.000Z
monotonic duration: 104997 ms
host private evidence: C:\Users\liulo\AppData\Local\Temp\wepuu-persistent-6IWq6m
initial repository-filesystem free space: 6550581248 bytes (minimum 5368709120)
```

| Stage | Actual result |
| --- | --- |
| Artifact compatibility / compiled identity | PASS |
| Offline syntax, wiring, fixture and protocol classification | PASS, 15 +15 +15 checks |
| Full isolated database regression | FAIL, stopped after 72591 ms |
| Authorization startup acceptance | NOT_RUN |
| Control startup acceptance | NOT_RUN |
| A/B matrix | NOT_RUN |
| B-stop-before-A transition | NOT_RUN |
| Final source/artifact postflight | NOT_RUN because database stage failed |
| Owned-resource stop checks and safe evidence export | PASS |

The database phase was enabled with `WEPUU_TEST_LEGACY_CONSOLE=allow-isolated`, under the prior explicit authorization. The test implementation uses separate disposable legacy regression databases for 014; persistent Authorization profile fixtures select 001-013 +015 +016. The unexecuted service-driver phases retain that profile and reject 014. No production or existing project database was used. Because the suite failed, this run does not claim complete migration or database regression acceptance.

The network `wepuu-persistent-net-7311c79527e4` was created internal and its internal flag was directly confirmed. PostgreSQL published no host ports (`PortBindings={}`). Application code came from the immutable images; only the reviewed harness was mounted read-only. Synthetic account/authorization code inside database regression does not constitute a real-user OAuth flow. The platform received no WordPress content, MCP tool inputs or outputs; no real mail, OTP, Desktop, WordPress or MCP was accessed.

## Earliest failure and evidence limit

The exported fixed-field database result identifies one failed test title:

```text
real Authorization HTTP binds same-client sequential and interleaved resources to separate Grants
```

Its source is `packages/database/test/multi-site-provider.test.ts:72`. The TAP ordinal `14` in the stored `not ok 14` line is a test ordinal, not migration014. The scenario collector retained `COMMAND_FAILED` with child category `DATABASE_REGRESSION_FAILED`; the top-level failed stage is `database`.

The existing database helper intentionally suppressed raw output and retained only failed test titles. It did **not** retain the failed assertion, SQLSTATE, child stack or detailed TAP summary. Therefore the exact root cause and full pass/skip totals are **NOT_CONFIRMED**. This result cannot distinguish a product regression from fixture, permission, timing or environment failure. No raw token, connection string, request body or exception text was exported. No rerun or database restart followed this failure.

The smallest next investigation should review the named test offline and add narrowly allowlisted failure diagnostics before seeking a separate focused isolated reproduction. It must not remove the failed test, weaken isolation assertions or advance to A/B based on the preceding offline PASS.

## Retained resources and final state

All six nonce-owned containers were directly confirmed stopped: three identity probes, offline, database, PostgreSQL. Scenario exit states were respectively 0 for identity/offline, 1 for database and 0 for the stopped PostgreSQL. No global cleanup was performed.

The following resources remain for explicit follow-up disposition:

```text
network: wepuu-persistent-net-7311c79527e4
data volume: wepuu-persistent-data-7311c79527e4
evidence volume: wepuu-persistent-evidence-7311c79527e4
```

The evidence volume and host directory include private synthetic connection material and must not be published. Only reviewed safe JSON belongs in documentation. Disk phase gates all passed; the observed D-drive free space after cleanup was 6486966272 bytes. Stopping the test PostgreSQL is not deleting its retained volume.

```text
P3E2SR4BR5_ARTIFACT_COMPATIBILITY_PASS=True
P3E2SR4BR5_OFFLINE_PASS=True
P3E2SR4BR5_DATABASE_REGRESSION_PASS=False
P3E2SR4BR5_AUTHORIZATION_STARTUP_PASS=NOT_RUN
P3E2SR4BR5_CONTROL_STARTUP_PASS=NOT_RUN
P3E2SR4BR5_AB_MATRIX_PASS=NOT_RUN
P3E2SR4BR5_B_TO_A_PASS=NOT_RUN
P3E2SR4BR5_OWNED_RESOURCES_STOPPED=True
P3E2SR4BR5_LOCAL_ACCEPTANCE_PASS=False
P3E2SR4BR5_IMAGE_REBUILT=False
P3E2SR4BR5_PRODUCTION_ACCESSED=False
P3E2SR4BR5_HOSTED_CI_RUN_PERFORMED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

This evidence was directly collected by the assistant's bounded local tools. No Hosted CI, push, PR or merge occurred. Historical R4 PASS and earlier failures remain unchanged. Candidate readiness flags do not revoke or revalidate the separately approved existing single-site internal read-only trial.
