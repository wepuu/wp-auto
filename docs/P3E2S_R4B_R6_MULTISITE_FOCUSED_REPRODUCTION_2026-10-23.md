# P3-E2S-R4B-R6: multisite failure located; root cause not confirmed

Status: the authorized single focused reproduction completed and failed. The failure location is confirmed; the OAuth error and root cause remain NOT_CONFIRMED. No automatic retry, repair or R5 continuation occurred.

## Frozen scope and safe diagnostics

R6 started from clean candidate `aebec8b30362d81d365857ced45937814578bccf`. The safe reporter, synthetic tests and bounded reproduction entrypoint were frozen at `cb7252592196856ef87404d54f9a1a079a1fa078` on `codex/p3e2sr4b-source-integration`.

Only the original `packages/database/test/multi-site-provider.test.ts` ran. Its application and test source were unchanged. The host test-source SHA-256 was:

```text
cf1fa58b71e146972ca88be43ca2cf098c9fe1f5cf132b18354fa8775ac26c65
```

The reporter consumes Node test events and retains only the exact target test's state/duration, fixed error categories, approved assertion names, SQLSTATE and the allowed test-file location. Nested errors and hook failures are projected independently. It suppresses stdout/stderr test events, assertion actual/expected values, arbitrary messages, raw stacks and protocol material. Missing, skipped, duplicate or extra failed tests cannot yield PASS. The runner requires both a successful child execution and a successful safe report.

Preparation exposed a Windows custom-reporter loading issue: a native drive-letter reporter path yielded no JSON. The synthetic transport fixture now uses a standard file URL and removes the parent test context from its child environment. This correction was made before the real reproduction. Final helper validation: **4 passed, 0 failed, 0 skipped** on the Windows host orchestration Node26 and separately on retained Node24/Linux. The actual child transport test deliberately fails a synthetic assertion and confirms exit1, valid failure JSON and exclusion of secret sentinels. These repeated helper-development tests were not repeated database reproductions.

## One actual reproduction

| Item | Directly observed value |
| --- | --- |
| Source under test | `cb7252592196856ef87404d54f9a1a079a1fa078` |
| Test image | `sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2` |
| Actual test-image build revision | `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6` |
| PostgreSQL image | `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea` |
| Docker context | `desktop-linux`, local endpoint verified |
| Run | `6c36702c9ac3` |
| Started UTC | `2026-10-23T13:47:54.628Z` |
| Finished UTC | `2026-10-23T13:48:23.005Z` |
| Monotonic total duration | 28358 ms |
| Target-test duration | 7050.969057 ms |
| Target state | FAIL, actually executed; not skipped |
| Container state | Test exited1; PostgreSQL stopped/exit0 |
| Host private evidence | `C:\Users\liulo\AppData\Local\Temp\wepuu-r6-DfdAii` |

The original target timeout remained 120 seconds, with an outer 150-second bound. Neither timeout fired. Images were already present; there was no build, pull or relabel. Only the diagnostics scripts were mounted read-only. The original application/test files came from the immutable image, without assertion or source replacement.

The test process ran as UID1000 with a read-only filesystem, dropped capabilities, no-new-privileges, disabled healthcheck and a bounded temporary filesystem. It shared the new PostgreSQL container's network namespace on an internal network. The network Internal flag was directly confirmed; PostgreSQL PortBindings were `{}`. No host ports or external network were provided.

The unchanged target fixture copies 001-013 +015 +016, asserts a 15-file migration source set and migrates its new test-owned database. It excludes014. This run did not execute the legacy Console database suite. It used synthetic accounts, Mock OTP and local OAuth artifacts; no real user OAuth, mail, Desktop, WordPress or MCP operation occurred.

Initial free repository-filesystem space was 6486216704 bytes, above the 5GiB initial gate; the final sample was the same, above the 2GiB phase gate. The source and test hash postchecks completed without a reported failure.

## Confirmed failure and limits

The reporter returned:

```text
targetExecuted: true
state: FAIL
category: ASSERTION_FAILED
assertion: authorization_code_present
file: packages/database/test/multi-site-provider.test.ts
line: 230
column: 16
additionalFailureObserved: false
```

The parent test-runner error also retained the same assertion name with category NOT_CONFIRMED; it is a wrapper, not a separate confirmed product failure. The nested assertion supplies the specific source location above. No independent hook failure was observed in the projected result, and both container stop checks passed.

At this source location, `codeFor()` has reached the expected loopback callback, checked issuer and state, then found no `code` query parameter. This is the confirmed observation. The callback's OAuth `error` parameter, stage within the repeated A/B sequences, resource index and Provider decision were not captured. They must not be inferred from the missing code. Earlier calls in the same test may already have completed successfully; this record does not claim that no Code or Token was ever issued during the test.

This reproduces the failed target test under a focused run and locates its current failure. R5 retained only the failed title, so it is still unproven that R5 stopped on this exact assertion or the same underlying cause. There is insufficient evidence to classify a product regression versus fixture, session, policy or environment behavior. Root cause remains **NOT_CONFIRMED**. No security check was relaxed, failed assertion removed, application behavior repaired or test repeated.

The next bounded task should first review this callback path offline and plan safe projection of a fixed OAuth error category and operation/resource alias. Full redirect URLs, state, Code, verifier and tokens must remain excluded. Any additional reproduction or repair is separate work; this run did not advance to complete database regression, default-main startup, A/B acceptance or Hosted CI.

## Stop state and retained resources

The original orchestration terminal session was unavailable when conversation work resumed. The already-completed host receipts and existing container states were read directly; the command was not launched again. The continuation added this record only.

```text
stopped test: wepuu-r6-test-6c36702c9ac3
stopped PostgreSQL: wepuu-r6-pg-6c36702c9ac3
retained internal network: wepuu-r6-net-6c36702c9ac3
retained database volume: wepuu-r6-data-6c36702c9ac3
```

No resources were globally cleaned. The host evidence directory contains private synthetic connection material; the retained data volume may contain synthetic state. Neither belongs in Git or chat. Original R5/R6 receipts remain unchanged, with safe results distinguished from private connection files. The original dirty worktree and `design/` were preserved. No production connection, Hosted CI, push, PR or merge occurred.

```text
P3E2SR4BR6_SAFE_DIAGNOSTICS_TEST_PASS=True
P3E2SR4BR6_FOCUSED_TEST_EXECUTED=True
P3E2SR4BR6_FAILURE_REPRODUCED=True
P3E2SR4BR6_FAILURE_LOCATION_CONFIRMED=True
P3E2SR4BR6_ROOT_CAUSE_CONFIRMED=False
P3E2SR4BR6_OWNED_RESOURCES_STOPPED=True
P3E2SR4BR5_DATABASE_REGRESSION_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Candidate flags do not revoke or revalidate the separately approved existing single-site internal read-only trial. Historical failed and successful results remain intact.
