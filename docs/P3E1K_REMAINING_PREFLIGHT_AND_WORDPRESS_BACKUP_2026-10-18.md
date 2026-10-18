# P3-E1K: remaining preflight and protected WordPress backup

Date: 2026-10-18, Asia/Shanghai. **Phase-one preflight and the new WordPress
backup passed. Identity deletion and a new pairing were NOT_RUN.** This is a
new checkpoint, not a rewrite of the earlier Session gate stop or login recovery.

## Authority and evidence provenance

The operator approved only the remaining E1K checks, protected WordPress-host
backup and evidence submission. The operator confirmed the same P3-D5 account
and original Home Tenant in the already logged-in browser, including refresh
persistence, and confirmed that plugin/theme/schema updates were paused during
backup. No new OTP send, login recovery or additional pairing was authorized.

The assistant directly collected platform metadata through existing SSH to
5.255.99.225. Batch SSH to WordPress host 148.135.106.145 remained blocked by
an interactive prompt; no credentials were requested. The operator ran the
reviewed host-bound commands in PuTTY and returned sanitized WordPress results.
Their backup integrity/permission claims are therefore **operator-executed
helper evidence**, not an assistant filesystem inspection of WordPress.

Fixed target: https://www.wepuu.com and exact resource
https://www.wepuu.com/wp-json/wp-auto/mcp. Control origin and issuer both remain
https://auth.wpauto.cc. No alternate hostname, Tenant or account was substituted.

| Checkpoint | Recorded UTC | Asia/Shanghai |
| --- | --- | --- |
| First direct platform pass | 2026-10-18T13:16:14.384983Z | 21:16:14 |
| Operator WordPress read-only check start | 2026-10-18T13:41:29.948377Z | 21:41:29 |
| Refreshed direct platform gate before backup | 2026-10-18T13:42:37.391488Z | 21:42:37 |
| Operator backup completion | 2026-10-18T13:52:34.465950Z | 21:52:34 |
| Direct platform postcheck | 2026-10-18T13:55:57.887835Z | 21:55:57 |

These are host-reported times. Durations and local step detection use monotonic
time, and comparison precision is bounded below. No historical fail-time clock
offset or first-pairing root cause is inferred.

## Platform, account and dependency gates

The original P3-D5 account, Home Tenant, active/verified status and owner mapping
matched inside protected checks; an unexpired Session remained available before
and after backup. Browser identity is separately operator-confirmed; no browser
Cookie/Session-ID comparison or credential inspection is claimed.

| Gate | Actual result |
| --- | --- |
| Five scoped services / startup | Healthy; fixed digests and direct Control command match |
| Migrations | Exact accepted hashes for 001-013 plus 015; no 014 |
| Sending protections | Actual and persisted false; public/origin empty send/resend POSTs 503; raw Better Auth send 404 |
| HMAC | Protected bytes/custody and read-only mount match; no secret/hash exported |
| Global target-resource Site count, all states | 0 |
| Current local full Site-ID digest match, platform Sites / Grants | 0 / 0 |
| Target Tenant Grants, all states | 0 |
| Target-resource attempts | Exactly the two historical failed/verification_failed attempts, unchanged |
| Existing active platform Sites / Grants | 1 / 1, the protected Site A and replacement Codex Grant |
| Undelivered events for active Sites | 0; historical failed events retained, not resent |
| Site A Connector | Unchanged accepted connection/revocation digests, active/v2/sequence 0 |
| Protected Site/Grant/Outbox/Pairing/migration digests | All unchanged across before/prebackup/after snapshots |
| Site B | Historical revoked/delivered state unchanged; labelled containers/volumes/networks and project directory absent, port 3201 free |

Fixed runtime references, not newly deployed images:

