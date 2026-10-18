# P3-E1H: CloudCone candidate NTP query comparison

Date: 2026-10-18, Asia/Shanghai. **One candidate IPv4 query passed; no clock
repair was performed.** The WordPress host remains unsynchronized. This is
operator-executed evidence, not an assistant SSH observation.

## Authority and fixed boundaries

The operator approved the E1H implementation plan: read-only preflight, reuse of
the existing verified query client, one query-only session to one IPv4 address
resolved from ntp.cloudcone.com, one bounded packet observation and evidence
archival. No firewall A/B change, daemon source change, clock adjustment, service
restart, software installation or WordPress pairing was authorized or performed.

CloudCone's [published NTP guide](https://help.cloudcone.com/en-us/article/how-to-synchronize-time-with-ntp-on-cloudcone-servers-1tt72al/)
lists ntp.cloudcone.com, but was updated in 2020. That was a candidate-source
lead, not an instance-specific support confirmation. The operator reported that
the existing support ticket had not yet received a reply. No reply is invented
or ticket update sent by this operation. No commands from that article which
install software or set time were executed.

The CloudCone firewall screenshot showed no listed rules and no clearly selected
default policy. It did not establish the effective cloud policy. No Save or Apply
Rules action was part of E1H. The website's Cloudflare proxy was not changed.

## Preflight, target and execution identity

The one-shot helper required host identity 148.135.106.145, Ubuntu 22.04 amd64,
the E1F rollback configuration hash, absent owned drop-in, active timesyncd and
NTPSynchronized=no. It checked an existing root-owned executable and its parent,
no unsafe mode or link, no file capabilities and the pinned executable hash.

| Item | Operator-returned value |
| --- | --- |
| Host-reported start | 2026-10-18T10:47:39.085303Z |
| Candidate hostname | ntp.cloudcone.com |
| Returned public IPv4 set | 64.69.34.90 only |
| Fixed target / selection | 64.69.34.90 / first numeric public IPv4, no fallback |
| Route | eth0, source 148.135.106.145 |
| Existing executable | /var/tmp/wepuu-e1g-query-dz1_j5q3/ntpdate |
| Executable SHA-256 | 15ee8392ae97f1bd94979f4c0fe234d2b46003683dcda2e6b1877abfeede9fb4 |
| Client reuse / download / installation | True / False / False |
| Pre-query gates | Passed |

Host-reported UTC is from the unsynchronized guest and is not an independent
UTC reference. The single resolver result pins only this invocation; it is not
a claim that the hostname will retain that address permanently.

The helper used nobody (UID/GID 65534), required zero effective/permitted/ambient
capabilities, and applied no-new-privileges before invoking the existing client:

```text
ntpdate -4 -q -u -p 1 -t 3 64.69.34.90
```

