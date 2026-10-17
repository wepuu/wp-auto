# P3-E1F: WordPress time synchronization attempt and scoped rollback

Date: 2026-10-17, Asia/Shanghai. **Repair did not pass; original synchronization
configuration restored. No new pairing.** Host-reported timestamps below are
explicitly UTC and are not independently calibrated UTC evidence.

## Outcome

- An approved IPv4-only drop-in for the existing systemd-timesyncd was applied.
  One normal synchronization-service restart occurred. No website service was
  restarted by this operation.
- At the next operator-returned observation, service age was **7068.933 seconds
  (about 118 minutes)**, NTPSynchronized=no and packet count=0. The daemon was
  active and had selected the second approved IPv4 address. Switching away from
  the previously unusable IPv6 selection did **not** establish synchronization.
- The exact owned drop-in was backed up and removed, and one authorized rollback
  restart restored the original effective configuration hash and source policy.
  The post-rollback daemon remained active but **unsynchronized**.
- Website HEAD checks passed. Nginx, PHP 8.2 and database primary process
  identities matched the pre-repair snapshot; the restricted Connector state
  readback also matched. The local-active/platform-unbound pairing scene was not
  reset or retried.
- No post-repair two-round clock acceptance was performed: the synchronization
  prerequisite failed. Neither a successful clock correction nor a current
  post-rollback relative clock offset is claimed.

The result does not identify a firewall, ISP, UDP/123 filter, remote-source
failure or local daemon defect. Packet count=0 is the daemon's reported state,
not a packet capture proving that no packets crossed a particular interface.

