# WPAuto P3-E2S-R4B-R37 missing RT offline evidence and reporting

## Result

R37 recovered R36's exact failed assertion, `DENIED_STATUS`, from the retained
original report without starting a database or application. The failure is
therefore the missing-RT-link branch's refresh response not matching expected
HTTP 400, not its earlier receipt-version constraint or fixture exchange check.

The actual refresh status, error category, Token presence and link deletion
row count were never serialized by the old fixture and remain NOT_OBSERVED.
The precise application/SQL cause is still NOT_CONFIRMED. Do not replace this
gap with an assumed 500, successful deletion or absence of Token issuance.

The new independent report helpers passed 147 complete synthetic checks. They
preserve the branch's stages, fixed assertions, response summaries and state
readbacks through generation/projection/JSON aggregation. A generated fixture
was syntax-checked only; no protocol or database operation was executed.

## Original R36 evidence recovered

```text
implementation: 1287498f4a3466c800500965f57484c58c8339f3
run: r37-20261025102721011
UTC start: 2026-10-25T10:27:21.015Z
UTC finish: 2026-10-25T10:27:26.667Z
Asia/Shanghai: 2026-10-25 18:27:21 to 18:27:26
read-only exporter attempts: 1
new protocol requests: 0
database operations: 0
```

The host R36 receipt hash and run identity were verified before access. The
retained evidence volume and stopped matrix container matched R36 ownership.
One UID1000 Node exporter read exactly the original `integration.json` and
`driver-result.json` inside that volume, in memory, through a read-only mount.
No raw report bytes were copied to host output.

The recovered integration projection contains:

```text
stage: link_and_version_guards
category: ASSERTION_FAILED
assertion: DENIED_STATUS
observedRefreshStatus: NOT_OBSERVED
observedRefreshError: NOT_OBSERVED
```

The five recorded recent diagnostics were Code exchanges, not refreshes:

```text
400 invalid_grant
400 invalid_grant
400 invalid_grant
400 invalid_target
200, no recorded error
```

The final 200 is consistent with the missing-link fixture's initial exchange
passing. The frozen source then executes the DELETE and calls `denied()` on
the A refresh result. Its first assertion compares response status to 400.
Given the recovered assertion and last successful check, control-flow analysis
confirms that this sequence reached that comparison and the comparison failed.

This proves neither the DELETE row count nor the exact non-400 response. The
old fixture ignored DELETE row count; zero affected rows followed by a valid
refresh and one deleted row followed by a server error are different possible
explanations. The raw original report does not retain AssertionError actual/
expected values, refresh response summaries or these state readbacks.

Original retained source hashes, computed inside the exporter:

```text
integration.json
48a78301ecab0eca42d75ea51605d550693b4086ed86bbe4665aa52273c16a64
driver-result.json
e2482113481fc7924032d959ea02ab446184b1f5b8a3c925f1a23c191af52812
```

R36's old host-safe files remain unchanged. Their projector omitted the branch
assertion; extraction with the new strict projector recovers it from the
original files rather than inventing it from source or rerunning the failure.

## Safe report chain prepared and tested

All additions are independent local helpers under `r37` and two scripts. The
frozen R8 integration, R22 projector/driver, application, migrations, dependencies,
images and production configuration remain unchanged.

The callback-only fixture helper introduces:

```text
missing_rt_authorize
missing_rt_exchange
missing_rt_link_delete
missing_rt_refresh
missing_rt_postcheck
```

It records only fixed enums, bounded integers and booleans: fixture readiness,
exchange status/error/Token-presence flags, DELETE row count, matching link/
artifact/classification counts, refresh summary, Token artifact counts and
consumption state. It requires one deleted link and confirms link absence while
the original artifact/classification remain. Rejection postchecks require no
new Token artifacts and unchanged consumption. Missing state cannot count as
zero or produce a complete report.

The generator pins the original integration hash and replaces only the relevant
reporting branch, retaining the existing strict `denied()` protocol assertions.
It does not edit the original file. The generated JavaScript was checked for
syntax, not executed; embedded SQL has not been validated against PostgreSQL.
This generator is not authorization to execute a full instrumented matrix.

The new projector explicitly retains the branch assertion at either historical
or new stage names and recursively handles driver/matrix reports. Token/Code/
Cookie/identifier values, arbitrary messages, source lines and stacks are not
exported. Historical Code-exchange diagnostics are labeled as such and never
used to fill a missing refresh status. The completeness predicate cannot turn
a failed outer driver or partial evidence into success.

All 147 synthetic checks completed once on host Node v26.11.1. They covered:

- old projection reproduces the lost assertion; new projection preserves it;
- fixture failure, missing Code/RT, zero/multiple DELETE rows and bad readbacks;
- synthetic refresh 400/500, wrong error and returned AT/RT on denial;
- no new Token artifacts and unchanged consumption;
- absent evidence, partial report and earlier failure propagation;
- unknown assertion/body and sensitive sentinel suppression;
- nested projection and JSON roundtrip preserve only approved evidence;
- generated fixture and helper syntax, without app imports or execution.

Synthetic callback failures are expected test cases, not real HTTP requests.
The successful suite is offline report-tool acceptance, not an application
typecheck or live correctness test of the new SQL readback statements.

## Extraction safety and custody

The exporter used the fixed R34 Authorization image only as a Node runtime,
with an explicit `node /harness/r37/extract.mjs` command. Its service main was
not started. Context/image identity, read-only root and both mounts, network=none,
UID1000, dropped capabilities, no-new-privileges, memory/PID bounds and ownership
were checked. No credentials or Docker socket were mounted.

The single exporter stopped exit 0, no OOM. The old matrix remained stopped.
No PostgreSQL, Control or Authorization service was started, no new OAuth,
Refresh, MCP, email or production request was made, and no image was built or
pulled. Source and historical host receipt hashes remained unchanged. No raw
exception, response body or secret was published.

The private output directory and result passed current-user/SYSTEM/admin ACL
checks. The original historical source bytes were not exported; only their
hashes and strict projections were retained in the new receipt:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r37-extract-6kcnE2\result.json
SHA-256: a173956966ee1f0f16bed572498f12192a9f95d93e0e22f7cab5c1f7bdeb04a9
```

## Status and stop

```text
P3E2SR4BR37_REPORT_GAP_CONFIRMED=True
P3E2SR4BR37_EXISTING_EVIDENCE_RECOVERED=True
P3E2SR4BR37_EXACT_R36_ASSERTION_RECOVERED=True
P3E2SR4BR37_SAFE_REPORT_CHAIN_PASS=True
P3E2SR4BR37_EXACT_R36_CAUSE_CONFIRMED=False
P3E2SR4BR37_TARGETED_PROTOCOL_RUN=NOT_RUN
P3E2SR4BR37_SAFE_EXPORT_CLEANUP_PASS=True

P3E2SR4BR34_EXPIRED_SESSION_PROTOCOL_PASS=True
P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4BR36_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after offline recovery and synthetic report validation. The separately
scoped next step is a minimal isolated normal-control/missing-RT-link observation
using the existing candidate and new report fields, not a full matrix rerun or
an application fix based on the unconfirmed `artifact_link_missing` hypothesis.
No automatic retry, candidate rebuild, production operation, push, PR, merge or
deployment followed this extraction.
