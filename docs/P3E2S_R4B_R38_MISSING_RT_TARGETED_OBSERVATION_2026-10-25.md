# WPAuto P3-E2S-R4B-R38 missing RT link targeted observation

## Result

The normal B Code exchange and A Refresh control passed. A separate fresh
authorization then produced a Refresh Token with exactly one persistent link.
Deleting exactly that link and refreshing once through A returned HTTP 500
`server_error`, not the required HTTP 400 `invalid_grant`.

The failed response contained neither an Access Token nor a Refresh Token.
The bounded failure readback confirmed unchanged Token artifact counts and an
unconsumed original RT. Its original artifact and classification remained, while
the link was absent. This is a confirmed error-response mismatch, not observed
token issuance or a native-path fallback success. The underlying exception is
not identified by the available service event.

Diagnostic collection completed, but protocol acceptance failed. No application
repair or automatic retry followed. R36's historical response remains unrecorded;
R38's 500 must not be retroactively inserted into that older report.

## Scope and fixed inputs

```text
implementation: b0f1bf9a3ff0bdbfa13c36fcb68372186a091f4e
run: r38-20261025103803698
UTC start: 2026-10-25T10:38:03.699Z
UTC finish: 2026-10-25T10:38:30.929Z
Asia/Shanghai: 2026-10-25 18:38:03 to 18:38:30
host monotonic duration: 27229 ms
inner scenario monotonic duration: 5324.697 ms
targeted attempts: 1
authorization flows: 2
token requests: 4, comprising two Code exchanges and two Refreshes
```

The R34 fixed images were used without build, pull or dependency installation:

```text
revision: 1df4c857e667398ac71487f352fc3daa7ddbac8a
Authorization: sha256:e4212dd53144d8006a431b027da85266e9f7d0bd7a7431a68701b73367fd14bb
Control: sha256:8c5c30e26f4b005d29a2e23819613ea9ccfeca96c09ad48840d312e61aacb22d
Test: sha256:0fea6c08b7130b17e50adc8f96602b48ae0ee58afbd2039465953eb36eb99ca9
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
compiled fingerprint: 260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691
compiled files: 163
runtime: Node v24.22.1, Krypton, UID 1000
```

Control and Test images were used for identity/seed utilities, not a Control
application startup. Authorization modes A and B used the existing compiled
entrypoint and reviewed lifecycle fixture. Local Better Auth used Mock OTP and
a fresh synthetic account; no real email, production login or Desktop OAuth ran.

The network was internal, with no published host ports. New, run-owned data and
evidence volumes were used, not R36's database or evidence. Runtime privilege
separation passed. Explicit migration installed 001–013 and 015–017, without014.
The exact ledger and schema were unchanged after both scenarios, including
after the protocol failure. Schema fingerprint:

```text
f5b174dca8cc267b19c99db9023dec2336b6bbb605a1028a8fce90816c36ea3b
```

## Tool changes and offline checks

Only six independent R38 helper/runner files were added. Application, migration,
dependency, frozen R8 integration and historical R22/R37 files were unchanged.

The new scenario generator retains reviewed setup and shutdown code but replaces
the historical matrix body with exactly a normal Refresh and a missing-link
case. The driver still uses its `matrix` routing label to launch the mounted
minimal scenario; that label does not mean the full matrix was executed. The
R37 full-matrix reporting generator was not run.

Before protocol execution, 113 offline synthetic and syntax checks passed. They
covered 400/500 and other status summaries, zero/multiple DELETE rows, invalid
state, missing JSON, returned Token fields, failure readback, original-failure
priority, nested safe projection, strict failure propagation, generated source
syntax and removal of full-matrix branches. No Docker, database or application
was started by those checks.

The R37 helper previously stopped before postcheck when `denied()` failed. The
R38 wrapper performs one bounded readback on that failure and retains the
original assertion. A readback failure is separately classified and cannot
promote a failure to success. The generated driver also checks schema and ledger
after a returned failed scenario instead of discarding those postchecks.

The actual state-read SQL was validated against the new migrated database before
either authorization flow. Generated inputs were separately hashed:

