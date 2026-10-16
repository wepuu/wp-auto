# P3-E1E: WordPress / Control read-only clock diagnostics

Date: 2026-10-16, Asia/Shanghai. **Read-only diagnostic complete; no clock fix or
new pairing.** Measurement timestamps below explicitly use UTC; the cross-host
sampling window was approximately 23:04:18–23:04:30 Asia/Shanghai by the Control
origin reference, not by the unsynchronized WordPress clock.

## Findings and confidence

- Seven bracketed samples consistently place WordPress PHP ahead of the Control
  origin clock. The conservative envelope is **+38.498205 to +41.998916 seconds**.
  Every individual lower bound is well above the verifier's five-second future
  allowance. This is a relative, indirect-origin-clock measurement, not an
  independent calibration to absolute UTC.
- WordPress reports systemd-timesyncd active but NTPSynchronized=no and packet
  count 0. Its selected IPv6 source has no kernel route. The bounded journal
  summary includes 124 NTP reply timeouts. This is an actionable synchronization
  fault to investigate on the WordPress host; it does not prove that every
  historical timeout used the same source or identify a firewall/ISP cause.
- Control reports systemd-timesyncd active and synchronized. Its existing IPv4
  upstream reported a millisecond-scale offset. Node and host brackets show no
  seconds-scale discrepancy; source-origin HTTP Date agrees within its precision.
- The observed relative offset is sufficient in magnitude to explain a future-iat
  rejection if it also existed when signing/validating. The failed attempt was
  several hours earlier. No original Proof/iat was retained, so the failure-time
  offset and historical first pairing root cause remain **unconfirmed**.

