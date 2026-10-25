# WPAuto P3-E2S-R4B-R41 fixed candidate A B acceptance

## Result

R41 passed one complete isolated matrix with37 of37 frozen checks, followed by
one independent B-stop/A-takeover scenario with17 of17 checks. Both used the
exact R40 candidate, different fresh databases and unchanged protocol acceptance
conditions. The matrix exited normally before the transition was permitted.

The missing-RT-link branch returned400 invalid_grant without Tokens or original
RT consumption. The later account-isolation, withdrawal, Refresh Replay,
expired Better Auth Session and protection checks also passed. The transition
preserved preissued Code/RT use and authorization lifetime, closed new
persistent consent in A and retained replay revocation behavior.

This accepts this fixed candidate's isolated A/B matrix and transition. It does
not establish a production deployment, real Desktop account-switch recovery,
full repository regression or general release readiness. R36 and R38 remain
historical failed attempts; their statuses and records were not overwritten.

## Fixed candidate and source

```text
R41 tool commit:9ed2efe5f8039e5f483e81c9807bb658066fa6f0
R40 image revision:2ab57076511732fb2b2fbb1c50a03ee6c59ece4d
Authorization:sha256:a5062dbc9f3fb52b9eeecd6ba5d8273cc5ac223a09fa3c07d632f48356a7eaaa
Control:sha256:93577d94ba77b0f1f6c5350ef29b8f8809e67c5dabb1b5589b16bd104d0ed937
Test:sha256:f22b9a507d6d713f678fe5d35a6c83b9324572503c1dbba28cd0433f5348d7c9
compiled fingerprint:6179918471d90689ce8693ee1423488bfcb1fcd48b357ac01a8c7963cb86b35d
compiled files:163
runtime:Node v24.22.1/Krypton, UID1000
```

The R40 build receipt hash matched
a822a61661024af9d3f05bcdebadba223b7cb3133acb2a95ba348ba03c65a619.
Its private ACL, normal-file status, exact candidate IDs/revision, artifact
linkage, common compiled fingerprint and recorded R39 patch probes passed the
candidate gate. Fresh read-only probes verified the same actual loaded image
identities and fingerprint. No image build, pull, dependency install or old-image
fallback occurred. Control was identity-probed, not started as a service.

Application/package/dependency/migration/deployment inputs were unchanged from
the approved R39 source. The manifest remained
dde36cc57b4b1a7de3b433cb13e68d846e889d4a1555ea135aa9670d8c7cb641.
Only independent R41 runner, contracts, diagnostic generator and report helpers
were added; frozen R8/R22 and historical execution tools were not edited.

## Offline validation and instrumentation

The complete helper suite passed189 synthetic checks before Docker execution.
It verified exact expected check-name sets and uniqueness, failure/timeout/
nonzero-exit propagation, no transition after matrix failure or unconfirmed
shutdown, fixed image/receipt rejection, source drift, missing RT state,
safe nested projection and generated syntax. The37 matrix and17 transition
name definitions still match the accepted historical definitions, not merely
their counts. These helper tests made no application or protocol calls.

Generated fixtures retain the full bodies and protocol assertions. The
missing-link branch uses the R38 failure-readback wrapper and requires one
deleted row, link absence, preserved artifact/classification and unchanged
Token counts/consumption. Fixed response summaries label Code exchange and
Refresh separately and retain status before JSON interpretation. Arbitrary
response content and errors are not projected. The existing bounded lifecycle
observer supplies safe logs and shutdown evidence.

The generated driver preserves schema/ledger readbacks for returned failed
scenario reports; a failed inner scenario remains failed. No check is removed
or500 accepted as a valid authorization rejection. Generated input hashes:

```text
matrix:e7d9aaa22ea68c8a1dbab21a4a1560fdabc26f7f7bbaafd6aa9c0ce245756b8b
transition:2d0c4b05de5b8b7785ea85be9fcc61342e7b01db2e1380a09ad09cef1eff65eb
driver:9e290bd3e4c88fb5e8aa9c68a84cb222ca094e649d7f18ee084094f5b7ec93f8
```

## Single execution and independent databases

```text
run:r41-20261025113030374
UTC start:2026-10-25T11:30:30.376Z
UTC finish:2026-10-25T11:31:19.263Z
Asia/Shanghai:2026-10-25 19:30:30 to19:31:19
selected steps:matrix then transition
automatic retries:0
```

| Phase | Attempts | Checks passed | Auth requests | Token requests | Inner duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full matrix |1 |37/37 |20 |24 |9421.109 ms |
| B-stop/A transition |1 |17/17 |4 |5 |4780.023 ms |

Each phase remained within its original20-auth/30-token budget,240-second inner
deadline and300-second outer deadline. Readiness checks are separate from those
protocol counters. No budget was increased to finish acceptance.

The matrix driver completed at11:31:04.100Z and its container was confirmed
stopped exit0 at11:31:04.326Z. Only then did the transition start, at
11:31:04.787Z. It completed at11:31:14.179Z and stopped at11:31:14.418Z.

