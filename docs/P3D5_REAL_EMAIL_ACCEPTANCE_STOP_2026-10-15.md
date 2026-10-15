# P3-D5: real Email OTP acceptance stopped before sending

Date: 2026-10-15. This is a production preparation/stop record, **not**
successful real-email acceptance. The operator authorized one real send, a
bounded source-restricted window, protected backup, Control-only configuration
recreation if needed, unconditional send protection recovery and a Draft record.
The send window was never opened and no real email was requested.

## Reviewed baseline

- [PR #71](https://github.com/wepuu/wp-auto/pull/71), Head
  `cc7ce0ff1abb9c85bd8dc47868727a0ddef091d6`, remained Draft, one documentation file.
  [CI 38734970016](https://github.com/wepuu/wp-auto/actions/runs/38734970016)
  completed successfully. Neither #70 nor #71 was merged.
- Control remained
  `ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe`.
- Authorization remained
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Five scoped services were healthy, restart counts zero and OOM flags false.
  All container identities and start times remained unchanged throughout this run.
- Migrations remained exactly 001-013 plus 015, all prior checksums unchanged,
  no 014. No migration, image publication or deployment ran.
- The stable HMAC file was regular, UID1000, mode0600, read-only mounted and
  matched its protected P3-D4 backup by in-memory comparison. No key or key hash
  was output. Existing 3/hour, 6/day and 100/day settings remained unchanged.
- Initial quota table rows0, database budget100; Provider attempt, accepted,
  rejected, unknown, storage-failure and rate-limit counters were all zero.
- The current replacement Codex Grant (SHA-256 prefix `a290a8dc95c3`) was active,
  updated_at `2026-10-14T15:06:19.849847+00:00`, revocation reason null.
  The earlier revoked Codex Grant was not used as the active baseline.
- Site A Connector remained active/v2/sequence0, with its exact current Site
  binding and revocation state digest unchanged. Site B remained retired.

The first read-only helper initially treated systemd's nonzero `degraded`
status exit as a diagnostic failure. Its status interpretation was corrected;
the subsequent read-only preflight passed. This was not an application failure.

## Fresh backup

Directory:
`/opt/wpauto/backups/p3d5/20261015T125356Z-SseBFH`.

The backup was created once at 12:53:56 UTC (20:53:56 Asia/Shanghai). The
directory is root-owned0700 and backup files root-owned0600. It contains a
PostgreSQL custom-format dump, base Compose, runtime configuration, OTP override,
original guard, real-IP configuration, auth vhost, migration hash list and image/
rollback references. No backup contents or credentials are included in Git.

Dump SHA-256:
`6c3b52553145ab740bb994070116473d8fa8b323446e0be407d4e8d0b4f7e357`.

SHA256SUMS verification and `pg_restore -l` passed; dump/list stderr were empty.
This run did not perform an isolated restore or restore the production database.
The already recorded P3-D4 isolated restore is separate historical evidence.

## Source verification and stop

The operator confirmed preparation of a previously unused controlled mailbox,
an independent browser window, a personal network and Resend Dashboard access.
No mailbox address, OTP, credentials or inbox content was provided to the agent.

The operator opened a content-free health URL and reported the expected ready
response. The existing access log contained no matching source-probe record,
so it could not establish the actual browser source. No address was guessed,
no client forwarding header was trusted, and no broad allowlist was installed.

A temporary health-only source-log configuration was prepared to record only
timestamp, original peer, real-IP client address and status for the exact probe.
The send/resend deny rules and application false flag were retained throughout.
Its Nginx preparation/validation failed, and the helper automatically restored
the original guard and removed its only temporary HTTP configuration file.
The post-recovery Nginx syntax check passed.

The helper emitted only `P3D5_SOURCE_PREPARE=failed_sending_remains_paused`;
the failed preparation's raw stderr was not retained. The precise parser or
configuration-load cause is therefore **unconfirmed**. Do not present a load
order, Cloudflare or application defect as established fact.

Following the plan's failure rule, execution stopped before timer activation,
Control recreation, source allowlisting or sending. The locally drafted
recovery helper was neither installed nor run; its isolated recovery tests were
not completed and must not be represented as passing. No server recovery task
was installed or left behind.

## Actual results

| Check | Result |
| --- | --- |
| PR identity and historical CI | PASS |
| Production identity, protected HMAC, schema and permission preflight | PASS |
| Fresh dump, restricted permissions, SHA and restore list | PASS |
| Operator browser health page | PASS, operator-confirmed |
| Reliable browser source identification | NOT_CONFIRMED |
| Temporary health source-log preparation | FAIL, automatically reverted |
| Isolated automatic recovery validation and deadline activation | NOT_RUN |
| Send flag enable / Control recreation | NOT_RUN |
| Source-restricted email send window | NOT_RUN |
| Real Provider calls / sends | 0 |
| Resend accepted / delivered / inbox received | NOT_RUN |
| OTP verification / new Session / new account and Home Tenant | NOT_RUN |
| Final send protection and service checks | PASS |

No resend, Consent, Code exchange, Token/Refresh/Replay/Revocation, pairing,
WordPress tool call, Site recreation or credential cleanup was attempted.

## Final protection and state comparison

- The exact original Nginx guard bytes and auth vhost matched the backup.
  Public and origin empty-body POST probes returned503 for send/resend,
  including encoded send and repeated-slash normalization probes. Raw auth404.
- `WEPUU_EMAIL_OTP_SEND_ENABLED=false` remained both in persistent configuration
  and the actual running Control process. It was never enabled. No Control or
  peer container was recreated; no image rollback was performed or required.
- The temporary source-log HTTP configuration was absent. No temporary source
  allowlist, extra health location or automatic recovery task remained.
- Runtime/override/rollback configuration bytes were unchanged. The P3-D4 old
  Control rollback reference was not overwritten.
- Five scoped services remained healthy, same IDs/images/start times, restart0,
  OOM false. Host historical oom_kill count174 was unchanged. Short samples
  showed roughly1.1GiB available memory, low PSI and no sustained severe pressure;
  this does not claim a long-duration capacity test.
- All11 tracked Grant row hashes, all5 Site states, all12 historical Outbox row
  hashes, the current Connector revocation digest and migration hashes matched
  the immediate preflight exactly. Active Site undelivered count0. Site B's two
  delivered events and historical old Site A sequence-5 failure were preserved.
- Identity metadata was unchanged; no new platform account/Home Tenant was
  established. No inbox, OTP, Session token or authentication body was read.
- Quota table rows0, budget100; Provider attempts/accepted/rejected/unknown and
  storage/limit counters all0. No fake quota or stress send was used.

Normal curl health, Discovery, JWKS and Site A login probes returned200; the
operator's normal browser health page was ready. Python urllib health still
returned403 with Server:cloudflare and no cf-mitigated header. This is retained
as an unresolved client/transport-dependent observation, not proof of a
Cloudflare-origin block. It does not establish whether browser registration
works: no registration request or real-email transaction ran. WAF/TLS settings
were not changed and no browser identity was impersonated.

## Follow-up boundary

Before another production attempt, reproduce and correct the temporary Nginx
configuration in an isolated configuration test, retain a safe fixed failure
classification and test the exact automatic restoration path. Then separately
authorize a new bounded one-send run. Do not enable sending, remove the guard,
or repeat production preparation just to obtain a passing result in this run.

First WordPress pairing/full onboarding is still separately gated. No public
registration opening, P4-A, migration014, Site B recreation, existing Grant
change, Outbox repair or cleanup is authorized by this record. Primary dirty
files and `design/` were not changed or staged. Only this document is proposed
for a new Draft PR; no operational helper or secrets are submitted.

```text
P3D5_REAL_SEND_COUNT=0
P3D5_ACCEPTANCE_STOPPED_BEFORE_SEND=True
P3D_REAL_EMAIL_ACCEPTANCE_PASS=False
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
