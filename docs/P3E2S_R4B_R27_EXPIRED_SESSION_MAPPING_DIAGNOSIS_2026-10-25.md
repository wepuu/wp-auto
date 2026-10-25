# WPAuto P3-E2S-R4B-R27 expired Session mapping diagnosis

## Outcome

The single targeted diagnostic completed and confirmed a missing OAuth error
mapping at the fixed candidate's compiled Code-consumption adapter boundary.
Valid first-use controls returned200 through both A and B. Independent expired
original-Session cases returned500/server_error through both modes, with no
returned or newly stored Token and with Code consumption rolled back/unmodified.
An additional independent Code exercised the actual compiled adapter under the
restricted runtime role: it rejected with the exact known SQL denial, without
conversion to an OAuth invalid_grant error.

This is a diagnostic success, not a protocol pass. Required400/invalid_grant
responses remain unfulfilled. No expiry guard bypass or erroneous Token issuance
was observed in these cases. R24's exact historical internal exception chain was
not captured; R27 establishes the current fixed candidate's mapping defect and
reproduces the same HTTP symptom, not a retroactive trace of R24.

No application, migration, dependency, image or production configuration was
changed. No production host, real WordPress, real email, Desktop credential,
MCP operation or actual user OAuth was accessed. The full37-check matrix,
Refresh, Replay and B-stop-then-A transition were not run.

## Fixed inputs and authorized tooling

Implementation commit: `10efe23e86ff43676e48d7be5cb8012095fb9b33`.
The worktree was clean before the formal invocation. Existing R8/R22 helpers and
driver remained byte-consistent with the R26 baseline `ab29f07`; R24's original
source-freeze gate was neither modified nor invoked as an execution bypass.

Seven new local test/tool files supply the R27 core, bounded service diagnostic
observer, generated scenario, safe projector/exporter, host runner and synthetic
checks. The scenario generator requires the exact R25 integration input hash:

```text
base integration SHA-256:
9ae4dc84533c8d619bb117f158eb68029bbe1324767c8fdd08e2076ef1abbd4f
generated R27 scenario SHA-256:
8dacc918f5e9392fbb7a3f44bf40ee9b8b0dc2d0f57a5872511c3e47a09a68d7
```

The generator reuses the reviewed local Better Auth mock/account/workspace,
signing-key, signed Site Consent, browser/PKCE and compiled-main setup. It
replaces the matrix body with only the targeted cases. The generated file is
mounted read-only over the scenario entry in this disposable container; it
does not edit the repository's R8 scenario or the compiled application.

The existing R6 child collector, IPC envelope, stop path and launch-main remain
in use. A separate R27 helper changes ignored stdout/stderr into two independent
bounded in-memory parsers. Only existing fixed `oauth.grant_failed` event fields
are retained; other output is discarded. It does not add application listeners,
alter request processing or expose raw exceptions.

Fixed revision and artifacts:

```text
revision: c404ed52228ce5492a85674547998d2f5d31772e
Authorization: sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f
Control: sha256:2743e519b43e0d93e182ea0fb5974df49fe1c0cec4abe8283328ad40f1fbff9c
Test: sha256:ecb2b146182ef5ca756c1b5893ecfbf773bd6bd1b43be275670e54eddfda239c
PostgreSQL: postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
compiled files:163
compiled SHA-256:e26eb91d35d7735b97d6ad00a4f0aa87c340e0da221cfef31ee4d2db227d2373
service runtime:Node v24.22.1 / Krypton / linux-amd64 / UID1000
```

Three network-none identity probes checked the existing artifacts; no image
build, pull or package installation occurred. No Control service main started.

## Single targeted run and case evidence

```text
run:r27-20261025005511259
UTC start:2026-10-25T00:55:11.261Z
UTC finish:2026-10-25T00:55:34.580Z
Asia/Shanghai window:2026-10-25 08:55:11 to08:55:34
host monotonic duration:23319ms
inner targeted duration:5405.632ms
targeted attempts:1
authorization requests:5, within8
Token requests:4, exact planned count
distinct fresh Codes:5
distinct original Provider Sessions:5
```

All Codes were issued through B's normal explicit read-only flow. Each browser
carried the synthetic Better Auth account cookie, not a reused Provider Session.
The fixture asserted distinct Code and Session identities before each operation.
Actual native Provider/PKCE processing was used; no hand-made OAuth primitive or
direct artifact insertion substituted for issuance.

| Case | Original Session | Exchange | Observed | Protocol result |
|---|---|---|---|---|
| valid_A | valid | A first use |200, AT and RT present; verified AT binding | PASS |
| valid_B | valid | B first use |200, AT and RT present; verified AT binding | PASS |
| expired_A | expired | A first use |500/server_error; no AT/RT; Code unconsumed | FAIL |
| expired_B | expired | B first use |500/server_error; no AT/RT; Code unconsumed | FAIL |

For each expired case, the update affected exactly one original Session row.
The immediate readback confirmed expiry while Code TTL, unconsumed state,
account, Client Grant and Code/Session linkage remained valid. Each request used
a new Code rather than replaying one already exchanged through the other mode.
The post-response readback confirmed the Code still unconsumed and the stored
AccessToken/RefreshToken counts unchanged. No raw Code, lookup key, Session UID,
Token, verifier, payload or cookie is part of the exported evidence.

Both valid controls consumed their Code and returned synthetically generated
Tokens. The access tokens passed existing jose RS256/issuer/audience validation
and exact scope, Site, Tenant and Grant checks. These tokens were not used for
Refresh, MCP or any follow-up request. Their values were not exported.