```text
Control:
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization:
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

The existing observer had SELECT access and `row_security_active=false` for
the three inspected platform tables **for that observer**. Queries were
read-only and bounded by statement/subprocess timeouts. This confirms global
inspection coverage, not that table RLS was disabled. No role, policy, RLS or
permission was changed.

All five stored Site public keys were inspected as public-only Ed25519 JWKs;
the helper compared SHA-256 of decoded 32-byte public material and the full kid
digest with the current WordPress public identity. Neither matched any platform
Site, including historical states. This uses canonical key material, not
arbitrary JSON bytes or kid alone. Combined with exact resource/Site-ID queries
and zero related Grants, no platform business binding was found. This is
metadata reconciliation, not a new signature/Proof verification.

The final platform resource sample reported MemAvailable 789,832 KiB and memory
full avg10 0.63, within the helper's reviewed thresholds; no new OOM or unexpected
restart was found. These are bounded samples, not continuous monitoring.

## WordPress identity, plugin and time checks

The helper used global SHORTINIT/DISABLE_WP_CRON bootstrapping, restricted
read-only SQL and local parsing, without calling state-writing connection,
Grant-resolution or identity-creation methods. Private key consistency was
checked on-host through sodium; no secret key or secret-key digest was exported.

| WordPress gate | Result |
| --- | --- |
| Home / SiteURL / saved resource / origin / issuer / Tenant | All exact expected bindings |
| Local connection / identity | Active, identity exists and matches connection; matches E1D-after/E1I baseline |
| Current Site-ID digest prefix | 5c6db167294a |
| Current identity-kid digest prefix | c231e2ebe104 |
| Keypair consistency / platform public-key pins | PASS; saved PEM bytes hashed without normalization |
| Pending state | Absent |
| Revocation | v2, sequence 0, deny_all=false, consistent Site binding |
| Grant / token / key deny markers | 0 / 0 / 0 |
| Literal `wp_auto_connector_grant_` Option family | 0 mappings; zero markers alone was not used to establish this |
| Plugin artifact | 789 regular files match the original accepted ZIP |
| Before/after relevant state and plugin inventory | Unchanged |
| Website root / login HTTPS HEAD | 200 / 200 |

Original ZIP SHA-256:
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
The complete path/file-hash manifest digest was
`9913b16e56fe89f397d127e77e9577bc2d870877148c0088b2733a2cd44ccc52`.
Its deterministic input is sorted UTF-8 relative path, NUL, lowercase file
SHA-256 and LF for every file. File count and digest must both match, and links
or special files are rejected. No plugin file was installed, replaced or edited.

The original generated transport failed Base64 decoding before executing checks:
its generator globally replaced a `SHA` placeholder that also occurred inside
the encoded payload. The assistant reproduced the same invalid 61,869-character
payload locally; it was **not established as operator paste damage**. V2 uses
explicit concatenation, complete emitted-payload roundtrip verification and
fixed error projection. It sends the full manifest's aggregate digest, preserving
all-file coverage while reducing transport size. No failed business check was
retried or bypassed by this transport correction.

Timesyncd remained active/synchronized at 64.69.34.90 with normal Leap, stratum 3,
offset -2.002 ms and root distance 48.225 ms. Packet count 9 and the same update
key identify a latest stored sample, **not new queries or distinct updates**.
The daemon identity was unchanged since E1I. In the bounded current-boot/24-hour
journal window, 158 entries included 152 timeouts; monotonic timestamp splitting
placed all 152 before E1I, zero after it and zero undated. One initial sync was
visible and no classified clock/set failure. This is not a claim that missing
or unclassified historical logs prove the absence of all clock anomalies.

Five complete numerical bracket samples passed at the initial check and five
more passed after backup. Every interval contains zero and lies within +/-3 s:

| Sample | Initial WordPress-minus-Control interval, s | After-backup interval, s |
| --- | --- | --- |
| 1 | [-0.827448, 1.172552] | [-1.234605, 1.765395] |
| 2 | [-0.683086, 1.316914] | [-1.076084, 1.923916] |
| 3 | [-0.553040, 1.446960] | [-0.927021, 2.072979] |
| 4 | [-1.401833, 1.598167] | [-0.806173, 1.193827] |
| 5 | [-1.291323, 1.708677] | [-0.690503, 1.309497] |

The reference was TLS-verified direct-origin auth.wpauto.cc HTTP Date mapped to
5.255.99.225, with a 1-second allowance at each endpoint and recorded ~1.11-1.17 s
communication/execution windows. Local realtime-minus-monotonic changes were
2-3 microseconds. PHP CLI time lay within its host before/after samples. This
is not direct PHP-FPM sampling or a direct cross-host Node clock measurement.
Separately, direct Control Node v26.7.0 timestamps lay inside the platform host
brackets (~131-138 ms), without changing the HTTP-Date evidence's precision.
The backup helper also reran pre-backup clock gates; its detailed precheck
receipt remains host-local and is not counted as another exported numerical set.

## New protected backup and verification

The operator confirmed no plugin/theme/schema updates were in progress during
backup. This is an explicit consistency assumption, not continuous DDL tracing.
The helper rechecked WordPress gates before creating an exclusive run marker
and new backup, and compared state, plugin inventory, wp-config bytes and
business master-process identities afterward. It did not reuse an old backup.

```text
Backup: /root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7
Receipt: /root/wepuu-e1k-backup-run-a931ba4ba8a7
```

The operator-returned result reports root ownership, directory 0700, regular
backup files 0600, server-side PHP syntax check, 32 InnoDB tables exported using
single-transaction/quick/no-table-lock flags, nonempty dump, full gzip integrity,
tar readability and each archived regular file's content hash verification.
Temporary database credentials were removed; they were not placed in argv or
output. Backup contains the WordPress database and current Connector/wp-config,
including identity/connection/revocation Options, and remains on the WordPress
host outside the web root. No backup, SQL, raw Option or content was uploaded.

| File | SHA-256 |
| --- | --- |
| database.sql | 8ad1d98f5da93cfce2d9c00ce1ac871cac814f8fe37bdd80272b257d3c14eeb3 |
| database.sql.gz | 518a3600bcc9fbfe7f5b651d764337891d7df2db91da0faf623327a5020b2934 |
| connector-config.tar.gz | 19c04dc8064b586cf2ae87d00fbb76d6f6052f2dbebcd19721be64664ec06a45 |
| backup.php | cb2c3d79296cd91ee4b46c8ac528671eaae44966fcebe7f86c33d32483fdcd6f |

Complete backup-command SHA-256:
`35eae36d3e577dfeff0d593499a0ad743468e5e32fe32230885811fb9061e18c`.
The original operator backup attachment SHA-256 was
`0072d06e58ecb8cb7a5a9b96c7906cf8149bee78e801a22fd3c880fac64cd2c1`;
a single leading `)` outside its JSON was treated as terminal text, not executed.
No JSON fields were altered. The earlier read-only attachment SHA-256 was
`27289c36201b6d1b99d3db6e9aad97a155f498d2074f96f4278068013b648cd0`.

This verifies backup creation, integrity and readability, **not a full disaster
recovery drill, independent production restore or guaranteed lossless identity
restoration**. No database restore or manual SQL/Options change occurred.

## Validation, phase-one outcome and hard stop

Local focused suites passed: 19 read-only/transport tests, 10 backup tests and
50 retained E1I utility tests. Coverage includes binding/dependency failures,
malformed state, timeout without retry, secret sentinels, complete transport
decode, all-file manifest changes, exclusive files, credential ownership/cleanup,
archive content/path/link rejection and the absence of repair/pairing calls.
The Windows exclusive-write test mocks the unavailable O_NOFOLLOW constant only
in the test; production retains POSIX O_NOFOLLOW without a fallback. No local
PHP runtime pass is claimed; the server syntax check passed. The private
helpers remain outside tracked application/runtime source. Hosted repository
CI and `git diff --check` are reported separately and do not replace production
or operator evidence.

Append only this independent record to Draft PR #83 on its existing clean
worktree. Retain the original blocked and separately authorized login records.
No app source, public API, protocol, migration, dependency, runtime image, NTP,
firewall, certificate, Connector code, design/ or user dirty file was changed.
The platform continues to receive only control metadata, never WordPress
content or MCP inputs/outputs.

All approved phase-one gates now pass. The scene is still **WordPress local
active / no successful platform Site binding**, with the same current identity.
No Enable, Connect, Disconnect, new Proof, OAuth/MCP or OTP send occurred in this
remaining-preflight/backup operation. No new Site, Grant or Outbox event appeared.

This checkpoint permits presenting the identity-change impact for a separate
decision, not executing it. Normal Disconnect would delete current pending,
connection settings and Site Identity; it can leave the old revocation Option.
Enable does not restore the deleted identity. A later new Proof handler may
create a new identity and initialize local revocation/active state before
platform acceptance, so failure may again leave split state. No automatic
restore, cleanup, retry or success guarantee follows from the backup.

**Stop after report and CI.** Do not request or execute Connect in this task.
Any later identity deletion and one pairing require new explicit authorization
against this identity/dependency checkpoint and a fresh drift/Session/time check.

```text
P3E1K_PREFLIGHT_PASS=True
P3E1K_LOCAL_BACKUP_VERIFIED=True
P3E1K_EXISTING_ACCOUNT_LOGIN_RECOVERED=True
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
