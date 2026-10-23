# P3-E2S-R4B-R7: first offline-access authorization fails; adapter boundary conflict reproduced

Status: the single authorized diagnostic reproduction completed and failed. The operation and callback error are confirmed. A concrete adapter classification conflict is independently reproduced against the unchanged runtime in a no-database synthetic test. The HTTP failure is consistent with that conflict, but its precise internal denial branch was not directly captured. No application fix or automatic rerun occurred.

## Frozen source and diagnostic scope

Started from clean candidate `5231d3d9773b2d896c5f14637aa685aa2bcb48ef`. R7 tools were frozen at `876ee980c799a5c2d6b9af969f999e1a5d282a68` on `codex/p3e2sr4b-source-integration`.

Added only scripts before execution:

- `multisite-r7-diagnostics.mjs`: strict callback and existing Provider-log projection.
- `multisite-r7-instrument.mjs`: exact-anchor generation of a diagnostic test copy.
- `multisite-r7-reporter.mjs`: Node test-event transport with fixed diagnostic fields.
- `multisite-r7.test.mjs`: pure projections, transport, drift checks and actual-runtime synthetic adapter cases.
- `reproduce-multisite-r7.mjs`: R6-derived bounded, single-run entrypoint with distinct R7 resources/evidence.

No tracked application or original test file changed. The diagnostic copy was generated into this run's private evidence directory and mounted read-only over the one target test path. It adds operation tracking, callback projection and capture of existing console diagnostics. All original assertion statements, request sequence, Scope arguments, guard-only policy, redirect limits and 120-second test timeout remain unchanged. The target source hash remained:

```text
cf1fa58b71e146972ca88be43ca2cf098c9fe1f5cf132b18354fa8775ac26c65
```

The diagnostic copy SHA-256 was:

```text
cae794e922b46af8121ec86d6725beaf55a10ba8a4bbc7af17d4861bc35ad578
```

The service already subscribes to public Provider events. R7 does not add an API, event subscription, Provider prototype patch or error-context traversal. The test captures only whitelisted projections of existing `oauth.grant_failed` and stage messages; original logging calls are preserved and raw stdout/stderr remain suppressed by the reporter. Existing service diagnostics discard underlying error details, so `unknown` remains unknown rather than a guessed adapter error.

No full authorization URL, state, challenge, code, verifier, cookie, token, account identifier, error description, exception message or raw stack is exported. Duplicate critical callback parameters and diagnostic truncation are recorded. The reporter projects only approved fields and fails closed on missing, skipped, duplicate or additional failed targets. WeakMap metadata associates interleaved completion with its original operation rather than merely the most recently started operation.

## Official contract review

The package pins `oidc-provider` **9.12.2**; application test runtime is Node **24.22.1**. No library/runtime upgrade occurred.

