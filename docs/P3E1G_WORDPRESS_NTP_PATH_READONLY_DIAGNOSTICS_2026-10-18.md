# P3-E1G: WordPress NTP path read-only diagnostics

Date: 2026-10-18, Asia/Shanghai. **Read-only diagnosis complete; no repair or
pairing.** Main conclusion: **LOCAL_ROUTING_ISSUE**, limited to the currently
selected IPv6 destination. The earlier IPv4 failure remains unexplained.

## Evidence and conclusion boundary

The operator executed the one-shot collector in the existing root PuTTY session
on the intended WordPress host and returned sanitized JSON. At host-reported
2026-10-18T05:26:17.256474Z (monotonic 6025315.382 s), it showed:

| Observation | Result |
| --- | --- |
| Host address matches intended host | True |
| systemd / timesyncd package | 249 / 249.11-0ubuntu3.23 |
| Service | loaded, active, running; MainPID 1692724 |
| NTP enabled / synchronized | yes / **no** |
| Effective SystemNTPServers / LinkNTPServers | empty / empty |
| Effective fallback | ntp.ubuntu.com |
| Currently selected address | **2620:2d:4000:1::41** |
| Route lookup for that address | **NETWORK_UNREACHABLE**, exit code 2 |
| Collector, PID 1 and timesyncd network namespaces | SAME |
| Daemon packet count | 0; not a NIC receive or transmit counter |
| Poll interval | 34 min 8 s; configured range 32 s to 34 min 8 s |
| Configured maximum root distance | 5 s; not a measured current root distance |
| Existing timesyncd socket visible in this snapshot | None; not proof it never creates one |
| PrivateNetwork / IPAddressAllow / IPAddressDeny | no / no nonempty allow restriction / no nonempty deny restriction |

**Directly established:** the selected IPv6 destination has no usable route
according to the host route lookup in the daemon's network namespace. This
identifies a local routing-layer obstacle for that destination at observation
time. It does not identify why IPv6 routing is missing, prove that every NTP
attempt selected IPv6, or explain the previous IPv4 experiment.

The selected address is ::41, not the ::40 from an older preflight. No old
address was substituted for the live selection. RestrictAddressFamilies was
nonempty; that boolean alone does not prove that a required family is denied.
The collector did not evaluate the complete restriction contents.

**Not established:** a specific local NTP firewall drop, a cloud-provider filter,
an upstream outage, the current relative clock offset, independent absolute UTC,
or the offset at the failed Pairing Proof's validation time. Host UTC and journal
timestamps are self-reported by an unsynchronized machine.

## Configuration continuity and service history

The E1F owned live drop-in remained absent. The effective configuration's full
raw-byte SHA-256 matched the restored E1F baseline:

```text
f674fba81b81f3c3f19a0a169505e8b68a6b446565ea05ced278902ac9bab4df
```

No configuration was reapplied or rolled back in E1G. Existing backups and the
retired E1F drop-in copy remain outside this operation's mutation scope.

The bounded existing-journal query covered the current boot, the host's recent
24-hour window, and at most 2000 entries. It returned **172 entries**, all
classified REPLY_TIMEOUT; no malformed entries or entry-limit truncation were
reported. Their host-realtime range was 2026-10-17T05:28:14.809034Z through
2026-10-18T05:08:36.558938Z; monotonic microsecond range was
5939032933669 through 6024254683578.

Last successful synchronization is **NOT_CONFIRMED**, not "never occurred."
The classifier and configured log level limit conclusions. The returned summary
does not associate every historical timeout with ::41 or a particular family.
No debug logging was enabled and no raw message was exported.

