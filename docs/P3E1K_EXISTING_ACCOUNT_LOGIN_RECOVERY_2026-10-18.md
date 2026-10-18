# P3-E1K: separately authorized existing-account login recovery

Date: 2026-10-18, Asia/Shanghai. **The existing P3-D5 account login was
restored; both sending protections were restored and verified.** This is not
a completed identity-recovery preflight or a successful WordPress pairing.

## Separate authority and earlier stop

The initial E1K preflight stopped at zero valid Sessions, as retained without
modification in `P3E1K_PAIRING_PREFLIGHT_SESSION_BLOCKED_2026-10-18.md`.
The operator then explicitly authorized recovery of the **original P3-D5
account** and confirmed browser/email readiness. This separate authority
covered one normal OTP send, the bounded window, same-image Control recreates
and restoration. It did not authorize a new account, identity deletion or pairing.

The operator used the same account email and personally read/entered the OTP.
The assistant did not access inbox contents, OTP, Cookie, Session token, full
email address, HMAC secret or Resend key. No second send was made.

## Protected preparation

Direct platform SSH checks passed before opening: five healthy services,
the accepted Control and Authorization digests, actual/persisted send=false,
unchanged 3/hour and 6/day recipient limits and 100/day global limit, matching
HMAC custody and read-only mount, full historical Site/Grant/Outbox/migration
baseline and Site A Connector, guard hash, zero new OOM and suitable resources.
Pre-window budget was 100; the target account was owner but had no valid Session.

Fixed images remained:

```text
Control:
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization:
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

Protected platform-host configuration/snapshot backup:

```text
/opt/wpauto/backups/p3e1k-login/20261018T124853Z-FG0p1L
```

The directory was verified root-owned 0700 and the selected files root-owned
0600. This is a **login configuration/snapshot backup, not the E1K WordPress
database/identity backup**, which remains NOT_RUN. No database restore occurred.

| File | SHA-256 |
| --- | --- |
| login.py, this run | d98e6ca8a89ed02b22818e00054c935853bf26b46433bf67cae462f85f97af23 |
| runtime.env | 2ba36de04cbb114cbcb9c3c717148e7175e53ffde97e280566c007574cee238a |
| guard.conf | 6485a5f0df233ed8ce8c48bf03cdcc6f6aea1be8684711abd44e3b3b48a87f9c |
| rollback.image | dee4a381eab487aab27713243f4149818e144ed80e2a588fc750adfbc44fb214 |
| initial.json | a2693babc11aad0f8d16eaff5179cf70b6613f8700a4125726754cd844104fa1 |

The helper reused the existing exercised E1D helper only after checking its
root custody and SHA-256
`b555b20b171bc3bc3d554981cb77ae11e6ffac5e9cfdb9cfd976266a5175a3c2`.
It adapted dynamic quota baselines, first-new-reservation detection and a
five-minute monotonic systemd timer. Fourteen local focused tests passed,
including retention cleanup, unchanged/replaced rows, multiple new records,
original identity/owner checks, first-send guard restoration and DB-error/
deadline closure. Python syntax and Node transport syntax passed. Transport
used LF-only command files; the earlier CR warning was not repeated.

## One short sending window

An independent five-minute recovery timer was armed before enabling sending.
Only Control was recreated, using the same immutable image and existing
direct-start Compose override. The other four container identities were checked
unchanged. The first-reservation watcher was verified active before removing
the existing send/resend guard; raw `/api/auth/` denial remained in place.
No source-IP logging framework, firewall change or permanent allowlist was added.

| Event | Platform-reported UTC |
| --- | --- |
| Window opened | 2026-10-18T12:49:50.729258Z |
| Nginx sending guard verified closed | 2026-10-18T12:50:21.164769Z |
| Application sending false, restore completed | 2026-10-18T12:50:28.748392Z |
| Maximum scheduled deadline | 2026-10-18T12:54:33.505502Z |
| Post-login status observation | 2026-10-18T12:52:14.723156Z |

The guard was closed approximately 30.436 seconds after opening, without
waiting out the deadline; both protections were restored in approximately
38.019 seconds. Only the expected enable/disable Control recreates occurred.
No release image, rollback reference, Authorization or other service changed.

## Authentication and sending results

| Check | Result |
| --- | --- |
| New reservations / Provider calls | 1 / 1 |
| accepted / rejected / unknown / storage_failed | 1 / 0 / 0 / 0 |
| Global rolling budget | 100 -> 99 |
| Rate-limited counters | 0 at every captured fixed dimension |
| Operator actual receipt and OTP input | CONFIRMED |
| Operator /app login and refresh persistence | CONFIRMED |
| Original target account now has a valid Session | PASS, direct read-only query |
| Original Account/Home Tenant/owner identities unchanged; no new identity mapping | PASS |
| Resend Dashboard Delivered check for this recovery | NOT_RUN; accepted is not delivered |

Two old OTP reservation rows were already older than 48 hours. The normal
deployed quota reservation transaction removed them through its existing
retention rule when this send was reserved. This was **not a manual DELETE,
budget refund or reset**. The guard watcher identified the new reservation by
new ID digest, not net row-count growth; total rows consequently changed 2 -> 1.
The new accepted reservation remains. There were no non-expired historical rows
to remove/change; their preservation check passed but is vacuous for this run.
Pre-send safe snapshots retained old row digests, not recipient HMACs or emails.

## Protection and business postchecks

Direct postchecks passed for actual/persisted send=false, byte-for-byte runtime
and guard restoration, unchanged rollback reference, protected HMAC bytes/
permissions/mount and the same immutable images. Public and direct-origin empty
send/resend POSTs returned 503; the raw Better Auth send endpoint returned 404.
No address was submitted in those probes.

Five services remained healthy, the other four containers unchanged, the OOM
counter unchanged, MemAvailable 1,220,004 KiB and memory full avg10 0 in the final
preflight snapshot. Full Site, Grant, Outbox, pairing-attempt and migration
digests and Site A Connector summaries matched this run's pre-send baseline.
Migrations remained 001-013 plus 015, without 014. Original account/Home Tenant/
owner projections were unchanged; the new valid Session is expected protocol
state. No new Site/Grant/pairing attempt or revocation event was created.

Both owned timer/service configuration files were removed and the timer,
recovery service and watcher were verified not active. Configuration backup,
sanitized execution receipts and the legitimate current reservation remain.
No ongoing sending window or recurring recovery task remains.

## Stop and continuation boundary

Login recovery is complete. The new WordPress host, clock bracket test, identity
dependency search and protected WordPress database/Connector backup have not
been completed for E1K. Do not mark the overall preflight passed merely because
login was restored. Continue those first-stage gates before requesting a fresh
identity-deletion confirmation. No Enable, Connect, Disconnect, new Proof,
OAuth/MCP, clock adjustment, new deployment, migration or Site B operation
was performed by this login recovery. No WordPress content entered the platform.

This additional document preserves the earlier stop record in the same Draft
PR; no automatic merge. User dirty files and design/ were not changed. Hosted
CI validates only the documentation candidate, not the production observations.

```text
P3E1K_EXISTING_ACCOUNT_LOGIN_RECOVERED=True
P3E1K_PREFLIGHT_PASS=False
P3E1K_LOCAL_BACKUP_VERIFIED=False
P3E1K_IDENTITY_RESET_PERFORMED=False
P3E1K_NEW_PAIRING_ATTEMPT_PERFORMED=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