- The pinned [expiresWithSession contract](https://github.com/panva/node-oidc-provider/blob/v9.12.2/docs/README.md#expireswithsession) defaults to session binding unless the source includes `offline_access`.
- The pinned [code handler](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/helpers/process_response_types.js) sets `expiresWithSession=true` only for the true branch. Its false branch marks the client authorization as persisting logout without setting a false payload field, then saves the code.
- The [official events API](https://github.com/panva/node-oidc-provider/blob/v9.12.2/docs/events.md) distinguishes handled authorization failures from server errors. R7 reused existing subscriptions rather than modifying protocol processing.
- [RFC 6749 section 4.1.2.1](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1) permits error callbacks; issuer/state agreement alone does not prove successful authorization.
- The reporter uses [Node24 custom test reporters](https://nodejs.org/docs/latest-v24.x/api/test.html#custom-reporters), including diagnostics transport, not unrestricted console capture.

This review explains a compatibility risk; it is not permission to weaken Session, receipt, resource, Grant, PKCE or replay checks.

## Pre-execution synthetic validation

Windows host orchestration Node26: **9 passed, 0 failed**, with the initial one runtime-only test skipped. A second runtime-only case was then added and the complete final set was run on the retained Node24/Linux image: **11 passed, 0 failed, 0 skipped**. Host Node26 results are not represented as application-runtime acceptance.

Node24 validation used no network, database, secrets or host ports. The test container was non-root, read-only, capability-dropped and temporary, with a bounded tmpfs; it was removed after validation.

Covered:

- Successful, failed, unknown, absent and duplicate-parameter callback projections.
- Provider and operation whitelist validation, sensitive-sentinel exclusion.
- Original assertion preservation and exact-anchor source-drift rejection.
- Reporter skips/missing target/truncation/failure handling.
- An actual deliberately failing child process: operation/error survive transport, raw output and sensitive sentinel do not.
- The real unchanged `PersistentReadOnlyRuntime` with synthetic in-memory dependencies: a same-client native offline code is rejected before base persistence for both resource A and B; plain session-bound code and unrelated-client native code reach the base adapter.
- Missing custom protected link remains denied.
- An explicitly approved, validly linked custom code reaches guarded persistence, while a mismatched subject is denied. This uses a mock storage port and is not PostgreSQL transaction or durability evidence.

## One database reproduction

| Item | Direct observation |
| --- | --- |
| Run | `49aff742ab31` |
| Source/tools revision | `876ee980c799a5c2d6b9af969f999e1a5d282a68` |
| Test image | `sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2` |
| Test-image build revision | `248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6` |
| PostgreSQL image | `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea` |
| Started UTC | `2026-10-23T14:34:42.096Z` |
| Finished UTC | `2026-10-23T14:34:59.154Z` |
| Monotonic total duration | 17053 ms |
| Target duration | 3814.522296 ms |
| Execution result | FAIL; actually executed, no timeout/skip |
| Assertion | `authorization_code_present` |
| Diagnostic-copy location | `packages/database/test/multi-site-provider.test.ts:251:16` |
| Corresponding unchanged-source location | same assertion at line230 |
| Additional failure observed | False |
| Diagnostic truncation | False |

The existing local Docker context and immutable images were verified. There was no image build, pull or relabel. The test ran UID1000 with read-only filesystem, no-new-privileges, dropped capabilities, bounded tmpfs, disabled healthcheck and log-driver none. Its network namespace was shared with the new PostgreSQL container on a verified internal network; PostgreSQL published no host ports. Only the one generated test copy and diagnostics directory were mounted read-only.

The original fixture creates its own random database using migrations 001-013 +015 +016, checks 15 files, and excludes014. No legacy Console test ran. Only synthetic accounts, mock OTP, local signing material and local OAuth artifacts were involved.

Initial free repository-filesystem space: 6486147072 bytes, above5GiB. Final: 6452592640 bytes, above2GiB. Source/image/test postchecks completed without reported failure.

## Actual failure sequence

| Operation | Resource / Scope | Observed callback |
| --- | --- | --- |
| 1-6 | Ordinary A/B and independent Provider-session authorizations, `mcp:read` | Code present; no error |
| 7 / 8 | Pending A/B, completed B then A, `mcp:read` | Both codes present; original immediate-exchange assertions completed |
| 9 / 10 | Delayed A code followed by B authorization | Both callbacks had code; original stale-A-code denial assertion completed |
| 11 | A code exchanged against wrong target | Code present; original cross-resource denial and no-token assertions completed |
| 12 | A, first `mcp:read offline_access` issuance | `invalid_grant`, code absent, no duplicate critical parameters |

The four `grant_load` failure diagnostics before operation12 belong to the unchanged intentional Provider-metadata corruption checks (account/client/resource/scope). Their inherited diagnostic operation context is11; this is not evidence that operation11's earlier authorization callback failed. All four original negative assertions and metadata-restoration `finally` blocks were passed before operation12 started.

At operation12 the existing service reported interaction ended, authorization accepted, then `oauth.grant_failed` with stage `interaction` and category `unknown`. The callback diagnostic then reported `invalid_grant` and no code. Original issuer/state assertions passed before the missing-code assertion failed.

The failing operation never reached its code exchange. Later rotation, offline-B, cross-resource Refresh, explicit revocation and Refresh-replay assertions were **NOT_RUN**. No claim is made that the entire multi-Site test or lifecycle regression passed.

## Confirmed conflict and remaining uncertainty

The unchanged adapter has two different predicates:

```text
eligible: same configured Client + exact configured Resource + scope exactly mcp:read + no RAR
requiresLink: same configured Client + expiresWithSession !== true
```

Its native fallback returns false from `expiresWithSession` for offline_access. Per the pinned Provider code handler, the false result leaves the field absent. `requiresLink` therefore classifies that same-client native code as link-required, while `eligible` rejects its expanded Scope. Adapter upsert then denies before base persistence. The real runtime synthetic test directly reproduces this branch for resource A and B with no base write. This is a confirmed classification/compatibility conflict, not merely speculation from an OAuth error string.

The HTTP reproduction now places the failure exactly at the first corresponding native offline authorization. These independent pieces strongly support the conflict as the candidate failure mechanism. However, R7 did not observe the failing HTTP request's adapter payload or exact private denial branch, and the existing Provider diagnostic remains `unknown`. Under the approved strict evidence rule, the HTTP root-cause flag remains **False**; operation and error flags are True. No raw-stack/payload disclosure was added to force a stronger conclusion.

ADR-024 says ordinary authorization remains session-bound, whereas the unchanged multi-Site regression expects native offline_access/Refresh compatibility. A repair must explicitly reconcile that policy boundary rather than silently deleting the existing lifecycle expectations or widening custom persistent eligibility. In particular, replacing `requiresLink` with `eligible` alone is not an accepted fix: missing/tampered links could evade the required custom-artifact checks.

R6's missing-code assertion is historical evidence without its operation/error fields. R7 does not retroactively establish that R5 or R6 failed at the same operation or for the same cause.

## Retained evidence, cleanup and next boundary

Private host evidence:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r7-1XVJ0V
```

Safe receipts are `attempt.json`, `focused-result.json`, `result.json`. The generated test copy has no embedded runtime credentials. `connection.private.env` contains synthetic database secrets and must not be uploaded or printed.

Both containers were independently verified stopped:

```text
wepuu-r7-test-49aff742ab31 : running=false, exit1
wepuu-r7-pg-49aff742ab31   : running=false, exit0
retained internal network: wepuu-r7-net-49aff742ab31
retained database volume:  wepuu-r7-data-49aff742ab31
```

No global cleanup, production access, real email, Desktop action, WordPress/MCP request, application fix, rerun, full R5 continuation, Hosted CI, push or PR occurred. Existing R5/R6 resources and records were preserved, as were the original dirty worktree and design files.

Next work should first settle the explicit native-offline/custom-persistent contract and design an authoritative, fail-closed artifact classification. If a precise HTTP-branch confirmation is still required, it needs a separately authorized bounded diagnostic change/run; R7 does not automatically spend another attempt. Any repair then needs both legacy native-Refresh compatibility and custom receipt/link tampering regressions, with existing Session/resource/replay denials preserved.

```text
P3E2SR4BR7_SAFE_DIAGNOSTICS_PASS=True
P3E2SR4BR7_FOCUSED_TEST_EXECUTED=True
P3E2SR4BR7_FAILURE_OPERATION_CONFIRMED=True
P3E2SR4BR7_CALLBACK_ERROR_CONFIRMED=True
P3E2SR4BR7_ADAPTER_BOUNDARY_CONFLICT_CONFIRMED=True
P3E2SR4BR7_ROOT_CAUSE_CONFIRMED=False
P3E2SR4BR7_APPLICATION_FIX_PERFORMED=False
P3E2SR4BR7_OWNED_RESOURCES_STOPPED=True
P3E2SR4BR5_DATABASE_REGRESSION_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

These candidate flags neither revoke nor revalidate the separately approved existing single-Site internal read-only trial.