The expected old failure was declared before execution:500/server_error without
Tokens or state corruption counts as a reproduced defect, not a reason to
silently stop before the second independent mode. Unexpected issuance, binding
drift, other responses, timeout, permission or tool failures would instead stop
the run without retry. None occurred. The diagnostic's `passed=true` denotes
completion of this predeclared observation protocol; `protocolAssertionsPass`
and `expiredSessionProtocolPass` both remain false.

## Compiled adapter result and causal limit

The fifth independently issued Code and Session were reserved for the direct
compiled-adapter probe, not reused from any HTTP case. Its Session update and
readback used the same strict one-row and binding checks. The actual
`PostgresOidcAdapter('AuthorizationCode', restrictedRuntimeDb, codec).consume`
rejected. In-memory exact matching found SQLSTATE P0001 plus the known
`persistent_grant_denied` message, yielding only this safe projection:

```text
category=PERSISTENT_GRANT_DENIED_SQL
mappedInvalidGrant=False
codeUnconsumed=True
tokenArtifactsUnchanged=True
independentCode=True
runtimeRoleRestricted=True
```

No exception text or stack was exported. The compiled adapter lets this
authorization-denial SQL exception propagate without the OAuth invalid_grant
classification. The transaction rolled back, leaving its Code unconsumed and
Token counts unchanged. Together with independent valid controls, expiry-only
mutation/readback and the two HTTP500 responses, this confirms the candidate
error-mapping gap at the adapter boundary.

The HTTP services' existing diagnostics each emitted only:
`oauth.grant_failed / interaction / unknown`. They contain no SQLSTATE or
request correlation identifier, so the exact HTTP exception object is not
independently traced to the direct probe. The existing source order reviewed in
R25/R26 explains the bridge: the fixed Provider consumes Code before its later
account lookup, while the SQL consumption function validates the original
Session. This is not a claim that these logs identify a specific SQL function
or prove the exact historical R24 internal call chain.

The next separately approved fix should map only the precisely identified
authorization denial at the consumption boundary to the existing reviewed
invalid_grant error. It must not swallow permission, connectivity, timeout,
unknown SQL or infrastructure failures, weaken Session/receipt/binding checks,
or restore consumed artifacts. A new candidate build and focused regression
would follow that source change; the fixed R27 image cannot claim a fix.

## Migration permissions isolation and cleanup

The existing driver explicitly migrated a new disposable database using a
separate synthetic privileged migration identity. Service and direct-probe
connections used the non-admin runtime identity, with no migration secret.
The DDL, ledger-write, migrator-role and direct artifact/classification DML
denial checks passed. The exact16 migration hashes were001–013 plus015–017,
with no014. Actual before/after ledger entries matched; the combined schema,
function-definition/ACL and relation ACL/RLS fingerprint also matched:

```text
581085a6987b2a72c6b6877a1f5d357b18558af921e7cb9bf51a58eeb89023b5
```

Both the target business Grant and the separate protected synthetic Site/Grant
full-row snapshots remained unchanged. No real Site A, production Grant or
Outbox was accessed. This is not a full database/Console regression rerun.

The Docker network was internal and no host ports were published. The scenario
used UID1000, read-only roots, dropped capabilities, no-new-privileges, private
tmpfs and the existing loopback-only process API egress guard. Only the narrow
seeder used root+CHOWN. Identity probes and the exporter had network=none. This
does not claim that the JavaScript API guard is an OS-wide sandbox.

Both A and B had one readiness200 check, complete accepted child snapshots,
exit0 and no forced termination. No deadline or safe-log limit was exceeded.
All seven owned containers stopped with exit0 and no OOM: three image probes,
seeder, targeted driver, PG and safe exporter. The following stopped resources
were retained, not pruned:

```text
wepuu-r27-20261025005511259-net
wepuu-r27-20261025005511259-data
wepuu-r27-20261025005511259-evidence
```

All four disk observations were5812551680bytes free, exceeding the5GiB initial
and2GiB ongoing limits. Recorded inputs and the generated scenario hash remained
unchanged. The private host directory/secret files/result ACLs were verified for
the current user, SYSTEM and administrators. The safe result is:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-r27-targeted-otCDns\result.json
SHA-256:6fd1b4468ffee65718e6745d489a48c9469ed7ae1d5b73759b02741d8891e621
```

Secrets stayed in private local files/tmpfs/volumes. The safe exporter used a
read-only evidence mount and fixed projections; raw service output was parsed
in bounded memory and discarded. No production content entered the platform.

## Offline validation status and stop

Before any Docker invocation,112 pure/helper checks passed once, including
generated-scenario syntax via a syntax-only child Node process. They covered
response categorization, no-Token failures, A/B independence/state requirements,
fixed SQL classification versus permission/connectivity errors, bounded log
filtering, missing/partial report rejection, preservation of failure assertions,
ledger/schema/privilege/child gates, source hash mismatch and sensitive sentinel
filtering. Host Node was v26.11.1; service identity was separately fixed above.
Runner/service syntax and `git diff --check` passed. No Hosted CI, whole-app
lint/typecheck, migration014, full37/17 matrix or real Desktop result is claimed.

```text
P3E2SR4BR27_TARGETED_DIAGNOSTIC_COMPLETE=True
P3E2SR4BR27_ERROR_MAPPING_CAUSE_CONFIRMED=True
P3E2SR4BR27_EXPIRED_SESSION_PROTOCOL_PASS=False
P3E2SR4BR27_CLEANUP_PASS=True
P3E2SR4BR27_EXACT_HISTORICAL_R24_CAUSE_CONFIRMED=False

P3E2SR4BR24_AB_MATRIX_PASS=False
P3E2SR4BR24_B_STOP_A_TRANSITION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The cause flag is scoped to the confirmed fixed-candidate adapter mapping gap,
not an independently captured historical R24 exception. Stop after this record.
No application repair, second diagnostic attempt, push, PR, merge, image
publication or deployment was performed.