Prior evidence remains separate: [E1D failure, Draft PR #77](https://github.com/wepuu/wp-auto/pull/77)
and [E1E clock diagnostics, Draft PR #78](https://github.com/wepuu/wp-auto/pull/78).
The known E1D branch is proof / proof.claims_invalid / claims.time_future;
the original Proof/iat and a simultaneous failure-time offset were not retained.

## Authority, provenance and boundaries

The operator authorized a scoped repair on WordPress host 148.135.106.145,
including backups, the single drop-in, one application restart of timesyncd and
one necessary configuration-rollback restart. They confirmed a maintenance window
accepting the possibility of an approximately 40-second backwards correction.

Direct noninteractive SSH authentication to this WordPress host was unavailable.
The operator executed supplied commands in their existing root PuTTY session and
returned sanitized JSON. WordPress findings here are **operator-executed evidence**,
not represented as assistant-originated SSH observations. Local helper syntax
checks do not substitute for production results.

Only existing synchronization configuration and the dedicated drop-in were
changed. No manual date/set-time/hwclock operation, software installation,
additional time daemon, firewall/route/DNS/IPv6 change, PHP timezone change,
business-service restart, application deployment, migration or tolerance change
was performed by the repair commands. No Proof, Connect/Disconnect, OAuth, email,
MCP content operation or platform mutation was performed.

Readbacks used SHORTINIT, disabled WP-Cron, a read-only database transaction and
direct option queries, not potentially writing Connector load methods. They
returned only public binding/status metadata and state digests. No private
identity, database credentials, WordPress content or raw Options were exported.
Protected database/configuration backups stayed on the WordPress host; none was
sent to the control plane or GitHub. Public HTTPS checks discarded response
bodies. This record changes no product contract, API, schema or dependency.

## Fresh preflight

The host reported systemd 249 (249.11-0ubuntu3.23), Etc/UTC, NTP=yes,
NTPSynchronized=no and systemd-timesyncd active/running. Listed chrony, chronyd,
ntp, ntpd and openntpd units were absent/inactive, not competing active daemons.

The effective configuration contained no explicit Time directives. Its source
policy was empty SystemNTPServers and LinkNTPServers, with
FallbackNTPServers=ntp.ubuntu.com. The selected address at preflight was
2620:2d:4000:1::40. Systemd 249's manager interface does not expose a separate
RuntimeNTPServers property; its absence was not treated as a failed check.

IPv4 resolution of the same approved provider returned, numerically sorted:

```text
91.189.91.157
185.125.190.56
185.125.190.57
185.125.190.58
```

The first two addresses had local IPv4 routes and were selected. Route presence
was not described as UDP reachability. The target drop-in did not previously
exist and was not a symlink. No explicit new NTP probe was sent before applying
the configuration; restarting the daemon subsequently permits normal NTP traffic.

### Fresh pre-repair relative clock measurements

The operator ran seven groups using the existing TLS-verified direct Control
origin health HTTP Date brackets around a local PHP microtime sample. As in E1E,
each Date observation has a conservative plus/minus one-second allowance; network
and command latency remain in the brackets. These are indirect, second-resolution
Control-origin comparisons, not independent absolute UTC calibration or direct
FPM Proof execution. The reference assumes no Control clock jump during a group.

| Group | WordPress minus Control interval, seconds | Total elapsed, ms |
| --- | --- | --- |
| 1 | +38.799463 to +41.799463 | 1391.106 |
| 2 | +39.577572 to +41.577572 | 1276.505 |
| 3 | +39.324017 to +42.324017 | 1243.270 |
| 4 | +39.100262 to +42.100262 | 1295.212 |
| 5 | +38.882592 to +41.882592 | 1250.561 |
| 6 | +39.614156 to +41.614156 | 1245.860 |
| 7 | +39.403276 to +41.403276 | 1266.726 |

All returned VALID. The conservative envelope was **+38.799463 to +42.324017 s**;
maximum local wall/monotonic elapsed discrepancy was 0.021 ms. Do not intersect
samples to advertise unjustified precision, or carry this pre-repair measurement
forward as a measured post-rollback offset.

## Backup and first backup failure

Protected host-local directory:

```text
/root/wepuu-e1f-backup-20261017T030719Z-65c64636
```

The first backup invocation stopped at clock_configuration_backup before a clock
archive, database dump or temporary credential file had been created. This was a
collector comparison error: preflight hashed stripped command output, while the
backup hashed the complete output including its trailing whitespace/newline.
The 778-byte original snapshot's stripped hash exactly matched preflight; the
error log was empty. No live clock configuration or service was changed.

The original snapshot was preserved. A corrected raw-byte comparison resumed the
backup in the same directory, completing at host-reported 03:09:49Z. This is not
rewritten as a first-attempt backup success.

| Artifact | SHA-256 |
| --- | --- |
| clock-effective.conf, raw bytes | f674fba81b81f3c3f19a0a169505e8b68a6b446565ea05ced278902ac9bab4df |
| Same output after stripping, comparison only | 35ec843386472e1e6e30ed0a8c6050af33cb9aaa1023a4009c71d9b2f014d692 |
| clock-config.tar.gz | 5417538d93cf9ec92423552f37fdb195e7be9ce3b2ee0d5ec820ff1d5877a475 |
| database.sql.gz | ebb86fc177a44f822fd7aa77df0fe32e255dd79df049639bdf2262172d827eca |
| connector-config.tar.gz | c52d5904bf98465c067e97f9ddc069001cf2c20c8d1e05ea0630046a0256d6f0 |

The root-owned directory used 0700; backup files used 0600. All 32 base tables
were InnoDB. Mysqldump used a single transaction and protected temporary
credentials, removed afterward. Gzip integrity and archive listing checks passed.
The plugin/configuration archive includes protected recovery material and must
not be published. Readability checks are **not** a complete restore drill; no
database restore or full restore exercise occurred.

## Approved change and failed synchronization observation

Only this new live file was created, root-owned 0644:

```text
/etc/systemd/timesyncd.conf.d/90-wepuu-ipv4-ntp.conf
```

Its payload was:

```ini
[Time]
NTP=
NTP=91.189.91.157 185.125.190.56
FallbackNTP=
FallbackNTP=91.189.91.157 185.125.190.56
```

The effective lists, lack of per-link overrides and unchanged RootDistance/
minimum/maximum poll parameters were checked. Timesyncd was restarted **once**.
At host-reported 03:16:26.194658Z it was active, selected 91.189.91.157,
reported packet count=0 and NTPSynchronized=no. The measured wall-minus-monotonic
change during the restart call was +0.000405 s, not an observed 40-second repair.
Business primary process and restricted WordPress state comparisons passed;
website and login HEAD requests returned 200.

The next returned observation was at host-reported 05:14:13.855040Z. The service
had been running for 7068.933 s, selected 185.125.190.56, had reached its
34 min 8 s poll interval and still reported packet count=0 / NTPSynchronized=no.
No NTPMessage field was returned; no offset, root distance or valid update could
be confirmed from this observation. Two valid synchronization updates, leap
health and the offset/root-distance acceptance thresholds were **not achieved**.

The observer uses a monotonic ten-minute limit measured from service startup.
Because that limit had already elapsed, it took one 0.163-second snapshot and
did not spend another 90 seconds waiting. This is not a 90-second continuous
observation and does not prove what happened during the original first ten
minutes.

**Execution limitation:** the manual operator-mediated gap exceeded the intended
approximately 15-minute maintenance/observation window. There was no independent
server-side automatic rollback timer; do not describe this as a timely automatic
ten-minute rollback. Only timesyncd was changed. Future separately approved
experiments should combine apply, monotonic-deadline observation and scoped
failure rollback in one bounded invocation rather than depend on chat turnaround.

## Scoped rollback and final observed state

After the failed observation, the rollback verified the exact drop-in contents,
ownership, original raw configuration hash and application evidence. It saved
the failed configuration locally before deleting only the owned live file:

```text
/root/wepuu-e1f-backup-20261017T030719Z-65c64636/retired-90-wepuu-ipv4-ntp.conf
```

One normal **rollback** restart of timesyncd followed. Total synchronization
service restarts for E1F: **two: one apply, one rollback**. Original main/shared
configuration was not overwritten. The operation did not delete the configuration
directory or any other files, and the removed drop-in is recoverable from its
protected local copy. Rollback was configuration restoration, not clock reversal.

At host-reported 05:17:20.346279Z the operator returned:

| Check | Result |
| --- | --- |
| Original effective configuration hash and source policy restored | PASS |
| Owned live drop-in removed and protected copy preserved | PASS |
| Timesyncd active | PASS |
| Actual synchronization | FAIL: NTPSynchronized=no, packet count=0 |
| Nginx/PHP/database primary process identities vs before rollback | PASS |
| Same identities vs pre-repair | PASS |
| Restricted Connector state vs before rollback and pre-repair | PASS |
| Website and login HTTPS HEAD | PASS: both 200 |
| Manual clock setting | NOT_RUN; prohibited |
| Two post-repair rounds of seven samples, separated by at least 60 s | NOT_RUN: synchronization prerequisite failed |

During the rollback restart, measured wall-minus-monotonic change was +0.000004 s.
This short measurement does not prove no clock change occurred at any other time.
Restored policy resolved ntp.ubuntu.com to **91.189.91.157** at this observation;
restoring configuration does not require DNS to select the same IPv6 address as
the earlier preflight. It is not evidence that synchronization is fixed.

The Connector remained local active with the same identity/binding digest,
pending absent, revocation v2 and sequence=0 according to matched readback.
No platform writes or production image changes were issued. A fresh full
platform Grant/Outbox database digest and five-container postcheck were **not
performed as part of this host-local rollback**; their earlier accepted baselines
are retained, not represented as newly sampled evidence. No OTP enabling command
was issued; the existing paused-send state is carried forward.

## Next minimal task and stop

Stop this repair attempt; do not try more sources, restart again, increase the
Proof allowance, change PHP timezone, install chrony, manually set time or retry
pairing under the present authorization.

A separate narrowly authorized **NTP-path diagnostic** should distinguish local
daemon/configuration issues, host egress/return filtering and upstream/provider
reachability. Prefer existing read-only firewall/routing/service evidence and,
only if separately approved, a bounded capture/probe restricted to the approved
NTP endpoints. Route presence alone is insufficient; do not infer UDP openness
from a generic UDP client's lack of an error. Ask the CloudCone administrator
about any UDP/123 restrictions or an officially supported time source, without
blindly disabling the firewall or switching providers. Any corrective network
or source change requires its own reviewed scope.

After an actual synchronization repair, require fresh daemon update/offset
evidence and both clock-sampling rounds. Current local active/platform-unbound
state, old failed attempts and identity backups remain protected. A subsequent
identity recovery and single new pairing is a different authorization.

## Validation and status

The only tracked change is this record, on a clean worktree from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. Local helpers passed Python syntax
compilation, not a simulated NTP/network or full rollback integration test.
Recorded sample arithmetic, fixed output categories and secret boundaries were
reviewed locally. Hosted CI for this documentation candidate is code/evidence
integration validation, never production clock-repair acceptance.

User dirty files and design/ were not changed or staged. No PR is merged.

```text
P3E1F_WORDPRESS_TIME_SYNC_REPAIR_PASS=False
P3E1F_POST_REPAIR_CLOCK_CHECK_PASS=False
P3E1F_ORIGINAL_CLOCK_CONFIGURATION_RESTORED=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1E_FAILURE_TIME_OFFSET_CONFIRMED=False
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
