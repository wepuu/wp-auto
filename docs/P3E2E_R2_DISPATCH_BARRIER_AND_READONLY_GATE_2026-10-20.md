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
