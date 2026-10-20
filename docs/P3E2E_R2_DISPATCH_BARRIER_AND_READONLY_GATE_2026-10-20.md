# P3-E2E-R2: real dispatch barrier and bounded read-only gate

## Scope and immutable parent

Parent candidate is Draft #96, Head `4ae57829d5f7b35e4ceae3794dfca99f55a8bcf4`.
Its Hosted helper run 39421914755 and Phase 2 Platform run 39421914717
succeeded. Its partial live observation remains stopped/incomplete: the final
generated PHP syntax subprocess had not finished before the first read. Later
syntax success does not amend that historical result.

R2 changes only local acceptance orchestration, synthetic tests, CI and this
record. No application/runtime, schema, dependency or Connector change. The
platform remains control-metadata-only; no WordPress tool inputs, outputs or
content pass through it. No OAuth, MCP JSON-RPC, OTP, pairing, service restart,
deployment, clock change, migration, Grant cleanup or Desktop enable is allowed.

## Real entry, not only a receipt predicate

`scripts/e2e-readonly-runner.mjs` owns the child execution callback, including
SSH and the existing HTTP/check subprocesses. Only `prepare` and a complete
`run` are exposed; no per-stage live entry, force or resume path exists.
`scripts/e2e-readonly-dispatch.mjs` implements:

`PREPARING -> LOCAL_VERIFIED -> READY -> OBSERVING -> COMPLETE`, or terminal
`STOPPED` on any failure. `Promise.allSettled` waits for every offline job even
after a sibling rejects. Each completion needs real exit zero, semantic PASS,
expected source/environment identities, completion time and receipt hash.
Frozen artifacts are rechecked before READY, before the live claim and before
every stage. The prior `readOnlyPrerequisites` predicate now lies on this actual
path, before opening the window or invoking a subprocess. Timestamps do not
replace the in-memory completion barrier.

The private fixed-host binding supplies only reviewed read-only commands and
projections. Its source, payload, transitive helpers, final generated PHP and
configuration hashes must be frozen locally; private account/site identifiers
and actual configs are not committed. The fixed PHP 8.2.28 syntax check must
finish through a read-only mount, not stdin, before readiness is requested.

The single controller orders resource, full platform (including original
runtime_protections), metadata, disabled Desktop inventory, WordPress and ending
checks. A durable exclusive claim prevents replay. Each child receives the
smaller of its normal timeout and the remaining 15-minute monotonic/wall budget.
Abort propagates to owned children. No later phase runs after failure; earlier
success or later independent healthy snapshots cannot make the run PASS.

## Synthetic validation

Actual runner tests instrument the underlying process callback, not a separate
mock predicate. Pending, rejected, launched-only, nonzero, semantic failure,
wrong-source/environment, future completion, missing receipt, invalid set,
final-PHP mismatch, source drift, failed claim, cancellation and stale operator
confirmation must all produce **zero** live process calls. Other tests cover
sequential ordering, real local child failures, deadline budget, concurrent
entry, terminal stop, protected-state changes and sensitive-output filtering.

Existing Python, SQL/Provider and PHP tests remain required in Hosted CI. The
isolated Desktop test uses only a synthetic loopback issuer and no real browser,
authorization submission or token exchange. Source-bound old evidence may be
reused without rewriting its original candidate identity; missing machine
receipts require only the corresponding local check to be rerun.

Local dispatcher/transport initial result: 32 tests PASS, 0 FAIL, 0 SKIP.
Candidate Hosted CI and private binding completion are pending at this snapshot.

## Live execution status at initial candidate creation

Production has **not been accessed by R2**. Operator readiness will be requested
only after final offline completions and actual Hosted CI success. An expired
Session stops this run; login recovery/OTP is not authorized. The final result
will be appended, preserving this preparation snapshot and all R1 failures.

