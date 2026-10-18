# P3-E1K: identity-recovery preflight blocked by unavailable Session

Date: 2026-10-18, Asia/Shanghai. **Phase-one preflight is BLOCKED; phase two
was NOT_RUN.** The new site's local identity was not deleted, no new backup
was created and no pairing was attempted.

## Authority and evidence source

The operator authorized phase one of E1K: read-only reconciliation and, only
after all gates pass, protected WordPress-host backup. Identity deletion and
one new pairing require a later explicit confirmation. Previous E1D authority
does not authorize those actions in E1K.

Target: https://www.wepuu.com, exact resource
https://www.wepuu.com/wp-json/wp-auto/mcp, WordPress host 148.135.106.145.
The account is the original P3-D5 new account and its original Home Tenant,
not the protected Site A test account.

The assistant successfully used the existing authenticated SSH path to the
platform host 5.255.99.225. To avoid unnecessary host checks or backup work
when login is unavailable, the first business gate was the inexpensive
account/Home-Tenant/owner/Session query. No WordPress SSH connection was made.

## Actual read-only query

Platform observation time: **2026-10-18T12:40:38.596297Z**, or
**2026-10-18 20:40:38.596297 Asia/Shanghai**. This is the platform-reported
time, not a new independent UTC accuracy measurement.

The query ran through existing PostgreSQL psql in the production container
with `default_transaction_read_only=on`, a 10-second statement timeout and
a 20-second subprocess timeout. It selected only computed booleans and
the valid-Session count. Authentication tokens, Session IDs, email addresses,
database credentials and raw identity records were not selected for output.

Full account and Home Tenant identifiers were matched inside the protected
query against the accepted E1D/P3-D5 baseline; short hashes were not used as
the authorization selector. A Session counted as valid only when its user
matched that account's Better Auth link and `expiresAt > clock_timestamp()`.

| Gate | Directly observed result | Status |
| --- | --- | --- |
| Intended account matches | True | PASS |
| Original Home Tenant matches | True | PASS |
| Account / Tenant active | True / True | PASS |
| Email verified | True | PASS |
| Active owner membership | True | PASS |
| Unexpired Session count for this account | **0** | FAIL: login prerequisite unavailable |
| Identity of the current browser | Not inspected; no valid Session exists in this snapshot | NOT_CONFIRMED |

Structured outcome: `e1k_preflight_blocked`, stage `account_session`, category
`NO_VALID_SESSION_STOP_BEFORE_BACKUP`. This establishes a current login gate
failure, not an OAuth, pairing, NTP or account-ownership failure. It does not
identify why prior Sessions expired or became unavailable.

The SSH shell also emitted a trailing carriage-return command warning after
the complete structured query result, yielding a nonzero outer command exit.
It was a text-transport issue after the query, not evidence that the Session
query passed the login gate. No command retry was made and no overall command
success is claimed. Future helpers must send LF-only bytes rather than rely
on PowerShell text-pipeline newline conversion.

## Required stop and unexecuted work

The approved plan requires stopping when Session is unavailable. Therefore:

| Remaining phase-one / phase-two item | Result |
| --- | --- |
| Fresh five-service, image, resource-pressure and migration reconciliation | NOT_RUN after account gate stop |
| Fresh application send-switch / Nginx guard verification | NOT_RUN after account gate stop |
| Fresh WordPress timesyncd/log checks and five bracket samples | NOT_RUN after account gate stop |
| Fresh WordPress connection, identity, pending and revocation readback | NOT_RUN |
| Complete all-status resource / Site-ID / public-key dependency search | NOT_RUN |
| Fresh Site A, Codex Grant, Site B and historical Outbox comparison | NOT_RUN |
| New protected WordPress database / Connector backup | NOT_RUN, not a backup failure |
| Identity deletion confirmation requested or obtained in E1K | NOT_RUN |
| Enable / Connect / Disconnect, Proof, OAuth or MCP | NOT_RUN |
| Email enabling / sending, time-source changes, restart, deployment or migration | NOT_RUN |

The helper's `emailSendingEnabled=false` field records that it did not enable
sending; it is **not** a fresh observation of the production send switch.
Historical OTP pause and production protections are carried forward, not
promoted to newly verified E1K results. No new backup path/hash exists for E1K.

The E1I repair and the operator's immediate 20:33:22 Asia/Shanghai recheck
remain separate evidence: synchronized yes, source 64.69.34.90, offset
-2.182 ms, root distance 34.064 ms, packet count 7. E1K did not repeat or
supersede those measurements. See [Draft PR #82](https://github.com/wepuu/wp-auto/pull/82).
The E1D failed pairing remains in [Draft PR #77](https://github.com/wepuu/wp-auto/pull/77).

## Resume prerequisites and identity impact

Stop here; do not open OTP sending under this authorization. If the operator
wishes to restore login, it needs a separately authorized bounded login-recovery
procedure for the **same existing P3-D5 account**, preserving sending safeguards
and with no new account/tenant or implicit pairing authority.

After login is restored, rerun phase one with fresh current-browser/account
confirmation, production/clock/dependency gates and a new protected backup.
Do not treat this partial pass as permission to skip any remaining check.

Only after complete phase-one success may the operator separately approve
deletion of the then-verified local identity. Normal Disconnect deletes local
pending, connection and identity but can leave the old revocation Option.
Enable does not restore that identity. A later normal Proof handler generates
a new identity and initializes its revocation binding before the platform
finally accepts, so another failure may again leave local active state.
No automatic identity reset, backup restore, partial-state cleanup or retry
is authorized by this record.

## Repository validation and state

This is a single-document Draft candidate based on main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. No app code, dependency, API/schema,
Connector, protocol check or historical record is modified. No WordPress content
enters the platform and no tool call is proxied. No new production Proof,
negative OAuth or email test was run. Local diff checks and actual hosted CI
are reported separately; CI cannot establish missing production evidence.
Existing dirty files and design/ remain untouched. Do not merge automatically.

```text
P3E1K_PREFLIGHT_PASS=False
P3E1K_LOCAL_BACKUP_VERIFIED=False
P3E1K_IDENTITY_RESET_PERFORMED=False
P3E1K_NEW_PAIRING_ATTEMPT_PERFORMED=False

P3E1I_WORDPRESS_TIME_SYNC_REPAIR_PASS=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

`P3E1K_LOCAL_BACKUP_VERIFIED=False` means NOT_RUN due to the earlier gate,
not a corrupt or failed backup. No additional production action follows.