Upstream [systemd v249 receive processing](https://raw.githubusercontent.com/systemd/systemd/v249/src/timesync/timesyncd-manager.c)
increments the sample counter only after multiple response checks. Thus zero
does not independently prove no packet reached the host. Upstream behavior is
supporting interpretation, not a claim that Ubuntu's complete downstream source
and patches were inspected in this task.

## Firewall coverage and passive-observation decision

The host reported UFW active and both iptables frontends using NF_TABLES.
The nft snapshot contained **77 chains and 340 rules**; the iptables and
ip6tables views contained **224 and 116 rules**, respectively. These are
compatibility views and must not be added together as independent evidence.

Returned base-hook metadata included input/forward drop policies and output
accept policies. Neither a default input DROP nor an output ACCEPT establishes
the effective decision for an actual NTP flow through all chains.

The collector inspected bounded command output in host memory and returned
limited rule projections, not complete rule semantics. Rule summaries and nft
counter coverage were explicitly truncated. Jumps, omitted predicates and
uncovered tc/eBPF or other security components preclude an end-to-end rule-path
claim. Existing broad counters are not attributable to NTP.

Local firewall verdict: **NOT_CONFIRMED**. It is not "NTP blocked" and not
"firewall excluded." A before/after counter experiment was **NOT_RUN**, because
the optional observation window did not start.

Tcpdump was installed and CAP_NET_RAW was present, but passiveCaptureReady was
**false**: the selected IPv6 target had no usable route or confirmed egress
interface. Therefore the confirmation/capture stage was **NOT_RUN**. No capture
was started, no alternative interface or IPv4 destination was substituted, and
no additional confirmation or active probe was requested merely to produce
traffic. The agreed maximum remained 120 seconds; no longer wait was performed.

## Provider evidence and remaining hypotheses

Cloud-side instance policy is **PROVIDER_UNVERIFIED**. No logged-in CloudCone
instance settings or existing support-ticket evidence were supplied/read. No
new API credentials or support ticket were requested or created.

The [CloudCone NTP article](https://help.cloudcone.com/en-us/article/how-to-synchronize-time-with-ntp-on-cloudcone-servers-1tt72al/)
lists ntp.cloudcone.com and is dated 2020. It is a provider-published candidate
for a later authorized investigation, not proof it is reachable from this
instance, private/internal, or an approved replacement under the present scope.
Its install, immediate-clock-setting and configuration-edit instructions were
not executed.

The public [CloudCone firewall description](https://cloudcone.com/firewall/)
describes incoming UDP/TCP control. It cannot establish the current instance's
outbound or return UDP/123 policy. No claim that CloudCone blocks NTP is made.

## Execution safety and validation

Host-local sanitized evidence was saved by the collector to a root-owned 0700
directory with 0600 evidence file:

```text
/root/wepuu-e1g-evidence-20261018T052617Z-54a751d6/preflight.json
```

These observations are **operator-executed/returned evidence**, not assistant SSH
measurements. Command deadlines were 15 seconds each with an overall 180-second
collector budget. No installation, NTP probe, source switch, restart, config or
firewall change, clock setting, database access, WordPress initialization,
Options/private identity read, Proof, OAuth, email or MCP operation occurred.
Normal pre-existing daemon traffic was not disabled or modified.

No WordPress content or secrets entered the control plane. Original command
stdout/stderr, raw firewall configuration, packet payloads, process environments
and journal messages were not submitted to GitHub. Existing Site/Grant/Outbox,
application images and OTP pause states are carried forward from earlier
evidence, **not freshly reverified by this host-network collector**.

Local standard-library tests: **32 PASS**, including timeout/output limits,
missing tools and permission failures, log truncation, secret sentinels,
IPv4/IPv6 endpoints, dynamic local ports, broad DROP non-attribution, candidate
responses without daemon acceptance, source mismatch and capture-buffer drops.
Python syntax checks passed. These are synthetic collector tests, not a real
packet-capture test or a production clock-repair pass. One real operator-returned
host collection was reviewed. Hosted CI is documentation integration only.

The sole tracked change is this document, from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. No runtime, schema, dependency or
protocol changed; no product ADR or migration is required. Collector/test helpers
remain local, outside the document-only candidate. User changes and design/
remain unstaged and untouched. Earlier failures in #77, #78 and #79 are retained.

## Next minimal step and final status

### Separately authorized IPv4 read-only follow-up

After the initial E1G conclusion, the operator authorized the suggested IPv4
path diagnosis. This did not authorize installation, active NTP probes, clock
setting, a source change or a service restart. A subsequent operator-executed
PuTTY collection at host-reported **2026-10-18T05:40:11.660396Z** returned:

| Check | Result |
| --- | --- |
| Route to 91.189.91.157 | OK, eth0, source 148.135.106.145 |
| Route to 185.125.190.56 | OK, eth0, source 148.135.106.145 |
| Daemon source before/after collection | Unchanged: 2620:2d:4000:1::41, not IPv4 |
| Daemon PID/start identity | Unchanged; same PID 1692724 |
| Address-family list | AF_INET, AF_INET6, AF_UNIX; non-inverted list |
| Configuration / E1F owned drop-in | Matches rollback / absent |
| Synchronization / visible daemon socket | no / none in this snapshot |
| Probe / capture / restart / configuration change | None |

Both route lookups succeeded. The reported routeType=UNSPECIFIED means the JSON
row omitted a recognized type field, not that the kernel route query failed.
Route success does not test UDP delivery or return traffic. The address-family
list does not indicate an explicit AF_INET exclusion in that returned setting;
it is not proof that every sandbox/security path permits NTP.

The compatibility-view follow-up traced reachable IPv4 INPUT/OUTPUT chain
references and projected possible UDP rules. It showed an OUTPUT ACCEPT policy,
an ACCEPT for UDP NEW in ufw-track-output, and ESTABLISHED/RELATED ACCEPT rules
in ufw-before-input/output. These are useful observations, not a complete
effective-rule decision for an actual NTP packet. Projection was truncated,
match semantics were not fully evaluated, and native nft/tc/eBPF/cloud paths
remain outside that projection. Broad INVALID drops and INPUT counters cannot
be attributed to NTP; no NTP-specific drop was proven and local filtering was
not completely excluded.

The daemon remained on IPv6. No current IPv4 exchange was observed or forced,
and a passive window was not used to manufacture a failed IPv4 test. IPv4
follow-up conclusion: **INCONCLUSIVE**. This does not alter the earlier
LOCAL_ROUTING_ISSUE finding for the selected IPv6 path.

Protected follow-up evidence:

```text
/root/wepuu-e1g-ipv4-20261018T054011Z-00c666c2/readonly.json
```

The operator also confirmed ntpdig, ntpdate and sntp were **not installed**;
tcpdump was installed. The inventory performed no probe or configuration change.
No query client was installed or replaced, and no ad-hoc NTP request was
constructed. Existing read-only authorization is exhausted without a definitive
IPv4 failure cause. A later active diagnostic must explicitly authorize a
reviewed query-only tool and a fixed target/bounded query, without automatic
clock adjustment, daemon installation/start/stop or source/configuration change.
Tool absence does not imply that a provider blocks UDP/123.

The operator clarified that www.wepuu.com is behind Cloudflare's website proxy,
while 148.135.106.145 is the origin host. This task inspected that origin, not
the website's proxied DNS addresses. Ordinary website proxying is not a proxy
for the host's outgoing NTP requests; no DNS/WAF/TLS setting was changed. See
[Cloudflare's default HTTP/HTTPS proxy ports](https://developers.cloudflare.com/fundamentals/reference/network-ports/).
Any separate host-level tunnel or egress product was not established here.

The IPv4 helper added **12 passing local synthetic tests** for target-host
guarding, read-only commands, source/PID drift, chain traversal, negated protocol
matches, counter stability and secret redaction. Combined with the original
32 collector tests, the local result is **44 PASS**. This is still not a real
IPv4 NTP query, packet-capture test or clock-repair acceptance. The supplement
is a new commit on the existing Draft PR; the initial evidence remains in history.

No further production command is required to close E1G with the bounded finding.
Stop without repairing routing, changing sources, retrying IPv4, installing a
daemon, extending capture, adjusting Proof tolerance or reconnecting WordPress.

A separately authorized next task should first choose a concrete path: either
review the reason for missing IPv6 routing without assuming IPv6 enablement is
needed, or investigate an explicitly approved IPv4 NTP destination and its full
host/cloud return path. The earlier IPv4 failure still requires evidence; merely
pinning IPv4 again is not an established fix. Provider source applicability and
instance UDP policy should be confirmed before proposing that alternative.

diagnosisComplete is True because the planned stages were executed or have an
explicit gating/availability explanation. blockingLayerIdentified is True
**only for the currently selected IPv6 destination's local route**. It does not
mean the complete cross-family NTP outage has a single proven cause. Preserve
the local-active/platform-unbound identity; pairing recovery needs separate
authorization after any later clock repair and acceptance.

```text
P3E1G_NTP_PATH_DIAGNOSIS_COMPLETE=True
P3E1G_NTP_BLOCKING_LAYER_IDENTIFIED=True
P3E1G_BLOCKING_LAYER_SCOPE=SELECTED_IPV6_ROUTE_ONLY
P3E1G_IPV4_FAILURE_CAUSE_IDENTIFIED=False
P3E1F_WORDPRESS_TIME_SYNC_REPAIR_PASS=False
P3E1F_ORIGINAL_CLOCK_CONFIGURATION_RESTORED=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