The [Ubuntu client documentation](https://manpages.ubuntu.com/manpages/jammy/man8/ntpdate.8.html)
defines -q as query-only and -u as an unprivileged outgoing port. The client,
capture filter and result validator used the same fixed numeric target without
another DNS lookup by the client. Server-side watchdogs bounded the query to
15 seconds and capture to 120 seconds, with a 200-packet cap. Only one query
launch was attempted; no second source or automatic retry was used.

## Actual query and observation

| Check | Returned result |
| --- | --- |
| Session status | e1h_single_query_observation_complete |
| Client exit / runner | 0 / OK |
| Client classification | VALID_SAMPLE_REPORTED |
| Valid sample / server | True / 64.69.34.90 |
| Stratum | 3 |
| Offset, server minus WordPress host | -41.055324 seconds |
| Reported delay | 0.02667 seconds, 26.67 ms |
| Parsed outbound / candidate inbound packets | 1 / 1 |
| Reversed tuple | Observed; local port 60926, remote port 123 |
| UDP payload lengths | 48 bytes in each direction; payload not saved or printed |
| Capture statistics | 2 captured, 2 received by filter, 0 dropped by kernel |
| Unparsed / other output | 0 / 0 |
| Explicitly ignored blank lines | 1 |
| Coverage limited | False |
| Observation duration | 2.313 seconds, monotonic timing |
| Capture exit / timeout | 0 / none reported |
| Path conclusion | CANDIDATE_IPV4_QUERY_RESPONSE_VALIDATED |

The client accepted one sample, and the target-only observation supports an
outgoing request plus matching reverse flow. The reported offset means the
WordPress host was approximately **41.055 seconds ahead of this candidate**.
This is one unauthenticated NTP exchange, not independent proof of absolute UTC
accuracy, a sustained offset, or which clock was wrong at an earlier failure.

This new helper classifies genuinely empty/whitespace-only output separately.
It still marks unknown nonempty output as coverage limited. The earlier E1G
unparsed line is not reclassified retroactively because its raw text was not
retained. E1G's limited observation and INCONCLUSIVE result remain intact.

## Interpretation and unchanged-state postchecks

The candidate's IPv4 UDP/123 request and return path worked for this client in
this window. A blanket claim that all IPv4 NTP exchanges from this host are
blocked is therefore unsupported. This does not establish that other NTP
destinations work, identify why 91.189.91.157 did not yield a valid sample, or
prove a specific local/provider/upstream firewall decision. The tests occurred
at different times and are not a simultaneous controlled firewall A/B test.

The client ran as nobody, not as systemd-timesyncd. Its success does not prove
that the daemon's selected source, service restrictions or synchronization will
work without a separate repair and acceptance. The earlier selected-IPv6 route
failure remains limited to that route; it is not explained away by this result.

Returned postchecks:

- Configuration and daemon identity unchanged; E1F rollback baseline preserved.
- Software package database and route unchanged.
- NTPSynchronized=no before and after; daemon acceptance not proven.
- No package download/installation, configuration write, service restart or
  manual clock setting. The query explicitly did not set the system clock.
- No firewall, Cloudflare, WordPress/Connector, pairing, OAuth, mail, platform
  database, Grant or Outbox action. Their historical statuses are retained,
  not represented as newly queried in this network-only check.

The helper owns only its query/capture processes and reaps them on exit. The
root-protected receipt was saved at:

```text
/root/wepuu-e1h-cloudcone-query/result.json
```

The exclusive run directory prevents silently repeating this authorization.
It and the reused E1G executable are retained; no cleanup/deletion is claimed.
No packet payload, raw child output, identity secret or website data is stored
in this document or sent to the platform.

## Local validation, delivery and next boundary

The standalone helper and exact PuTTY wrapper passed **40 local synthetic tests**
and syntax validation. Coverage includes deterministic IPv4 selection, DNS errors,
old-target exclusion, target consistency, hash/ownership/mode/capability gates,
capture-start failure with no query, one-launch timeout/error cleanup, duplicate
run refusal, dynamic local ports, unknown-output redaction, blank-line handling
and unchanged-state requirements. These tests are not production observations.
The operator-returned JSON above provides the separate production evidence.

This document-only candidate starts from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. No application/runtime/protocol/schema
change, migration or new product ADR is involved. Helpers remain local. User
worktree changes, design/ and the homepage prototype are untouched and unstaged.
Hosted CI validates document integration; it cannot certify NTP synchronization.

The next minimal repair candidate is to retain systemd-timesyncd and, in a
separately approved maintenance window, configure a currently verified reachable
IPv4 source, with backup, bounded synchronization observation and a scoped
configuration rollback. Recheck DNS applicability and the live offset then;
do not assume this IP is permanent or that the old maintenance window is valid.
Normal synchronization may step the clock backwards and requires explicit
acceptance of that risk. No source configuration or repair is performed here.

The operator may add the successful candidate exchange to the existing CloudCone
ticket while still asking about the failed external target; no ticket is sent
or cancelled here. Do not open inbound UDP/123 blindly, use ntpdate without -q,
manually set time, widen Proof tolerance or reconnect WordPress. Any subsequent
clock repair and any later identity recovery/pairing need separate authority.

References: Draft PR #80 and its E1G record; PR #79 preserves failed IPv4 repair
and rollback; PR #77 preserves the latest pairing failure. This query does not
establish the historical first pairing root cause or fail-time clock offset.

```text
P3E1H_DIAGNOSTIC_COMPLETE=True
P3E1H_CLOUDCONE_NTP_QUERY_EXECUTED=True
P3E1H_CLOUDCONE_NTP_RESPONSE_VALIDATED=True
P3E1H_IPV4_BLOCKING_LAYER_IDENTIFIED=False

P3E1F_WORDPRESS_TIME_SYNC_REPAIR_PASS=False
P3E1F_ORIGINAL_CLOCK_CONFIGURATION_RESTORED=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after evidence delivery. No automatic repair, new query or pairing.
