# P3-E2F: original-account login recovery and single E2E preflight

Date: 2026-10-20, Asia/Shanghai. **Single-email login recovery PASS;
aggregate E2E preflight NOT PASSED: WordPress evidence arrived after the stop,
outside the15-minute window and after the ending check. Its individual checks
PASS as late evidence only. Desktop enable/OAuth/MCP NOT_RUN.**
This is an operations evidence document, not a production runtime patch.

## Authority and evidence boundaries

The operator reported that normal browser refresh could not restore login.
A restricted database check separately found no valid original-account Session.
These are separate observations, not a comparison of browser and database
Session Tokens. The operator then explicitly approved one original P3-D5
account OTP recovery, at most one email/no resend, including temporary platform
send-route opening and same-fixed-image Control recreation to toggle sending.
They confirmed readiness, reported one send and confirmed inbox receipt,
successful login, refresh and the correct original account/Home Tenant.

No email address, OTP, Cookie, Session Token or credential-store material was
requested or collected. No other Session was copied, revoked or reused. Browser
receipt/identity is operator evidence; database ownership/Session existence,
platform protection, public/origin probes and local configuration checks are
assistant direct evidence. WordPress command results, if supplied, are operator
execution evidence, not assistant SSH to WordPress.

Historical [PR #89](https://github.com/wepuu/wp-auto/pull/89) resource failure
and [PR #90](https://github.com/wepuu/wp-auto/pull/90) browser-Session stop are
preserved. Later passing samples do not overwrite either historical failure.
This run did not diagnose the root cause of resource pressure or promise
long-term resource/Session stability.

## Local preparation and controlled recovery

Reused the hash-pinned E2C recovery, E1K pairing reader and existing resource
diagnostic components. Only the local adapter/transport was extended; protected
historical production helpers, application code, dependencies and protocol
conditions were not edited. The adapter permits an explicitly approved new
same-account login when the browser is unusable, even if an unrelated database
Session exists; it does not extract that Session or use it as browser proof.

Local synthetic/integration tests: **56 PASS** (12 transport, 18 recovery/core,
18 resource diagnostics and 8 retained E2C extension cases). These cover bundle
hash/compile round-trip, permissions, timeout and nested-failure propagation,
safe expected-frame mem/psi extraction, non-finite/missing metrics, approval
gates, repeat-run blocking, monotonic deadline, closing protections and private
sentinel filtering. A local unittest module-path invocation was invalid before
running the Python files directly; the corrected file entries passed. No
production failure or threshold was hidden by that invocation correction.

Resource thresholds remained MemAvailable >=524288 KiB and memory full avg10 <1.
The diagnostic whitelist reads only the expected failed gate's mem/psi; it does
not enumerate arbitrary frame locals, raw exceptions or stacks. No actual
RESOURCE_PRESSURE failure-frame extraction occurred in this successful platform
check; that branch has synthetic/transport evidence, not a new real failure.

New private configuration/helper/state backup (not a database dump):

```text
/opt/wpauto/backups/p3e2f-login/20261020T024449Z-JmZom5
```

Directory root-owned0700, files0600; custody verified before opening and after
cleanup. No plaintext configuration or private snapshots are committed here.

| Private file | SHA-256 |
| --- | --- |
| login.py | 6bff3298deee6583d6da9f38328ad54a72773ba847a98b0c00139c75b82ea822 |
| runtime.env | 2ba36de04cbb114cbcb9c3c717148e7175e53ffde97e280566c007574cee238a |
| guard.conf | 6485a5f0df233ed8ce8c48bf03cdcc6f6aea1be8684711abd44e3b3b48a87f9c |
| rollback.image | dee4a381eab487aab27713243f4149818e144ed80e2a588fc750adfbc44fb214 |
| initial.json | 7f625bb070f5ca45fe2391f6352c0b3863713b38a58697579451d91389459026 |
| approval.json | 4b0b5ad7c382e37f6378ad560474ff78a9aa5efa99feed9d1e5660a1f14f7a5a |

The initial build was retained; an enhanced v2 bundle was frozen, compiled and
tested before deployment. V2 without operator consent has SHA-256
4cebe882863b3e69df5f5ad8cce8531b6cedbfdb8d4eb3759e41245834baf906;
the deployed helper above includes the approved consent as data. Source hashes:

| Local source | SHA-256 |
| --- | --- |
| p3e2f-core.py | 6bcd12ee4cc654e62568d154c662c452fc8dc45695f244834dbb351cd5485152 |
| p3e2c-login.py | 58ca5ec00df40bde6fb7bef6f4616254ba2b0168a7228bb33ef28834b7f0e20e |
| p3e1k-pairing-postcheck.py | 99d8e18e8db18b123309b8ad6277c3b451cffc5e16e130bf929676e74b0f1cfd |
| p3e2e-rerun-diagnostics.py | a059c80cc99e8500ac132f5455430bfcc9e25f340c8e3f8b3853bcd6a6f02cb4 |

## Single-email window and protection restoration

Recovery prerequisites passed at02:12:49Z and were revalidated during preparation
at02:44Z. The original account was active, verified and owner of its original
Home Tenant, with zero target Grants and correct current pairing. Initial
resources were942964 KiB/PSI0, internal gate982480 KiB/PSI0; host cumulative
oom_kill174 matched the protected baseline.

The independent server-side timer was armed by02:45:14.124Z for five minutes,
using a monotonic deadline. A watcher closed the send ingress on the first new
reservation and restored sending independently of chat/SSH. Resend stayed503
and raw Better Auth ingress404. Full guard was closed while Control was
recreated to true; send-only ingress opened afterward. No send was performed
by the assistant or watcher.

| Event | UTC |
| --- | --- |
| Backup preparation completed | 02:44:52.609Z |
| Independent timer arm completed | 02:45:14.124Z |
| Send-only start completed | 02:45:26.440Z |
| Restored false/healthy, no restoration issues | 02:46:13.141186Z |
| Direct status: valid Session and both protections restored | 02:48:04.489839Z |
| Temporary-task cleanup completed | 02:48:31.000Z |
| Independent final custody/task check | 02:49:05.401Z |

Times labeled completed are observation/handler completion times, not claimed
exact packet/send timestamps. Restoration finished before the independent
five-minute deadline, without waiting for browser login confirmation.

Exactly one new reservation and one Provider attempt were observed, accepted1.
Before the closing Control recreation, process-local metrics were retained:
attempt1/accepted1, rejected0/unknown0/storage_failed0 and all four rate-limit
dimensions0. Rolling daily budget99->98; no expired historical reservation was
removed in this run, non-expired history stayed unchanged, and no quota refund,
budget reset or HMAC change occurred. Normal process-local metric restart is
not represented as budget reset. Provider accepted is distinct from operator
inbox receipt; Resend Dashboard delivered/complaint inspection is NOT_RUN.

Only Control was normally recreated once to true and once to false, with the
same fixed image and direct command. Other four container identities/images/
start times stayed unchanged; no new host OOM was found. Full guard, runtime
configuration bytes and rollback reference matched the backups. Timer/service
files were removed, timer/restore/watcher units independently verified inactive;
private backups and legitimate OTP records remain.

## Single complete preflight: current evidence

The fresh aggregate preflight began with the complete platform reader at
02:49:36.342791Z. It ran once, including its original runtime_protections.
The ending checkpoint is a lightweight check, not a second full run. All
required evidence must fit the15-minute window; old WordPress/Session results
cannot be substituted.

| Stage | Current result |
| --- | --- |
| Full platform, Session/owner, resource gate | PASS at02:49:36Z;1001408 KiB, full avg10=0.03 |
| Public Metadata/Discovery/challenge | PASS at02:50:30Z |
| Direct-origin Metadata/challenge | PASS at02:50:36Z |
| Client/AS metadata and existing platform backup | PASS at02:50:45Z |
| Actual backend/config/read and disabled definition | PASS at02:50:51Z |
| Fresh operator WordPress/time/backup check | NOT_CONFIRMED at stop; later individual PASS outside window |
| Lightweight ending check | PASS at03:04:53.622096Z, outside aggregate evidence window |
| Aggregate preflight | False; missing required evidence and window exceeded |

Platform: exact active target Site/key/Tenant matched E1K, zero target Grants;
original account Session/owner valid. Global SELECT visibility was verified for
Sites/Grants/Attempts; RLS/roles were not changed. Historical Site/Grant/Outbox/
Attempt rows, Site A/current Codex Grant/Connector and canonical identities
matched protection baselines. Legacy newSiteCount=1/newAttemptCount=1 are the
historical E1K additions, not new E2F records. Protected business digest:
860633ccf1ad343f0cf189d02f4be32846890d6981696aa0d223d6f055f15b9a.

Five services healthy; Control direct entry, fixed image identities, HMAC and
migration hashes remained001-013+015/no014. Actual/persisted sending false and
public/origin send/resend503/raw-auth404 were checked without email input.
Within-check container equality does not mean Control never changed across
the separately authorized recovery.

```text
Control: ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization: ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
Control command: node apps/control-api/dist/main.js
```

Both Metadata channels: advertised no-slash path301 to same-origin slash200,
slash path direct200, exact resource/issuer/five frozen scopes/header Bearer;
unauthenticated MCP GET401 with the matching resource_metadata challenge.
Discovery supports exact issuer/issuer identification/S256/code/public Client.
TLS verification was retained; no JSON-RPC, token request or authorization
request was sent. Existing AS openid/offline_access and implicit/code/refresh
advertisements are unchanged metadata, not requested scopes or added grants.

Client remains active/pre-registered, stable loopback callback registered, two
redirects. Row SHA-256496c3a897aded44a352e652212762e4c70c8709bc30ad8ef552aa4ccf4e0a2e7
matches E2C. Prior exact-backend isolated callback/S256/scope tests remain
historical compatibility evidence; they are not rerun production GUI OAuth.

OpenAI Docs informed the read-only configuration interpretation:
[MCP documentation](https://learn.chatgpt.com/docs/extend/mcp),
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
Actual package manifest26.1013.4894.0 and backend0.163.0-alpha.10.2 were checked;
backend SHA-256f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312.
An isolated app-server config/read, not a login, found exactly one matching
target definition/resource in the active trusted project layer, enabled=false,
only mcp:read, exact Client/resource/callback and prompt approvals. No duplicate
target/user override. Project file349 bytes, SHA-256:
00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139.
User config custody was recorded, not restored to an old version. No actual
GUI interaction/loading/connection or credential-store access occurred here;
disabled settings visibility is historical E2D operator evidence, not a new
chat /mcp runtime acceptance. No requirement was imposed that disabled servers
appear as connected.

Existing platform dump was reverified for root custody/hash in
/opt/wpauto/backups/p3e1c/20261016T012328Z-QmANC0, SHA-256
780cddefc54feae34ad842fb824b940d4db8a64b66b7a418b37a76f138b014e6.
It predates the current paired Site; no combined current recovery point or
disaster-recovery rehearsal is claimed. No new database export/restore.

### WordPress evidence gap and bounded stop

After the platform stage, the operator was asked to run the existing reviewed
WordPress command once. They could not find the local command file, and then
reported Windows could not find the path when opening it with Notepad. The
assistant verified it existed in its own workspace (11316 bytes), but did not
assume the operator's filesystem view was identical. The same complete command
was supplied directly in chat with its embedded payload hash check, not a new
checker or a repeat platform run.

Command SHA-256:1d0b03a243db66d207876ba2819fc0fb5b3b033c9d8d28ba5b1a5ef63d3418af.
Embedded read-only payload SHA-256:
73d319abd8459ca5896e1348b81ab4d92875d97eaeb0a1c79cdcb3abfe767ed4.

No current WordPress JSON or execution confirmation was received by the stop.
Whether the operator executed it is NOT_CONFIRMED, not represented as a failed
WordPress command or proof that nothing ran. Current WordPress identity,
local zero-Grant mapping,789-file manifest, old-backup custody, NTP sample and
five clock brackets were consequently NOT_CONFIRMED at the stop. Prior results
were not substituted; the late new evidence is separately appended below.

The single lightweight safety ending check at03:04:53.622096Z was15 minutes
17.279305 seconds after the full platform result, already beyond the default
15-minute freshness boundary (actual full-check start was earlier still).
It is recorded as a successful late safety check, not used to extend the
window or qualify an aggregate PASS. The operator was told to stop and not
execute the supplied command if it had not yet run. No automatic full rerun,
extra OTP, time change or source adjustment followed.

Late ending results: MemAvailable1075128 KiB/full avg10=0.01; host oom_kill174
unchanged; original Session/owner valid; canonical identities/protected business
digest and Site A Connector unchanged; target Grants0; actual/persisted flag
false and guard probes passed; five healthy. Control matched the owned false
transition and the other four containers matched the original baseline. These
results do not fill the missing WordPress evidence or erase PR89's failure.

### Late operator evidence: individual PASS, aggregate still False

The operator subsequently supplied the command JSON, read at03:08:19Z.
Attachment SHA-256:
f25880ad6f4aa03280efb0515d43a4655fea5822ea0a7195485c485bab8c948a.
Host-reported timestamp03:05:42.530488Z precedes its actual clock samples at
03:05:44.743Z through03:05:49.394Z; it is not labeled command completion time.
All these times are after the03:04:36 freshness boundary and after the ending
check. Local safe-field validation passed all ten binding/state/manifest/time/
backup groups. No production check was rerun on receipt of the attachment.

The new operator result confirms the same E1K identity/key and exact platform
binding, local active/no pending/no local Grant mapping, revocationv2/sequence0/
deny_all=false/zero markers. All789 plugin files and the frozen ZIP manifest
match. identityChanged=true is an inherited historical E1K field, not a reset
in this run; explicit identityResetPerformed/pairingAttemptPerformed remain
false and the observed identity digests match the pre-run values.

timesyncd active/synchronized, selected64.69.34.90, latest stored sample74,
Ignored=false, Leap normal, stratum3, Offset-0.031ms, Root distance53.176ms.
This was not a newly requested NTP sample. Daemon identity unchanged; bounded
journal returned zero entries, which does not establish absence of historical
timeouts or clock changes. No daemon restart, probe or time adjustment occurred.

| Sample | PHP minus Control-reference interval, seconds | Window, ms |
| --- | --- | --- |
| 1 | [-1.256268, 1.743732] | 1191.478 |
| 2 | [-1.063042, 1.936958] | 1215.679 |
| 3 | [-0.865842, 2.134158] | 1145.906 |
| 4 | [-0.720150, 1.279850] | 1140.019 |
| 5 | [-0.605537, 1.394463] | 1138.656 |

Each contains0 and lies inside[-3,+3]. Reference is TLS-verified direct-origin
HTTP Date with1000ms allowance per reading, not direct Control Node/FPM time.
PHP CLI time is host-bracketed; wall-minus-monotonic change2-6 microseconds.
No exact-zero skew, independent absolute UTC or historical failure-time claim.

Existing WordPress backup custody and recorded hashes verified:
/root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7. It predates the current
identity, not a complete current recovery point. No new export, restore or
disaster-recovery drill. Homepage/login HEAD200 and state unchanged during the
command. These are operator-provided read-only results, not assistant host
access. This late PASS resolves the individual evidence gap only; it does not
restore the required aggregate timing/order or authorize OAuth.

## Scope, delivery and stop

WordPress content remains outside the control plane: no MCP inputs/outputs,
posts or business response bodies were collected. Only content-free status,
restricted control metadata, public OAuth metadata and protected file hashes
were used. No WordPress/Connector/rewrite/time configuration, Client registration,
keys, migration or new image was changed. The temporary platform OTP guard is
distinct from WordPress E2B Nginx and is restored.

This independent document-only branch starts from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. Runtime helpers/receipts and actual
project config are not committed. Original dirty files and design/ remain
untouched. Hosted CI is document-candidate evidence, not production evidence.

```text
P3E2F_EXISTING_ACCOUNT_SESSION_VALID=True
P3E2F_LOGIN_RECOVERY_PASS=True
P3E2F_EMAIL_SEND_PAUSED=True
P3E2E_PREFLIGHT_RERUN_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2F_PREFLIGHT_STOP_REASON=WORDPRESS_EVIDENCE_NOT_CONFIRMED_AND_WINDOW_EXCEEDED
P3E2F_CURRENT_WORDPRESS_CHECK_AT_STOP=NOT_CONFIRMED
P3E2F_LATE_WORDPRESS_CHECK=PASS_OUTSIDE_EVIDENCE_WINDOW
P3E2F_COMPLETE_PLATFORM_PREFLIGHT=PASS
P3E2F_ENDING_SAFETY_CHECK=PASS_OUTSIDE_EVIDENCE_WINDOW
P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop here: this run does not establish eligibility to request formal E2E
execution approval. A future separately resumed fresh preflight must first
solve command delivery and ensure the operator can promptly return current
WordPress evidence. Recheck Session normally; do not infer another OTP
authorization, extend Session lifetime or copy credentials. Do not automatically
retry the full preflight, merge any PR, enable Desktop, perform OAuth/Consent/
token exchange, discover/call MCP tools, pair/reset a Site or open registration.

Operator friction is retained, not hidden by technical checks: OTP recovery
requires an engineer-controlled temporary sending window; the operator twice
could not open the supplied local command path, although it existed in the
assistant's workspace. The identical hash-checked read-only command was then
provided directly in chat rather than assuming both filesystem views were
identical or asking for a fresh platform run. This assisted workflow is not
evidence that an ordinary new user can self-serve the full onboarding flow.
