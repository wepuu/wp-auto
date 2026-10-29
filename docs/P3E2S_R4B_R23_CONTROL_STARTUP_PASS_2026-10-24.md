# WPAuto P3-E2S-R4B-R23 Control fixture repair and startup pass

## Result and boundary

R23 PASSED. The corrected Control fixture completed one isolated scenario with
two planned normal start/stop cycles. Both returned readiness200, then exited0
after SIGTERM, with no termination signal or lifecycle error. The actual16-entry
candidate ledger and schema/function/ACL/RLS fingerprint were unchanged.

This closes the Control startup gate for the fixed local candidate. The complete
A/B matrix and B-stop-then-A transition remain NOT_RUN. R21 database/Console and
R22 Authorization results remain historical passes, not new executions. R22's
Control failure remains unchanged. Production, Desktop, WordPress, MCP and real
mail delivery were not accessed; application source, SQL, dependencies, images
and production configuration were not modified.

Implementation commit: `da6c151b7e4e7d80710517a4bfd20a422208a06c`.

## Confirmed fixture defects

The old Control fixture started its compiled main with `NODE_ENV=production`,
`WEPUU_EMAIL_DELIVERY=mock` and the writer account-auth role. The fixed candidate
explicitly rejects that combination with `production_email_delivery_required`.
The fixture also omitted the required writer OTP quota HMAC file. R23's
network-disabled probe called the actual compiled `accountAuthFromEnvironment`
and verified rejection of production+mock, missing quota file and invalid quota
key. These are project safeguards, not Better Auth's requirement to use Resend;
the [Better Auth OTP interface](https://better-auth.com/docs/plugins/email-otp)
delegates delivery to `sendVerificationOTP`.

The old fixture discarded stderr, captured only the `close` code (not signal),
asserted clean exit inside `finally`, and appended the run record only after
those assertions. Consequently startup failures could be masked by
`CONTROL_MAIN_EXIT`, with no failed-cycle evidence. Node's
[close event](https://nodejs.org/download/release/latest-v24.x/docs/api/child_process.html#event-close)
reports code and signal separately. A `finally` failure can replace the primary
failure under [JavaScript completion semantics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch#the_finally_block).

The actual compiled initializer confirms the old configuration was invalid; the
corrected fixture succeeds without changing the application. R22 did not retain
the original child stderr/exit signal, so this is not a recovered transcript of
R22's precise runtime exception. There is no evidence here requiring a Control
shutdown implementation change or any OAuth relaxation.

## Minimal test changes

Seven test/tooling files changed in the implementation commit:

- The Control fixture now supplies production-compatible delivery configuration,
  synthetic fake API-key and fresh quota-HMAC files, and explicit send=false.
- `r23/control-lifecycle.mjs` records readiness, exit/close, code/signal, requested
  stopping, primary startup failure and secondary cleanup failure independently.
  Every completed/failed cycle is retained before the assertion. Clean exit0,
  no signal, readiness200 and observed stopping remain mandatory.
- The child uses the existing egress preload and scoped context. stdout/stderr
  are drained under a65536-byte budget; only fixed startup categories survive.
  Unknown raw text and exception bodies are discarded, not saved.
- `r23/contract-probe.mjs` checks the actual compiled initializer negatives,
  protected files and Resend sender construction without starting a service or
  connecting to a database. The probe observed zero calls to its denying fetch.
- The R22 runner gained a dedicated control-only mode, invoked solely by
  `scripts/run-r23-control.mjs`. The existing ownership, immutable image, compiled
  identity, disk, private-evidence and single-attempt boundaries remain in force.
- The fixed report projection gained safe lifecycle fields; R23 additionally
  rejects any absent or unsuccessful lifecycle field.
- `scripts/r23-control.synthetic.mjs` exercises the wiring without real services.

The production-mode child uses `WEPUU_EMAIL_DELIVERY=resend` only to satisfy its
existing initializer. The API key is fake, the sender address is synthetic,
`WEPUU_EMAIL_OTP_SEND_ENABLED=false`, and no send/login endpoint is exercised by
that child. The fixture's separate local Better Auth setup retains its mock OTP
flow. No real email credential is loaded and no OTP is delivered externally.

The quota/API-key files are UID1000-owned,0600 and private-tmpfs scoped. Runtime
and explicit migration credentials remain separate. The synthetic migrator is
privileged only within the disposable cluster, not a production least-privilege
migration design.

## Offline validation

After correcting a syntax typo during development of the new pure test,
all74 R23 checks passed before the formal invocation. Coverage includes correct
production/send-off configuration; split-chunk error classification; unknown
error suppression; missing executable/permission errors; output budget; readiness
failure; nonzero exit; signal termination; stop timeout; primary failure retention;
strict report fields; ledgers/schema; and unchanged non-Control R8 scenarios.

JavaScript syntax and `git diff --check` passed. No whole-repository lint,
typecheck, R22 replay or hosted CI is claimed. The fixed Node24 contract probe
subsequently passed its actual initializer rejection and construction checks.

## Single formal invocation

```text
run: r23-20261024144050086
UTC start: 2026-10-24T14:40:50.088Z
UTC finish: 2026-10-24T14:41:19.090Z
operator local window: 2026-10-24 22:40:50 to22:41:19 Asia/Shanghai
Control scenario attempts:1
scenario duration:9429ms
planned normal start/stop cycles:2
automatic retries:0
```

| Gate | Result |
|---|---|
| Three fixed-image compiled identities | PASS |
| Actual production+mock rejection | PASS |
| Actual missing/invalid quota-key rejection | PASS |
| Resend sender construction fetch calls |0 |
| Probe protected file ownership and permissions | PASS |
| Missing schema rejection without automatic migration | PASS, exact42P01 |
| Explicit migration identity separate from runtime | PASS |
| Tested runtime DDL/ledger/escalation/direct-DML denial | PASS |
| Missing ledger SELECT rejection without repair | PASS, exact42501 |
| Pre/post candidate ledger | PASS,16 entries,001–013 and015–017, no014 |
| Pre/post schema/functions/permissions fingerprint | PASS |
| Safe evidence export and save | PASS |
| Frozen input hashes and clean working tree at finish | PASS |

| Cycle | Readiness | Stop requested and delivered | Exit | Signal | Elapsed |
|---|---|---|---|---|---|
|1 |200 | yes |0 | null |1735ms |
|2 |200 | yes |0 | null |1592ms |

Both cycles observed `exit` and `close`, had no startup/cleanup/spawn errors or
output limit, and produced zero stdout/stderr bytes. The readiness loop has a
10-second bound and stopping retains the6-second bound; forced cleanup, if
required, would remain a failure, never a passing substitute.

The full pre/post actual ledger matches current migration source. Equal schema
fingerprints are:

```text
12e6f6cb60a1863844f893050c4d111a52cbf1e0a5d5e642ffdbf2b4c814dda3
```

This fingerprint is compared within this database only, not against another
run's randomly created role identities. It includes relations, functions,
function definitions/ACLs, relation ACLs and RLS metadata.

## Fixed artifacts and isolation

```text
image revision: c404ed52228ce5492a85674547998d2f5d31772e
Authorization: sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f
Control: sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c
Test: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
runtime: Node v24.22.1 / Krypton / UID1000 / linux-amd64
compiled files:163
compiled SHA-256:e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
```

Existing images only, pull disabled, no rebuild or install. Compiled and contract
probes used network=none. The fresh PG network was internal, without host ports.
Service processes used a read-only root, dropped capabilities, no-new-privileges,
private tmpfs and the existing test-process API network guard. That guard is not
claimed as an OS-wide sandbox. Only the narrow evidence seeder used root+CHOWN.

D free space was5849153536 bytes at both initial and final samples, above the
5GiB initial and2GiB ongoing thresholds. No cleanup/compaction was performed.

## Custody and cleanup

```text
private receipt:
C:\Users\liulo\AppData\Local\Temp\wepuu-r23-control-Z38xNa\result.json
SHA-256:dfc40d331e04164cc11084aef12ac6b3dcf315f196e12bc0c6f0a30cf54c01ab
```

The evidence ACL is restricted to the current user, SYSTEM and administrators.
The private host files/volume are not publication artifacts. Two projected safe
reports were exported. No raw exception, key, DSN, OTP, Cookie or token is in
this record.

All eight owned containers stopped with exit0, matching labels and no OOM:
three image probes, contract probe, evidence seeder, Control scenario, PG and
safe exporter. No unrelated resource was changed. The stopped containers and
following resources remain retained, not removed:

```text
network: wepuu-r23-20261024144050086-net
data volume: wepuu-r23-20261024144050086-data
evidence volume: wepuu-r23-20261024144050086-evidence
```

## State and next boundary

```text
P3E2SR4BR23_FIXTURE_CONTRACT_PASS=True
P3E2SR4BR23_EXIT_EVIDENCE_COMPLETE=True
P3E2SR4BR23_CONTROL_STARTUP_PASS=True
P3E2SR4BR23_NO_AUTO_MIGRATION_PASS=True
P3E2SR4BR23_CLEANUP_PASS=True

P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here. The next separately authorized step is the existing full local A/B
matrix followed by B-stop-then-A transition, with the same fixed candidate,
strict assertions and one-attempt/fail-stop policy. Do not repeat the passed
database or startup gates as new acceptance. No deployment or real Desktop
account-switching claim follows from this local Control result.
