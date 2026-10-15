# P3-D5: single real Email OTP production acceptance

Date: 2026-10-15, Asia/Shanghai. **PASS: one real email, operator-confirmed
delivery/receipt/login, new account and Home Tenant; sending paused again.**
This does not open public registration or accept first WordPress onboarding.

## Authorization and preserved history

The operator explicitly authorized a simplified, separate retry using existing
Control/Resend, the existing 3/hour, 6/day and global100/day quotas, a temporary
send/resend guard removal and an independent recovery deadline of at most five
minutes. No source identification, IP allowlist, source-log configuration or new
test framework was used in this retry. The short window was publicly reachable
under the existing application protections, not source-restricted; this was the
operator's revised authorization, not a claim of source isolation.

[PR #72](https://github.com/wepuu/wp-auto/pull/72) retains the earlier pre-send
preparation failure and zero-send stop. It is not rewritten as passing.
[PR #71](https://github.com/wepuu/wp-auto/pull/71) retains P3-D4 deployment
evidence. Neither PR, #70, nor this Draft record was merged automatically.

## Small preflight and configuration backup

- Five scoped production containers were healthy, restart0, OOM flags false.
- Control remained
  `ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe`.
- Authorization remained
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- The actual and persistent send flag was false. Existing quota rows0,
  attempted0, budget100; all current-process OTP counters zero.
- Original guard, runtime configuration and rollback reference were copied to
  root-protected files in
  `/opt/wpauto/backups/p3d5-simple/20261015T132949Z-GimkaT`.
  Directory0700, copied files0600. No credential or configuration contents are
  included here. The previously verified P3-D5 database backup remains retained;
  this simplified retry did not repeat a full dump or restore.
- The operator confirmed a controlled previously unused mailbox, independent
  browser and Dashboard readiness without sharing the mailbox or credentials.

## Actual bounded execution

Times below are Asia/Shanghai, with corresponding UTC evidence retained in the
protected run directory.

| Event | Time / result |
| --- | --- |
| Independent persistent recovery timer armed | Before enabling Control; deadline21:35:25 |
| Temporary send/resend window opened | 21:30:38.462 |
| Exactly one database reservation | 21:31:46.690 |
| Provider attempt claimed | 21:31:46.721 |
| Restored false-switch Control started | 21:31:49.180 |
| Final protection/service checks | 21:38:00 |

The root-owned systemd recovery timer/service was installed and verified active
before enabling sending. It was independent of SSH/Codex and persisted a missed
deadline. A temporary server-side watcher closed the original Nginx guard on the
first reservation, allowed the already-started send to finish, captured its
result and disabled sending. The deadline also invoked the recovery path; it
did not recreate an already-disabled Control or send another email.

Only Control was normally recreated to enable and disable the environment flag,
using the same fixed image, explicit base/override Compose files, --no-deps,
--no-build and --pull never. Its command remained direct runtime startup, not a
migration command. The deployment script was not used, preserving its old-image
rollback reference. Other four scoped containers were not restarted/recreated.

Nginx changes were limited to the existing guard include. The temporary version
removed the two send/resend denies and retained raw `/api/auth/`404. Existing
normal proxy, real-IP and security rules remained in place; required syntax
checks and normal reloads passed. No IP, health logging, WAF, TLS, DNS or other
vhost configuration was added or changed.

The first reservation was followed by the disabled Control's start about2.49
seconds later, well before the five-minute deadline. The operator was told not
to resend. No second send or artificial limit/budget stress test occurred.

## Real acceptance results

| Check | Result / evidence |
| --- | --- |
| Actual send count | PASS: exactly1 reservation and1 attempted_at |
| Provider accepted | PASS: persisted outcome `accepted` |
| Resend delivered | PASS: operator-confirmed Dashboard Delivered |
| Inbox received | PASS: operator-confirmed actual receipt |
| OTP verification | PASS: operator completed normal browser verification |
| Browser /app and refresh | PASS: operator confirmed login and refresh remained valid |
| New platform account | PASS: exactly one new linked active account |
| New Home Tenant | PASS: independent Home Tenant and active owner membership |
| Better Auth identity / Session | PASS: verified identity and unexpired Session metadata |
| Global rolling budget | PASS:100 to99, one accepted reservation retained |
| Sending paused again | PASS: original guard503 and actual/persistent flagfalse |

New account SHA-256 prefix: `3f70db80a710`; Home Tenant prefix: `7a930b60a6be`.
No mailbox, OTP, Session ID/token, Cookie, Provider message ID or email content
was read or committed. Dashboard delivery and receipt are **operator attestations**,
not an agent mailbox read or webhook observation. Accepted, delivered to recipient
server, and receipt are separate evidence; none was inferred from accepted alone.

The new account, Home Tenant, legitimate Session and reservation remain intact.
No Site or business Grant was created, and no WordPress pairing was attempted.

## Metrics evidence limitation

Current-process OTP counters reset on each Control recreation and were zero
after disable; the database-backed remaining budget remained99. The first
recovery saved a pre-disable snapshot, but the later deadline recovery overwrote
that snapshot after recreation. The retained snapshot therefore does **not**
prove process attempt/accepted counters were1 before recreation. This evidence
gap is retained, not converted to a claimed counter delta or to zero real sends.

One real attempt and accepted outcome are independently established by the
single database reservation with attempted_at and accepted, together with the
operator's Dashboard/receipt/verification confirmations. Rejected and unknown
are absent from persisted reservation outcomes. No quota was cleared, refunded
or fabricated. A future operations helper should preserve the first pre-disable
snapshot when a deadline repeats already-completed recovery; no runtime code
change or additional production test was made for that improvement here.

## Final checks and cleanup

- Actual and persistent SEND_ENABLED=false; original runtime configuration,
  full guard and rollback reference bytes exactly matched this run's backups.
- Public send/resend empty-body probes503; raw Better Auth API404. nginx -t
  passed. Normal public health, Discovery, JWKS and Site A login probes200.
- Five services healthy; four peer container IDs/images/start times unchanged;
  host historical oom_kill count unchanged. Control image unchanged.
- Existing Grant, Site and Outbox full-row digest collections were unchanged.
  Current replacement Site A Codex Grant remained protected; Site A Connector
  state digest was unchanged, active/v2/sequence0. Historical failures were not
  retried and Site B history remained retired.
- Migration names/checksums remained001-013 plus015, no014. Stable HMAC bytes
  matched the protected earlier backup without outputting the key or its hash.
- Only this run's temporary systemd timer/service/watcher were removed after
  verified protection recovery. No source/log configuration existed in this retry.
  Protected configuration/evidence backups were retained.

One intermediate read-only status call was not executed because the automatic
permission reviewer timed out; the permitted single retry succeeded. The
server-side watcher/recovery remained independent of that client/tool delay.
No extra email was sent. The previous Python403 observation was not investigated
or repaired in this simplified run; the real operator browser flow succeeded.

## Scope and final state

No image build/publication, database migration/restore, OAuth Consent/Code/Token/
Refresh/Replay/Revocation, Connector change, Site B recreation, Grant/Outbox
mutation, public-launch change or P4-A deployment ran. Primary dirty files and
`design/` were unchanged/un-staged. This candidate adds only this record; no
operational helper, backups or credentials are submitted.

```text
P3D5_REAL_SEND_COUNT=1
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3D_PRODUCTION_DEPLOYED=True
P3D_PRODUCTION_HEALTH_PASS=True
P3_CORE_OAUTH_MCP_PASS=True
P3B2_SITE_ISOLATION_PASS=True
P3B3_APPLICATION_PASSWORD_PASS=True
P3C2B_SITE_B_CLEANUP_COMPLETE=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after this Draft record. Public sending/registration and first WordPress
onboarding remain separately authorized; the successful email test does not
remove those gates or authorize another send.
