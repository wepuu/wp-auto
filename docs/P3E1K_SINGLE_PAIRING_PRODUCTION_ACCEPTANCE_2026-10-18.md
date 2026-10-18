# P3-E1K phase two: local identity reset and single production pairing

Date: 2026-10-18, Asia/Shanghai. **Site pairing PASS; OAuth and MCP NOT_RUN.**
This is an independent phase-two record. The blocked Session, separately
authorized login recovery, transport correction and successful phase-one backup
history in Draft PR #83 remain unchanged.

## Authority, fixed target and evidence provenance

The operator approved phase two only after the refreshed platform/WordPress
checks, backup verification and deletion-impact report, explicitly confirming
the original account/workspace and authorizing one Disconnect, Enable and
Connect for https://www.wepuu.com. The approval was tied to the checked identity,
not a blanket authorization for retries or other sites.

```text
Resource: https://www.wepuu.com/wp-json/wp-auto/mcp
Control origin / Issuer: https://auth.wpauto.cc
WordPress host: 148.135.106.145
Platform host: 5.255.99.225
```

The original P3-D5 account and Home Tenant were matched within protected checks;
the account retained active owner membership and a valid Session. Current
browser identity was separately confirmed by the operator. No browser Cookie,
Session Token or email address was inspected or collected.

Platform observations were assistant-executed read-only SSH checks. WordPress
actions and command execution were performed by the operator in the existing
PuTTY/browser sessions, returning sanitized results. This record does not
represent those results as independent assistant filesystem access.

| Checkpoint | Host-reported UTC |
| --- | --- |
| Refreshed platform final gate | 2026-10-18T14:16:37.756526Z |
| WordPress final gate start | 2026-10-18T14:18:37.928792Z |
| Unique new platform Attempt created | 2026-10-18T14:24:52.642755Z |
| Unique new platform Site created | 2026-10-18T14:24:53.895001Z |
| First complete platform postcheck | 2026-10-18T14:29:07.935759Z |
| Final platform protection postcheck | 2026-10-18T14:31:27.935526Z |

## Final gates and retained backup

The refreshed global inspection found no Site or Grant for the exact resource,
old local Site ID or identity public-key material/kid, across all relevant
states. The target Tenant had zero Grants. Exactly the two historical failed
Attempts remained, with no unknown pending/verifying attempt. Existing observer
SELECT access and inactive RLS filtering **for that observer** were checked;
no policy, role, RLS setting or privilege was changed.

The operator's WordPress gate confirmed 789 plugin files still matched the
accepted ZIP and deterministic full-manifest digest from phase one. The old
connection was active, pending absent, no local Grant mappings, revocation v2,
sequence 0, deny_all=false and zero grant/token/key markers. Exact origin,
issuer, Tenant, resource and public-key pins matched; the old identity had not
drifted.

Timesyncd remained synchronized to 64.69.34.90 with normal Leap. Its latest
stored sample had offset -0.356 ms, root distance 31.828 ms and packet count 10;
this was a stored daemon update, not an active query by this operation.
Five WordPress-minus-Control conservative intervals all contained zero and
were entirely inside +/-3 seconds:

| Sample | Interval, seconds |
| --- | --- |
| 1 | [-0.664426, 1.335574] |
| 2 | [-0.503609, 1.496391] |
| 3 | [-1.311912, 1.688088] |
| 4 | [-1.174683, 1.825317] |
| 5 | [-1.068432, 1.931568] |

These used the existing TLS-verified direct-origin HTTP Date bracket with
1-second endpoint allowances, roughly 1.14-1.19-second execution windows, PHP
CLI inside its local host bracket and microsecond-scale realtime/monotonic
agreement. They are not direct cross-host Node/PHP-FPM measurements. No time
configuration, source, daemon or tolerance was changed.

The existing phase-one backup was rechecked, not recreated:

```text
/root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7
```

Operator-returned checks confirmed root ownership, directory 0700, regular
files 0600, no unexpected entry/symlink and all four file hashes matching the
complete phase-one record. Key retained backup hashes:

| File | SHA-256 |
| --- | --- |
| database.sql.gz | 518a3600bcc9fbfe7f5b651d764337891d7df2db91da0faf623327a5020b2934 |
| connector-config.tar.gz | 19c04dc8064b586cf2ae87d00fbb76d6f6052f2dbebcd19721be64664ec06a45 |

All backup contents remain on the protected WordPress host. This verifies the
accepted identity snapshot, custody and integrity, not a new complete recovery
drill or a current whole-site restore point. No backup restoration occurred.

## Actual operator actions and procedural deviation

Before deletion the operator was informed that Disconnect removes connection,
pending and Site Identity; revocation Options may remain; Enable cannot recover
the old identity; and a new Proof can activate local state before platform
acceptance. Failure would not trigger automatic restore, cleanup or retry.

| Step | Result | Evidence / qualification |
| --- | --- | --- |
| Explicit identity-change authorization | COMPLETED | Exact account/workspace confirmation and one-action authorization in chat |
| Local Disconnect once | COMPLETED | Readback: connection=false, identity=false, pending=false; revocation Option remained |
| Enable once | COMPLETED | Operator reported unpaired and Connect button using the supplied original configuration |
| Independent post-Enable readback before Connect | NOT_RUN | Operator clicked Connect before this intermediate checkpoint |
| Connect once | COMPLETED | Operator reported Pairing completed; database delta confirms one new target Attempt |
| WordPress/platform binding reconciliation | PASS | Restricted local reader and direct platform metadata agree |

The operator described the early Connect as accidental. It remained inside the
already granted single-Connect authority, but skipped the planned intermediate
readback. This is retained as an execution deviation, not represented as an
executed test. No second Enable, Connect, Proof probe or replay was performed to
reconstruct the missing checkpoint. Final checks prove the actual successful
binding; they do not retrospectively prove every transient pre-Connect field.