Reference failure: [Draft PR #77](https://github.com/wepuu/wp-auto/pull/77),
successful evidence CI [38869416745](https://github.com/wepuu/wp-auto/actions/runs/38869416745).
At `2026-10-16T07:42:15.699Z`, that attempt emitted proof / proof.claims_invalid /
claims.time_future. Neither the failure nor current local-active/platform-unbound
scene was retried or reset during E1E.

## Scope, provenance and data flow

Control stayed on:

```text
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
```

The assistant used read-only SSH and docker exec for clock observation on the
Control VPS. WordPress SSH still required interactive authentication, so the
operator ran read-only collectors in their already-authenticated PuTTY session
and returned safe JSON. Those WordPress observations are operator-executed,
not represented as direct assistant SSH observations.

Collectors did not load WordPress, read Options/private identity, access a
database, request/sign/replay a Proof, call MCP, read authentication artifacts,
send email, install/start/restart a service, or change configuration. Only clock,
runtime, existing synchronization metadata, fixed-category journal summaries,
kernel route lookup and existing content-free health responses were used. No new
public NTP request or network reachability probe was sent. A route lookup is not
a UDP/123 connectivity test. No WordPress content entered the control plane.

No runtime API, schema, interface, dependency, tolerance or source code changed.
The only tracked change is this diagnostic record, on an independent branch from
main `e8778da33d850303d1ccbdfbebf088610bf6ac5f`. User dirty files and design/ remain
untouched. No PR was merged and no service image was published or deployed.

## Runtime time sources and timezone interpretation

The fixed Connector ZIP SHA-256 remains
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
Its previously hash-matched SiteProofSigner uses DateTimeImmutable, sets the
microsecond component to zero through whole_second(), and passes the DateTime
to the reviewed JWT builder's issuedAt/expiresAt methods, with a 60-second TTL.
No signer invocation or synthetic/new Proof was needed for this inspection.

The deployed production-baseline verifier computes:

```text
now = floor((expected.now ?? new Date()).getTime() / 1000)
reject future time when iat > now + 5
```

The production construction uses the default runtime clock rather than an
injected test timestamp. NumericDate and Date.getTime() represent Unix time;
UTC/local display strings are not compared. CLI PHP's default PRC timezone and
the Control host's America/Los_Angeles timezone are not themselves evidence of
an eight-hour protocol offset. PHP explicitly displayed in UTC and microtime
matched the WordPress host in the local brackets. This does not independently
replay every FPM signing/runtime path or an ambiguous DST boundary.

| Observation | WordPress host | Control VPS/container |
| --- | --- | --- |
| OS timezone | Etc/UTC | America/Los_Angeles |
| Runtime | PHP CLI 8.2.28 | Node v26.7.0, runtime timezone UTC |
| PHP default timezone | PRC | Not applicable |
| Existing sync daemon | systemd-timesyncd active/running/enabled | systemd-timesyncd active/running/enabled |
| NTP enabled / synchronized | yes / **no** | yes / **yes**, before and after sampling |
| Selected source | ntp.ubuntu.com, `2620:2d:4000:1::40` | ntp.ubuntu.com, `185.125.190.58` |
| Existing daemon-reported statistics | packet count 0; no measured offset available | stratum 2, leap normal, offset -4.163 ms, root distance 4.897 ms, delay 7.996 ms, jitter 2.200 ms, packet count 49 |
| Poll interval | 34 min 8 s | 34 min 8 s |
| chrony/ntp alternatives | units absent; chronyc/ntpq unavailable | listed alternative units absent; chronyc unavailable |
| Boot timestamp reported by host | 2026-08-09T11:44:21Z | 2026-04-18T08:10:13Z |

The daemon's reported offset is an existing synchronization observation, not an
independently authenticated UTC calibration performed by this task. WordPress's
boot/log timestamps also use its own potentially inaccurate realtime clock.

### PHP CLI and FPM limits

At WordPress-reported `2026-10-16T15:01:48Z`, PHP microtime and DateTimeImmutable
UTC/Unix representations agreed with the host's execution bracket. Two processes
used the `/www/server/php/82/sbin/php-fpm` executable; its version-only output was
PHP 8.2.28 fpm-fcgi with OPcache. Process arguments, environments, pool secrets
and phpinfo were not read. No FPM request or new public clock endpoint was added.
The actual FPM clock/default timezone/opcache signing execution was **not
directly observed** and must not be inferred from the CLI binary version alone.

### Control host, Node and time namespace checks

Seven direct host-before → container Node Date.now → host-after samples at
14:56:09–14:56:11Z all contained zero in the Node-minus-host offset bracket.
The individual brackets were:

```text
[-105.293, +163.952] ms
[-97.720,  +116.679] ms
[-45.523,  +174.268] ms
[-115.338, +172.468] ms
[-45.438,  +162.653] ms
[-97.424,  +166.554] ms
[-94.270,  +121.567] ms
```

A second seven-sample check at approximately 15:10Z again contained zero in all
brackets, with the envelope [-110.622, +176.363] ms. Neither set is represented
as a sub-millisecond precision measurement. Three direct loopback-origin HTTPS
health responses agreed with the host clock under second-precision Date bounds;
they had HTTP 200 and no Cloudflare Ray header. The existing auth vhost proxies
the Control loopback service. No new diagnostic route was created.

Host and container had different time namespace inode identifiers, but both
reported zero monotonic and boottime offsets. Linux time namespaces do not
virtualize CLOCK_REALTIME; different namespace IDs alone therefore do not
explain a wall-clock skew. See the
[upstream Linux manual](https://kernel.googlesource.com/pub/scm/docs/man-pages/man-pages/+/master/man/man7/time_namespaces.7).
The bounded Control sync-service journal query succeeded and yielded no matching
step/jump or sync-problem categories. This is not proof that no clock adjustment
ever occurred or that every possible clock-changing mechanism was logged.

## Seven relative-offset measurements

Observer: **WordPress host**, with its monotonic clock used for elapsed timing.
Each group read a TLS-verified direct Control-origin health HTTP Date T0,
immediately sampled PHP microtime TW locally, then read origin HTTP Date T2.
TLS SNI/hostname verification remained auth.wpauto.cc; the TCP connection went
directly to the existing production origin, avoiding Cloudflare edge Date.
Non-200, missing/duplicate Date, Cloudflare Ray, nonzero Age, or network errors
would have made a sample inconclusive. There were no automatic request retries.

This adapts the requested bracket technique because direct WordPress batch SSH
was unavailable. T0/T2 are **indirect, second-resolution Control-origin clock
observations, not direct Node values**. Origin/host/Node agreement was checked
separately before and after. It assumes no Control clock step during each short
group, legitimate origin Date generation, and no materially stale hidden cache.
The raw Proof's FPM timestamp is not measured by this procedure.

For each group, a conservative plus/minus 1 second allowance was applied to
each HTTP Date value rather than treating quantization as zero:

```text
WordPress-minus-Control lower = TW - (T2 + 1000 ms)
WordPress-minus-Control upper = TW - (T0 - 1000 ms)
```

Network/command delays are included in bracketing and independently recorded;
the intervals are not computed by subtracting separately pasted date outputs.

| Group | Offset interval (seconds; WP ahead) | Total elapsed (seconds) | Interval width (seconds) |
| --- | --- | --- | --- |
| 1 | +38.935858 to +41.935858 | 1.281437 | 3 |
| 2 | +38.715512 to +41.715512 | 1.262720 | 3 |
| 3 | +38.915396 to +41.915396 | 1.721919 | 3 |
| 4 | +38.702029 to +41.702029 | 1.296806 | 3 |
| 5 | +38.498205 to +41.498205 | 1.265211 | 3 |
| 6 | +39.244773 to +41.244773 | 1.244562 | 2 |
| 7 | +38.998916 to +41.998916 | 1.283811 | 3 |

All seven operator-returned samples were valid under those checks. Individual
HTTPS reads took approximately 591–1058 ms. PHP-versus-local-host brackets all
contained zero (roughly -6.251 to +48.629 ms across groups). The largest local
realtime-versus-monotonic elapsed discrepancy was 0.039 ms, with no visible
WordPress wall-clock jump within a group.

Use the **envelope +38.498205 to +41.998916 seconds** as the reported result;
do not intersect intervals to advertise unjustified greater precision or assume
the offset is constant outside this sampling window. The roughly 40-second
result is far larger than the recorded 2–3 second interval widths, so this is
not inconclusive merely because direct Node-over-SSH sampling was unavailable.
Its indirect-source and no-step assumptions remain explicit.

## WordPress synchronization evidence

The operator's bounded journal query examined 130 existing systemd-timesyncd
entries. The fixed classifier returned **124 ntp_reply_timeout events** spanning
WordPress-reported 00:21:49.807749Z through 14:50:21.307737Z on October 16.
No step/jump or sync-acquired category was returned. The other six messages were
not exported, so this is not a complete semantic review of all historical events.
Log retention, classifier coverage and the host's wrong-clock possibility limit
any negative conclusion or exact alignment to the 07:42 failure.

`ip -6 route get` for the selected `2620:2d:4000:1::40` source returned
NETWORK_UNREACHABLE. This is a local route-table fact, not a sent packet or proof
of UDP firewall behavior. The historical timeout summaries omit source addresses;
they cannot prove that all 124 failures were against this exact IPv6 address.
Service active/NTP enabled does not mean a successful synchronization occurred.

## Relation to the failed proof and next minimal task

| Question | Conclusion |
| --- | --- |
| Actual E1D rejection branch known? | Yes: claims.time_future |
| Current WP-vs-Control relative skew measured? | Yes, indirectly bracketed, WP ahead roughly 38.5–42.0 s |
| Magnitude can trigger the five-second rule? | Yes, if it also exists during signing/validation; proof transport latency still matters |
| Independent absolute UTC fault assigned to one host? | No; synchronized Control is supporting evidence, not an independent calibration performed here |
| Offset at 2026-10-16T07:42:15.699Z directly measured? | No; no historical Proof/iat or simultaneous measurements |
| Historical first pairing root cause confirmed? | No |

Recommend a **separately authorized WordPress-host synchronization repair**:

1. Review the existing time-source configuration and choose approved reachable
   sources; investigate the unusable IPv6 selection. Prefer a narrowly scoped
   source/family remedy over global IPv6 disablement or unrelated network changes.
2. Decide maintenance impact before correction: current evidence suggests a
   roughly 40-second backward correction relative to Control may be needed.
   Consider WordPress jobs, sessions, caches and logging. Do not issue an
   unconditional manual set-time or assume daemon restart cannot step the clock.
3. Back up only relevant synchronization configuration, then authorize the exact
   service/configuration change separately. Verify daemon offset/uncertainty,
   synchronized status and repeat relative samples before considering pairing.
4. Keep the existing local identity/split state, failed attempts and email pause.
   Clock repair alone does not repair consumed pending state. Any later local
   reset and single fresh pairing requires its own explicit scope and approval.

No correction, tolerance expansion, PHP timezone change, new time daemon,
network-rule change, service restart, Pairing Proof or retry is performed by E1E.

## Validation and state

Local review covered fixed-source time generation/validation, sample arithmetic
and sanitized-output boundaries. Seven direct Node/host samples were actually
executed in each of two Control observation rounds; seven cross-host indirect
bracket groups were actually operator-executed. Missing chrony/ntpq alternatives
are NOT_AVAILABLE, not a test failure. No full FPM environment reproduction or
independent absolute-UTC calibration is claimed. Hosted CI validates the
record-only candidate; it must not be called a repeat production pairing PASS.

```text
P3E1E_WORDPRESS_CLOCK_READONLY_OBSERVED=True
P3E1E_CONTROL_CLOCK_READONLY_OBSERVED=True
P3E1E_CLOCK_OFFSET_MEASURED=True
P3E1E_ABSOLUTE_CLOCK_FAULT_IDENTIFIED=False
P3E1E_FAILURE_TIME_OFFSET_CONFIRMED=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