```text
P3E2E_R2_DISPATCH_BARRIER_PASS=NOT_CONFIRMED
P3E2E_R2_COMPLETE_READONLY_GATE_PASS=NOT_RUN
P3E2A_PREFLIGHT_PASS=False
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Even complete preflight success grants no authority for Desktop enable, a real
OAuth flow or the later site-health call. All require fresh separate approval.

## Final R2 preparation and single live result (append-only)

The functional candidate was frozen at
`0d846e22c41892aabc9e431f2ae30644c3439a68`, parent still the fixed #96 Head.
Its helper CI **39426320184** and full Phase 2 Platform CI **39426320235**
completed successfully. The latter executed strict checks, database/isolation,
OCI, local signing, backup/restore, PHP interoperability, audit/SBOM and retained
OAuth conformance gates. These are isolated candidate validations, not evidence
that the current production preflight passed.

All 11 prerequisites were completed and bound to expected source/environment
and immutable receipt hashes before the real runner entered READY. Local
results: dispatcher/transport 32 PASS; Python 14 methods; actual isolated SQL 24
cases; pinned PHP 8.2.28 projection 15 cases; exact final generated PHP syntax
PASS via read-only mount; isolated fixed-Desktop parameters 2 branches; private
adapter 3 mocked tests; exact private factory 2 wiring tests (including every
missing prerequisite); safe projection 2 tests. No live read was used to test
the dispatcher. The local SQL wrapper initially failed to recognize its output
framing; only its synthetic fixed-summary parser was corrected. Actual SQL then
completed all 24 cases. Production strict-JSON transport was not relaxed. Owned
local SQL containers were stopped; unrelated containers were not manipulated.

Frozen identities (private bindings and actual config bytes remain local):

- Run: `r2-80e7b587d04b4fa5`.
- Identity manifest: `3791a905226122bafb778d8907b061a7184785650f1c6bad6507ea6fbe4a29de`.
- Streamed read-only payload: `eccab13b606dff85b4c95c132c7fb25e23a5d22b2cadd2e6d1e7e2e39cbf37c3`.
- Final generated PHP: `837f4c50169316669b748670b5eb114302c5d17c7e867bc40c092e974a310a6d`.
- Project disabled config: `00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139`.

After preparation/CI completed, the operator confirmed the original account and
Home Tenant browser, WordPress login and PuTTY readiness. This is operator
evidence, not a new database Session verification. The controller then prepared
again from the frozen real completion receipts before the exclusive live claim.

The single observation window opened at **2026-10-20T13:14:57.658Z**
(21:14:57.658 Asia/Shanghai). The first resource gate failed closed:

| Original gate metric | Observed | Required | Result |
| --- | ---: | ---: | --- |
| MemAvailable | 451,052 KiB | >= 524,288 KiB | FAIL |
| memory full avg10 | 0.54 | < 1 | PASS |

The correlated child exited **1**, stage `resource`, fixed code
`RESOURCE_PRESSURE`. These values came from the failing gate itself, not a later
resource resample. The controller entered terminal `STOPPED`, outer category
`STAGE_NOT_CONFIRMED`, and the resource receipt preserved the original failure
code and thresholds. Its local receipt write time is approximately
2026-10-20T13:15:04Z; this is **not** an independently recorded exact remote
sample time. No complete elapsed-monotonic duration is claimed for this failed
run because the terminal receipt does not export it. The window has a genuine
pre-recorded monotonic start; it was not reconstructed from chat timestamps.

| Stage | Actual result |
| --- | --- |
| Completed-prerequisite dispatch barrier | PASS |
| First production resource gate | FAIL: RESOURCE_PRESSURE |
| Full platform, including runtime_protections | NOT_RUN |
| Public/origin Metadata, Discovery and Client | NOT_RUN |
| Disabled Desktop live inventory | NOT_RUN |
| WordPress identity, backup, NTP and five clock samples | NOT_RUN |
| Lightweight ending/whole-gate aggregation | NOT_RUN |

There was **no automatic retry, later resource sampling, threshold change or
resource tuning**. No OTP, Desktop enable, OAuth/Consent/token exchange, MCP,
Proof, pairing, identity reset, configuration mutation, deployment, migration or
service restart occurred. Current five-service health, Session/owner, target
Grant count, Site A/Grant/Outbox, NTP and dual email guards were **not newly
confirmed** by the skipped stages. Earlier accepted results remain historical;
they are not substituted as fresh PASS evidence. The original dirty worktree,
`design/` and actual Desktop configuration were preserved.

```text
P3E2E_R2_DISPATCH_BARRIER_PASS=True
P3E2E_R2_COMPLETE_READONLY_GATE_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The frozen run and its exclusive claim remain terminal; do not resume it. A
separately approved bounded read-only resource investigation is a reasonable next
step before proposing another fresh full preflight. This observation proves a
threshold breach, not its root cause. It does not authorize killing processes,
Swap changes, container restart, memory tuning or lowering the threshold. Keep
Draft #97 and all historical PRs unmerged. Later evidence-only commits and their
CI must be distinguished from the functional Head used for this stopped run.