## Pairing acceptance and unchanged protected state

Existing records were compared as complete row-hash multisets: every original
Site and Attempt was retained unchanged, with exactly one additional row in
each set. Grant, Outbox and migration collections remained exactly unchanged.
Separate exact-resource/account/Tenant checks establish that both new rows are
the intended pair, not unrelated additions hidden by aggregate comparisons.

| Acceptance item | Actual result |
| --- | --- |
| New target Attempt | Exactly 1, active, consumed, no failure; original account and Home Tenant match |
| New target Site | Exactly 1, active, protocol 1, exact resource and original Home Tenant |
| Attempt-to-Site reference | Matches new local/platform Site-ID digest |
| New Site-ID digest prefix | 235dc1100e44 |
| New identity-kid digest prefix | c4da574d9692 |
| New canonical Ed25519 public-bytes digest prefix | bc675abdfbd7 |
| Local/platform public binding | Exact full Site-ID, kid and decoded 32-byte public material digests match |
| New identity vs deleted identity | Different public material and kid; old Site-ID digest prefix was 5c6db167294a |
| Issuer / resource / Tenant / Control | Exact configured bindings pass |
| Platform key pins | Exact saved PEM bytes/kid digests match accepted pins without normalization |
| Local identity keypair | Host-local consistency check passed; private material never exported |
| Local lifecycle | active, pending absent, revocation v2 and matching Site ID |
| Local revocation | sequence 0, deny_all=false; grant/token/key markers 0/0/0 |
| Local Grant mappings | 0 |
| New platform OAuth Grants / Outbox events | 0 / 0 |
| Original Site A, replacement Codex Grant and Connector | Unchanged |
| Original revoked Grants, Site B and historical Outbox | Existing rows unchanged; no resend or cleanup |
| Historical failed Attempts | Retained unchanged, including earlier claims.time_future evidence |

The final operator result was e1k_post_pairing_readonly_pass with passed=true,
identityChanged=true and exactPlatformBindingMatches=true. The server check
uses restricted read-only SQL and local parsing/keypair checking; it does not
call state-writing connection/identity/Grant methods or generate another Proof.

The successful Attempt correlationId was OGnLFOORVi4Y0eXk-jmH-rHS. No failure
stage/code/detail occurred or was manufactured for this success. New failure
diagnostic detail is NOT_OBSERVED, not unknown. No original Proof, verifier,
request body, authentication material or raw exception was retained.

### Runtime protection postcheck

Five services remained healthy. Fixed runtime references were unchanged:

```text
Control:
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization:
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

Control still uses direct startup. The other four container identities/start
times match the protected baseline; all five match within the completed
postcheck. No service deployment, recreation or restart was performed here.
Migration hashes remain 001-013 plus 015, no 014. Actual/persisted OTP sending
are false; empty public/origin send/resend probes return 503 and raw Better
Auth send remains 404. HMAC custody/bytes/read-only mount are unchanged, with
no secret digest exported. Budget remains 99, with no new email call.
No new OOM/unexpected restart was found; final MemAvailable was 1,150,184 KiB
and memory full avg10 0.01. These are bounded health samples.

One initial read-only postcheck stopped because its comparison incorrectly
included the pre-login Control container identity from the historical login
snapshot; that authorized login had already recreated Control. The comparison
was corrected to protect the four non-Control baseline identities and compare
all five within the current observation, while retaining fixed-image/startup
gates. This was a local checker correction, not evidence of a new production
restart. No security check was disabled and no production state was changed.

## Validation, scope limitations and stop

Local validation covered ten row-set reconciliation scenarios (one allowed
Site/Attempt addition, old-row mutation, missing or excessive deltas, unchanged
Grant/Outbox/migration requirements), the exact operator/platform public
binding comparison and generated reader assertions. Existing read-only suite
had 19 passes; backup custody/command tests had ten passes. No local PHP runtime
pass is claimed; the operator executed the post-pairing reader on PHP 8.2.28.
Hosted CI and git diff --check validate the documentation candidate, not the
production pairing. Candidate Head/CI are reported separately to avoid a
self-referential documentation commit.

This result proves the new user's formal Site pairing after clock repair.
It does not prove Codex OAuth, direct MCP, cross-Tenant production Token denial
or self-service onboarding without engineering assistance. Configuration,
clock diagnosis and operator-mediated checks required engineering guidance.
The intermediate Enable readback was skipped as recorded above. Historical
first-failure root cause and precise fail-time clock offset remain unconfirmed.

Only this new evidence document is proposed on an independent Draft PR from
origin/main e8778da33d850303d1ccbdfbebf088610bf6ac5f. PR #83 and all earlier
evidence remain untouched. No runtime code, public API, schema, plugin, image,
NTP, firewall, TLS or user dirty/design file changes are included. The platform
receives only normal pairing control metadata, not WordPress content or MCP
inputs/outputs. Existing database backup stays host-local.

```text
P3E1K_PREFLIGHT_PASS=True
P3E1K_LOCAL_BACKUP_VERIFIED=True
P3E1K_EXISTING_ACCOUNT_LOGIN_RECOVERED=True
P3E1K_IDENTITY_RESET_PERFORMED=True
P3E1K_NEW_PAIRING_ATTEMPT_PERFORMED=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False

P3E1I_WORDPRESS_TIME_SYNC_REPAIR_PASS=True
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop at Site pairing. Retain the new account, Tenant, Site and identity; do not
disconnect, clear credentials or create a Grant. Codex OAuth/MCP, email login
recovery and registration opening require separate future authorization.
