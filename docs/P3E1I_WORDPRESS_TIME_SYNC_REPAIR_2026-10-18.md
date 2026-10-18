# P3-E1I: bounded WordPress timesyncd source repair

Date: 2026-10-18, Asia/Shanghai. **Synchronization repair and both post-repair
clock-check rounds passed.** This records the operator's PuTTY execution on the
WordPress host, not an assistant SSH observation. No pairing was attempted.

## Authority, provenance and limits

The operator approved the revised E1I plan, confirmed that the approximately
20-minute maintenance window remained valid, and accepted a possible backward
clock step of approximately 41 seconds. The launcher additionally required the
literal maintenance confirmation `START-E1I` at execution time.

CloudCone's support reply, supplied by the operator, stated that neither
CloudCone nor the data center intentionally restricts NTP outbound/return
traffic. It did not independently verify every network path, and did not
explicitly confirm a currently recommended hostname or fixed IPv4 endpoint.
The operator chose to proceed using the existing official-documentation lead
and the successful E1H query to `ntp.cloudcone.com` / `64.69.34.90`.

References: [E1H, Draft PR #81](https://github.com/wepuu/wp-auto/pull/81),
[E1G, Draft PR #80](https://github.com/wepuu/wp-auto/pull/80),
[E1F failure/rollback, Draft PR #79](https://github.com/wepuu/wp-auto/pull/79),
and [E1D pairing failure, Draft PR #77](https://github.com/wepuu/wp-auto/pull/77).
Their historical outcomes are not rewritten by this successful repair.

The authorized mutation was limited to one timesyncd drop-in and one normal
timesyncd restart, with a bounded observer and a scoped rollback allowance.
There were no firewall, routing, DNS, global IPv6, PHP-timezone, Proof-tolerance,
Connector-code, database-schema, platform-deployment or public-registration
changes. No manual clock-setting command, RTC write or database restore ran.

An earlier launcher invocation stopped with `WRONG_HOST` before creating its
run directory, starting a worker or changing configuration. The operator then
reported opening the correct session and running the launcher successfully.
This was not a second live repair attempt. The later final receipt reports
that the preflight passed and that one apply restart was claimed/completed on
the intended host; the assistant did not independently inspect that host.

## Execution and source identity

| Item | Recorded value |
| --- | --- |
| WordPress host | 148.135.106.145 |
| WordPress / canonical resource | https://www.wepuu.com / https://www.wepuu.com/wp-json/wp-auto/mcp |
| Fixed candidate / observed NTP stratum | 64.69.34.90 / 3 |
| OS / existing daemon preflight | Ubuntu 22.04, systemd 249.11-0ubuntu3.23, systemd-timesyncd |
| Control origin used only as clock reference | TLS-verified auth.wpauto.cc at operator-supplied 5.255.99.225 |
| Final status / phase | e1i_repair_complete / complete |
| Total execution duration | 189.136 seconds, monotonic |
| Receipt directory retained on host | /root/wepuu-e1i-run |
| Apply / rollback restart counts | 1 / 0 |
| Configuration retained / rollback performed | True / False |
| Independent guard timer cleared | True |

The launcher verified embedded source length and SHA-256 before staging it.
The helper gated host identity, the raw original configuration hash, current
source policy, absence of competing clock daemons/owned drop-ins, DNS inclusion
of the fixed candidate, route/source address, business baselines and backup.
No package was installed or downloaded by E1I; the existing verified query-only
client was reused. The returned receipt exposes only `preflightPass=true`, not
every gate's raw output; that is the boundary of the operator-returned evidence.

| Locally prepared artifact | SHA-256 |
| --- | --- |
| Complete PuTTY launcher | a53886a52dc514ebd7bb2b28857f2c08db1b62a597da6f4761339a37f4dafc6a |
| Embedded worker.py | 77a67aa1fbf41e6869ed3acc14379575844a0b9e5558011e33a16bd9e429f3f6 |
| Embedded backup.php | d057b5b78caec005cf71caeb25817f8fd2966dba09bbae46c5d82bb33cef47fb |
| Operator-supplied final receipt attachment, original bytes | b70fbb99317da1519d5f28897ba38c6c22787c081369356772919fdfa586ceed |

The host's `hostReportedUtc=2026-10-18T11:51:25.506673Z` field was captured
when the worker started, before correction. It is not the completion time or
independent standard UTC. Backup names also use the then-uncorrected clock.
Elapsed durations use monotonic time so that the backward step does not extend
the observation deadlines or make timestamps into an erroneous event order.

## Protected backup

Host-local directory:

```text
/root/wepuu-e1i-backup-20261018T115128Z-01e89e5b
```

The helper required a root-owned 0700 directory and 0600 backup files. The
receipt reports permission verification, a single-transaction database dump
covering 32 InnoDB tables, gzip integrity and archive-readability checks passed,
and temporary credentials removed. Backup contents, configuration secrets,
WordPress content and identity secrets stayed on the WordPress host.

| Backup file | SHA-256 |
| --- | --- |
| clock-effective.conf, raw bytes | f674fba81b81f3c3f19a0a169505e8b68a6b446565ea05ced278902ac9bab4df |
| clock-config.tar.gz | bf0b801b4c714dafaf824702dc62425a82978a74fc5b1205296fea73989c0356 |
| database.sql | 8b4b88723c8bf1758309a5ddaeaead3afefd1e2f321c4b06e09070f76fa19f2b |
| database.sql.gz | ff92a0cfdf044bfac112dd84632efb0df80bc9de98952fb83725ec8d5ab1cd06 |
| connector-config.tar.gz | 2bc3bff2c6d80c9bf64b056a9224e6cb745b45be67699da3dd8b1343587c1666 |

No production restore or full restore drill was performed. Readability and
integrity checks must not be described as a full recovery exercise.

## Applied configuration and bounded protection

Only the following live drop-in was added:

```text
/etc/systemd/timesyncd.conf.d/90-wepuu-cloudcone-ntp.conf
```

```ini
[Time]
NTP=
NTP=64.69.34.90
FallbackNTP=
FallbackNTP=64.69.34.90
```

The empty assignments reset earlier global source lists. Both nonempty values
name the same candidate; this excludes unreviewed fallback sources and is **not
redundancy or a permanent/high-availability time-source design**. The effective
configuration gate preserved all other time parameters. No per-link/runtime
source override was authorized.

Before linking this owned configuration into place, the worker armed an
independent 12-minute monotonic systemd timer. Main synchronization observation
was bounded to 10 minutes. A shared lock, durable restart claims, exact file
content and inode ownership checks constrained apply/rollback races and blocked
deletion of unknown or concurrently modified configuration. The operator's
successful receipt reports one apply restart, no rollback and timer cleanup.
No persistent follow-up timer was created; backup and execution receipts remain.

## Fresh query and actual daemon synchronization

One pre-apply unprivileged query-only invocation reported exit 0 and
`VALID_SAMPLE_REPORTED`: server-minus-host offset **-41.082214 s**, delay
0.02666 s, stratum 3. This query did not set the clock and used unauthenticated
NTP. No second query was automatically launched.

The daemon then accepted three distinct updates, with increasing packet counts
and different update keys. The last two, not the initial correction sample,
met the required steady-state bounds:

| Monotonic elapsed after apply start, seconds | Packet count | Offset, seconds | Root distance, seconds | Leap normal / ignored | Stable / synchronized |
| --- | --- | --- | --- | --- | --- |
| 0.347 | 1 | -41.082179 | 0.019660 | True / False | False / yes |
| 32.649 | 2 | -0.000207 | 0.020164 | True / False | True / yes |
| 101.434 | 3 | -0.000459 | 0.021110 | True / False | True / yes |

Observed net realtime-minus-monotonic change was **-41.082179 seconds**: a
backward correction by the synchronization daemon, not a manual set-time action.
The final gate required the daemon active, selected address 64.69.34.90, exact
reviewed source policy and `NTPSynchronized=yes`; final synchronization was yes.
The source remains unauthenticated; these observations do not prove an
independently authenticated absolute UTC standard.

## Two post-repair clock-check rounds

The helper used a TLS-verified direct-origin HTTP Date from auth.wpauto.cc,
mapped to 5.255.99.225, around WordPress PHP CLI `microtime(true)`. It rejected
unexpected status, Cloudflare/cache indications and backward reference samples.
This is an **indirect origin-clock reference, not direct Node runtime sampling**,
and PHP CLI does not independently observe the FPM signing context.

Each bound includes a 1-second allowance on each Date endpoint, its second-level
quantization and the enclosing communication window. Every interval contains
zero and lies wholly within -3 to +3 seconds. No sample was discarded to pass.
The rounds were separated by at least 60 monotonic seconds; the corresponding
first reference samples were 68 seconds apart. Request pairs took approximately
1.11-1.19 seconds, including PHP execution. Per-sample local wall/monotonic
differences were 1-7 microseconds, with no new material step observed.

| Round / sample | WordPress minus Control interval, seconds | Sample elapsed, ms | Result |
| --- | --- | --- | --- |
| 1 / 1 | [-0.546149, 1.453851] | 1138.632 | PASS |
| 1 / 2 | [-1.405246, 1.594754] | 1113.503 | PASS |
| 1 / 3 | [-1.294553, 1.705447] | 1113.493 | PASS |
| 1 / 4 | [-1.156095, 1.843905] | 1138.405 | PASS |
| 1 / 5 | [-1.016885, 1.983115] | 1141.846 | PASS |
| 1 / 6 | [-0.900676, 2.099324] | 1111.593 | PASS |
| 1 / 7 | [-0.779863, 1.220137] | 1162.222 | PASS |
| 2 / 1 | [-0.530466, 1.469534] | 1192.843 | PASS |
| 2 / 2 | [-1.380956, 1.619044] | 1113.520 | PASS |
| 2 / 3 | [-1.263910, 1.736090] | 1139.798 | PASS |
| 2 / 4 | [-1.079389, 1.920611] | 1190.014 | PASS |
| 2 / 5 | [-0.910694, 2.089306] | 1137.629 | PASS |
| 2 / 6 | [-0.786261, 1.213739] | 1145.161 | PASS |
| 2 / 7 | [-0.656315, 1.343685] | 1112.391 | PASS |

The envelope of all reported intervals is [-1.405246, 2.099324] seconds.
This meets the approved relative-clock test; it is not a sub-millisecond
measurement of the two servers' relative offset.

## Business protection and evidence limits

The operator-returned final receipt reports:

- Nginx, PHP-FPM and database master-process identities unchanged.
- WordPress restricted connection/identity/pending/revocation snapshot unchanged.
- HTTPS HEAD for `/` and `/wp-login.php` both 200.
- No pairing; no manual clock set; no configuration rollback.
- Final synchronization yes; owned source retained; independent guard timer cleared.

The WordPress state comparison preserves the E1D split state: local active,
pending consumed, v2 sequence 0 and the existing identity, without invoking
state-writing business loaders or a Proof endpoint. Synchronization does not
make that local identity into a successful platform binding.

The assistant rechecked the reported 14 interval bounds locally and inspected
the helper's final source/health/configuration gates. It did not connect to the
production database or re-observe platform Site/Grant/Outbox, Site A, platform
containers, migration inventory, HMAC or OTP guard state during E1I. Their
historical protections/statuses are carried forward, **not asserted as freshly
measured here**. No platform action was performed by this repair.

No WordPress content, credentials, Proof, JWT, private key, raw Options, full
business log or backup contents were exported to this document. The control
plane remains outside the WordPress MCP data path. Public API/schema and
signature, time, audience, tenant, Grant and WordPress capability checks remain
unchanged. This host-operations change does not amend a protocol contract.

## Local validation and GitHub scope

The local disposable helper suite passed 50 synthetic tests, including config
and DNS drift, backup failure, exact source-list reset, monotonic deadlines,
restart budgets, worker/guard races, owned rollback, retention of a healthy
synchronized source, sensitive-output filtering and embedded-file integrity.
The retained E1H synthetic suite passed 40 tests. A post-receipt rerun passed
both suites. One attempted rerun used a nonexistent test filename, executed no
tests and was corrected to the actual retained test file; it was not counted
as a pass. No PHP interpreter was available locally, so local PHP lint/runtime
was NOT_RUN. The live worker required server-side PHP lint before backup/change
and returned successful preflight and backup evidence.

This candidate changes only this evidence document, based on main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. Local `git diff --check` is required;
the Draft PR's actual hosted CI status is reported separately. Hosted CI can
validate the repository candidate, not substitute for production time evidence.
No full local PostgreSQL/OCI/OAuth run is claimed for this documentation change.
No app/Connector source or image, migration, dependency, design file, existing
dirty-worktree file or historical acceptance document is changed.

## Handoff and final state

The clock repair is complete within this bounded observation. The administrator
should recheck source applicability, daemon synchronization and offset within
24 hours (by approximately 2026-10-19 19:54 Asia/Shanghai); no new background
task or automatic source switch was installed. A single fixed IP is a maintenance
obligation, not long-term source redundancy. CloudCone's explicit endorsement
of this endpoint remains unconfirmed.

Current successful correction and comparison do not reveal the old Proof's iat
or prove the clock difference at the 2026-10-16 failure time. The E1D
`claims.time_future` rejection branch remains established, while the historical
first pairing root cause and exact failure-time offset remain unconfirmed.

Stop here. Local identity recovery and one new pairing require separate
authorization, fresh platform dependency/session checks and backup/identity
confirmation. Do not click Enable/Connect/Disconnect or run OAuth/MCP as a
continuation of E1I. Keep the current split state and all prior failure history.

```text
P3E1I_WORDPRESS_TIME_SYNC_REPAIR_PASS=True
P3E1I_POST_REPAIR_CLOCK_CHECK_PASS=True
P3E1I_CONFIGURATION_ROLLBACK_PERFORMED=False
P3E1I_PROVIDER_SOURCE_EXPLICITLY_CONFIRMED=False

P3E1H_CLOUDCONE_NTP_RESPONSE_VALIDATED=True
P3E1F_WORDPRESS_TIME_SYNC_REPAIR_PASS=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1E_FAILURE_TIME_OFFSET_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