The two scenario database identity hashes differ:

```text
matrix:2050330260499ac7b58a0ac96a258e8479a3f301f5e49f371239f68565f65c1d
transition:73e2eb6fed5914e5d51e9d6e6b03bf0823ff3273ea39d8e0a9131240674bd3bb
```

They were newly created in a run-owned PostgreSQL instance, not restored or
reused from R38/R40. Each explicitly applied the16 candidate migrations001–013
and015–017, without014. Separate migration/runtime identities and denial of
runtime DDL, ledger writes and privilege escalation passed. Application
startup did not invoke migrations. Each database's ledger and schema remained
unchanged; fingerprints are compared within, not across, databases:

```text
matrix before/after:710c3ebbce88a496e009cb8849a4909c16e11ad612916cb5e7f8278215d4e51a
transition before/after:8e2594c085568608ecea6316b0fd8b30b117fbd5d17cb8662786239f9826d829
```

## Acceptance coverage

The matrix covered actual local Better Auth mock-OTP login and account mapping,
signed synthetic Site proofs including invalid signature/claim cases, guarded
native/persistent authorization, CSRF/Origin/binding/choice rejection, receipt/
Provider/Code save-failure injection, duplicate consent, cross-mode Code/RT use,
expired/deleted/mismatched original Provider Session, native PKCE/redirect/
resource checks, membership denial and receipt-version constraints.

The missing-link readbacks confirmed one link before deletion and zero after,
one preserved RT artifact/classification throughout, stored RT count4 throughout,
stored AT artifact count0 throughout and original consumed count0 throughout.
The response was400 invalid_grant with no AT/RT fields. AT persistence counts
are not a count of JWT Access Tokens issued by the whole matrix.

The remaining checks verified that a second synthetic account cannot reuse the
first account's Grant, withdrawn receipts reject RT use, replay revokes the
Grant/successor and creates one expected local Outbox event, expired Better Auth
Sessions cannot enter consent, and the protected Site Grant remains unchanged.
This is the frozen isolation coverage, not a full production cross-Tenant or
real WordPress acceptance claim. Expected synthetic target revocation and new
Outbox records were allowed; no external Outbox delivery was attempted.

In the independent transition B issued artifacts, stopped normally before A
started, and A accepted the guarded preissued Code/RT without extending receipt
lifetime. A denied new persistent consent, retained replay/successor denial and
kept the protected Grant unchanged. Both transition service log projections were
empty and bounded. Matrix B recorded grant.save_failed and two unknown events
during its accepted negative-path fixture run; no stream overflow occurred.

## Cleanup, data boundary and evidence

All four observed A/B service lifecycles across the two phases passed: each
became ready once, returned the lifecycle snapshot and exited0 without forced
termination or deadline expiry. All eight owned containers stopped exit0 with
OOM=false: three identity probes, seed, matrix, transition, PostgreSQL and export.

The network was internal with no published host ports. The database, accounts,
keys, Sessions, Client and Grants were synthetic. Mock email counts were two
for the matrix and one for the transition, not real mail deliveries. Signed
Site approval was the existing Grant-service fixture, not a WordPress request.
No production host, Desktop, Credential Store, real OTP, OAuth account or MCP
tool was accessed. No WordPress content entered the control-plane test paths.

Four safe reports were exported through a read-only evidence-volume mount and
network-none exporter. Private Windows ACL checks and unchanged input/generated
hashes passed. No Code, verifier, Token, Cookie, raw response/exception, SQL
parameters or real user information was exported.

```text
receipt:C:\Users\liulo\AppData\Local\Temp\wepuu-r41-ab-jdD94n\result.json
SHA-256:d827b1d3d67dbdc692ea504316da6528d969adb0b8cc58b9cc9e99f4ed80b951
```

Initial5 GiB and ongoing2 GiB host-space gates remained unchanged; recorded
free space was5806354432 bytes. No global cleanup or historical resource deletion
ran. Stopped containers, evidence and these run-owned resources were retained:

```text
wepuu-r41-20261025113030374-net
wepuu-r41-20261025113030374-data
wepuu-r41-20261025113030374-evidence
```

## Status and stop

```text
P3E2SR4BR41_CANDIDATE_IDENTITY_PASS=True
P3E2SR4BR41_FULL_MATRIX_PASS=True
P3E2SR4BR41_B_STOP_A_TRANSITION_PASS=True
P3E2SR4BR41_POSTCHECK_PASS=True
P3E2SR4BR41_CLEANUP_PASS=True
P3E2SR4BR41_AB_VALIDATION_PASS=True

P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R41 ends at fixed-candidate isolated A/B acceptance. The broader database,
Console and startup regression suites were not rerun here; R30's broader test
typecheck history is not cleared by this result. No overall candidate readiness
decision, push, PR, merge, production deployment or Desktop operation followed.
The next task should reconcile remaining candidate acceptance gates against the
collected evidence before proposing any deployment or user-facing verification.