```text
scenario: 40be549393cd3daff5dba57d62f505070c8f39e94ed676da4e45fdb024e661f0
driver: 9e290bd3e4c88fb5e8aa9c68a84cb222ca094e649d7f18ee084094f5b7ec93f8
```

## Two scenario observations

### Normal Refresh control passed

B issued one independent Code and exchanged it successfully. A refreshed the
resulting RT successfully, returning AT and a different RT. JWT verification
checked issuer, exact resource audience, scope `mcp:read`, Site, Tenant and
business Grant. The old RT became consumed; the new RT was unconsumed and had
one link, artifact and classification. Its classification remained
`PERSISTENT_READONLY`, with the expected additional RT artifact.

### Missing RT link returned server error

The second flow used a different Code and Provider Session. Its B exchange
returned 200 with AT/RT. The isolated administrator deleted only the exact
current lookup's `RefreshToken` link, affecting one row. Application processes
retained their restricted database roles.

| State | Before deletion | After deletion | After failed Refresh |
| --- | ---: | ---: | ---: |
| Matching RT links | 1 | 0 | 0 |
| Matching original RT artifacts | 1 | 1 | 1 |
| Matching RT classifications | 1 | 1 | 1 |
| Stored AT artifacts | 0 | 0 | 0 |
| Stored RT artifacts | 3 | 3 | 3 |
| Original RT consumed count | 0 | 0 | 0 |

The AT artifact count is a persistence observation, not a count of JWT Access
Tokens issued throughout the test. The normal successful responses contained
ATs even though this model stored no AT artifact.

```text
stage: missing_rt_refresh
category: ASSERTION_FAILED
assertion: DENIED_STATUS
HTTP status: 500
OAuth error: server_error
response JSON parsed: true
AT field present: false
RT field present: false
failure readback: PASS
```

All synthetic business Grant rows and the existing Outbox snapshot were
unchanged. A's bounded existing log projection recorded
`oauth.grant_failed / interaction / unknown`; B had no matching projected event.
Neither stream overflowed. That `unknown` is an actual observed category, not a
substitute for a missing exception. It does not identify SQLSTATE or prove the
static `artifact_link_missing` hypothesis. No direct adapter probe or extra
Refresh was added to obtain that information.

## Exit evidence and custody

A and B each became ready once, returned the expected lifecycle snapshot and
stopped normally with exit 0, without forced termination or deadline expiry.
All seven owned Docker containers stopped without OOM. The targeted driver
exited 1 because the protocol assertion failed; the three identity probes,
seed, PostgreSQL and exporter exited 0. Cleanup completion does not change the
failed protocol verdict.

Only whitelist projections were exported through a read-only evidence-volume
mount with network none. Local evidence passed private Windows ACL checks.
No raw response, exception text, identifiers, Cookie, Code or Token was exported.
Inputs and the clean source tree remained unchanged during the run.

```text
receipt: C:\Users\liulo\AppData\Local\Temp\wepuu-r38-targeted-qU9duJ\result.json
SHA-256: 7748a4e1bb960ae988fab75c2f64c5aece634e836cd7a515124d555dcf56bd4c
```

Stopped containers and the following run-owned resources were retained for
separately authorized evidence handling; no prune or historical cleanup ran:

```text
wepuu-r38-20261025103803698-net
wepuu-r38-20261025103803698-data
wepuu-r38-20261025103803698-evidence
```

## Status and stop

```text
P3E2SR4BR38_DIAGNOSTIC_COMPLETE=True
P3E2SR4BR38_NORMAL_REFRESH_CONTROL_PASS=True
P3E2SR4BR38_MISSING_RT_DENIAL_PASS=False
P3E2SR4BR38_FAILURE_CAUSE_CONFIRMED=False
P3E2SR4BR38_CLEANUP_PASS=True

P3E2SR4BR36_AB_MATRIX_PASS=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

R38 ends at this confirmed 500/no-Token response mismatch. The next separately
scoped task is to identify the exact adapter/exception mapping branch offline,
using the fixed dependency source and narrowly permitted tests before proposing
a repair. Do not map all PostgreSQL errors or all P0001 errors to invalid_grant.
No further protocol attempt, full matrix, application change, candidate build,
production operation, push, PR, merge or deployment followed this run.
