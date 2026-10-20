# P3-E2G: complete preflight under an explicitly approved timing amendment

Date: 2026-10-20, Asia/Shanghai. **Complete read-only preflight PASS under the
operator-approved ordering/UTC-window amendment; Desktop enable, OAuth and MCP
JSON-RPC/tool execution NOT_RUN.** All production collection stopped after the
ending check. This is docs-only evidence, not a deployment or runtime patch.

## Authority, deviation and explicit approval

The operator requested implementation of E2G, which allowed a single read-only
preflight, not OTP recovery, enable or authorization. They confirmed the original
P3-D5 account/Home Tenant and WordPress login/PuTTY readiness, but needed the
complete WordPress command reposted. The assistant supplied the same reviewed,
hash-checking command in chat, explicitly asking that it be copied but not yet
executed. No dependence on an inaccessible local D: path remained.

The operator executed it early and returned a passing JSON instead of the
copy-only confirmation. This was a real deviation: WordPress ran before the
planned platform resource gate and before a controller monotonic start existed.
The assistant did not silently backdate that start, rerun WordPress or treat the
original sequence as followed. Production platform access paused for a separate
approval. The operator explicitly approved:

- keeping this already executed WordPress check as the first collected evidence;
- continuing one not-yet-run platform preflight and one ending check;
- a conservative UTC window starting at the previously recorded coordination
  time11:37:48, ending no later than11:52:48 (Asia/Shanghai);
- recording monotonic elapsed time only from continuation onward, without
  claiming an advance whole-window monotonic record;
- no repeat WordPress command, email, enable, OAuth or MCP call.

That approval changed collection order/timing evidence, not resource thresholds,
OAuth/Proof rules, Session lifetime or production configuration. The PASS below
depends on this explicit amendment; it is not a claim that the original order
and pre-recorded full-window monotonic requirement were satisfied unchanged.

## Window and source attribution

Internal correlation: e2g-2ac09aa84071b4ac (not an OAuth state/challenge).

| Event | UTC | Asia/Shanghai |
| --- | --- | --- |
| Conservative approved window start, prior coordination observation | 03:37:48.000 | 11:37:48.000 |
| Operator WordPress report timestamp | 03:39:23.211081 | 11:39:23.211081 |
| WordPress PHP clock samples | 03:39:25.205-03:39:29.779 | 11:39:25.205-11:39:29.779 |
| Controller continuation monotonic start actually recorded | 03:42:13.454 | 11:42:13.454 |
| Initial platform resource sample | 03:42:18.276606 | 11:42:18.276606 |
| Complete platform check result | 03:42:27.807484 | 11:42:27.807484 |
| Operator JSON locally validated | 03:42:40.489 | 11:42:40.489 |
| Public / origin / extra / Desktop results | 03:42:48-03:43:10 | 11:42:48-11:43:10 |
| Ending check completed, all required results already received | 03:43:25.585171 | 11:43:25.585171 |
| Approved hard deadline | 03:52:48.000 | 11:52:48.000 |

Conservative UTC span to ending completion: approximately337.585 seconds
(5m37.6s), below15 minutes. Platform host monotonic interval between its resource
samples:66.634097 seconds. A separate controller upper-bound observation at
03:44:06.924Z was113.467670 seconds after its continuation start; it includes
local aggregation after the end and is not labeled exact collection duration.
Whole-window monotonic timing was not pre-recorded. UTC values are not promoted
to an independent absolute-time standard. Small controller/host timestamp
differences are not proof of causality; local validation preceded starting the
ending command, and no late evidence was inserted afterward.

WordPress facts are operator-returned results from the reviewed command; they
are not assistant SSH to that host. Its hostReportedUtc precedes its clock
samples, so it is not described as completion time. The internal run ID was
added to the validation receipt, not emitted by the original WordPress script.
Local normalized operator projection SHA-256:
9ac674dd8f58626b238c56a2a0dbb710327c36722a3146854621aa220e143740.
This is not the hash of the user's original message/attachment bytes; the
retained validator's legacy attachmentSha256 field has this limited meaning.

## Actual checks and outcomes

All required gates passed; no full preflight or WordPress command was retried.

| Gate | Current result |
| --- | --- |
| Initial resources | MemAvailable993056 KiB, memory full avg10=0 |
| Original runtime_protections inside full platform check | MemAvailable1043120 KiB, full avg10=0.18 |
| Ending resources | MemAvailable1076920 KiB, full avg10=0 |
| Host/container protection | Host oom_kill174 unchanged; five healthy, identities/start times/images unchanged |
| Original account | Active original account/Home Tenant/owner, valid Session at platform and ending checks; browser identity separately confirmed |
| Target binding | Existing E1K active Site/key/Tenant/resource unchanged; no pending; target platform Grants0 |
| Protected business | Site A/current active Codex Grant/Connector, Site B history, old Attempts and Outbox retained |
| Sending/HMAC | Actual and persisted sending false, public/origin send/resend503 and raw auth404, HMAC unchanged; budget98 |
| Migrations |001-013+015 with unchanged hashes, no014 |
| Public and origin Metadata | No-slash301 to exact same-origin slash200; slash direct200; exact resource/issuer/five frozen scopes/header-only Bearer |
| Unauthenticated MCP GET |401 and correct metadata Bearer challenge; no MCP JSON-RPC |
| Discovery/Client | Issuer identification, code/S256/public-client metadata; active pre-registered Client, unchanged row digest and two registered redirects |
| Desktop | Same actual package/backend and trusted project layer; one exact target definition, disabled, no duplicate resource definition |
| WordPress |789-file manifest matches, exact paired identity, zero local Grants, active/no pending, revocationv2/sequence0/deny_all=false/zero markers |
| Existing backups | Recorded platform and WordPress custody/hashes pass; no new export or restore |
| Ending comparison | Session/owner, protected business, five services, zero Grants, flags/guard and local configuration protection pass |

Thresholds remained MemAvailable>=524288 KiB and memory full avg10<1. No resource
tuning, lowered threshold or real failure discarded in favor of a later sample.
This demonstrates the checks at these points, not long-term resource stability
or the root cause of PR89's earlier pressure.

The observer's global read-only visibility was verified for Sites/Grants/Attempts;
no RLS, role or permission was changed. Protected business digest remained
860633ccf1ad343f0cf189d02f4be32846890d6981696aa0d223d6f055f15b9a.
Initial and ending container projection digest matched:
aaf52555a45e63b6d178fbbfb88a1c646660a3e8d0ec1362c4c1719fcab8f82e.
The reused checker newSiteCount=1/newAttemptCount=1 and WordPress
identityChanged=true refer to historical E1K changes, not new E2G operations.
No new Site, Attempt, Grant, Outbox, Account or Tenant was created here.

Fixed runtime identities/direct entry remained:

```text
Control: ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization: ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
Control command: node apps/control-api/dist/main.js
```

The existing E2F approved false-transition checkpoint was read, not replaced or
reset. No container or Nginx reload/recreation occurred in E2G. No email request
with a recipient was sent and no temporary recovery tasks were created.

## WordPress clock and backup evidence limits

Current stored sample75: timesyncd active/synchronized, source64.69.34.90,
Ignored=false, Leap normal, stratum3, Offset+0.198ms, Root distance52.321ms;
daemon identity unchanged. It was not a newly requested NTP update. Bounded
journal returned zero entries, not proof that historical jumps never occurred.

| Sample | PHP minus Control-reference interval, seconds | Window, ms |
| --- | --- | --- |
| 1 | [-0.794989,1.205011] |1177.784 |
| 2 | [-0.628583,1.371417] |1138.288 |
| 3 | [-0.473053,1.526947] |1164.067 |
| 4 | [-1.349038,1.650962] |1120.514 |
| 5 | [-1.220681,1.779319] |1138.631 |

All intervals contain0 and lie inside[-3,+3]. PHP CLI was host-bracketed.
Reference is TLS-verified direct-origin HTTP Date with1000ms allowance per
reading, not direct Node/FPM time. No exact-zero skew or historical failure-time
offset claim. No Proof, active NTP probe, time change or source change occurred.

Existing WordPress backup:
/root/wepuu-e1k-backup-20261018T135222Z-a931ba4ba8a7.
Existing platform dump:
/opt/wpauto/backups/p3e1c/20261016T012328Z-QmANC0, SHA-256
780cddefc54feae34ad842fb824b940d4db8a64b66b7a418b37a76f138b014e6.
Both predate the current paired identity/Site; neither is represented as a
current combined recovery point. No restore drill or production restore.
WordPress home/login HEAD200 and local state unchanged during its command.

## Desktop: definition compatibility, not connected runtime acceptance

OpenAI Docs was used to retain the distinction between a disabled definition
and connected runtime: [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
The MCP entry remained enabled=false throughout; no requirement was imposed
that it appear as connected in the chat list.

Actual package manifest26.1013.4894.0; backend0.163.0-alpha.10.2, SHA-256
f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312.
Read-only app-server config/read found exactly one matching disabled target in
the already trusted project layer, no duplicate resource/override. Target:
wepuu-p3e2a-wepuu; resourcehttps://www.wepuu.com/wp-json/wp-auto/mcp;
Clientwepuu-e2e-codex; onlymcp:read; callbackhttp://127.0.0.1/callback;
prompt approvals, no static Bearer/client secret addition. Client row SHA-256:
496c3a897aded44a352e652212762e4c70c8709bc30ad8ef552aa4ccf4e0a2e7.
Prior same-backend isolated callback/scope/S256 compatibility remains historical
support, not a production GUI authorization test repeated here.

Project config349 bytes, initial/end SHA-256:
00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139.
User config hash also remained unchanged; no old user file was restored.
No GUI enable/reload, credential-store read, code exchange, Token extraction,
authenticated initialization, tools/list or business-tool call occurred.

## Tool validation and delivery

Reused the frozen E2F bundle with a minimal read-only dispatcher. Its action
whitelist rejects start/arm/restore/watch/cleanup before loading a helper.
The dispatcher executes in memory on the platform; historical production
helpers are hash-checked, not edited or redeployed. Source/code hashes:

| Artifact | SHA-256 |
| --- | --- |
| Frozen core |4cebe882863b3e69df5f5ad8cce8531b6cedbfdb8d4eb3759e41245834baf906 |
| E2G remote bundle |9fee94c7566e6854c0ea00184a52278ac1d43c87ea45950348cb983b68afc0f2 |
| Python read-only dispatcher |3096e55c103eefc44a3c025bc9349e1f17d27b1adca455492d2ddcba99a8e111 |
| Controller/read-only timing |db1af8046364378623a99299b47aa177b8d04ac37184d51846a7cbb539b36ca1 |
| Extra read-only wrapper |ad853d4bb18410a692395472990214ea1cd3274881bd3f957525e32b2335efa6 |
| WordPress safe-field validator |710495a0545839290169bbd41035adbcf7f86af1002446defaf4341932f9c284 |

Local tests before production:78 PASS (56 retained and22 new). The additional
amendment-deadline test ran before platform access; ordinary window tests still
enforce15 minutes and the approved UTC branch separately enforces its fixed
deadline. Coverage includes action whitelist, frozen compilation without
execution, permissions/timeouts/failure propagation, exact semantic results,
window boundaries, old/future JSON, identity/local Grant/NTP/clock/backup drift
and sensitive sentinel exclusion. Live rejected-resource-frame extraction was
not triggered here and remains synthetic/transport evidence only. Twelve
WordPress safe-field groups and nine final local aggregate groups passed.

No WordPress content/tool inputs/tool outputs entered the control plane. Checks
used restricted control metadata, public metadata, content-free health/guard
probes and file hashes. No protocol/permission/signature/scope/tenant checks,
application code, Client, secret, schema or migration changed.

This independent docs-only branch starts from main
e8778da33d850303d1ccbdfbebf088610bf6ac5f. Tools/receipts, actual project config,
private backups and personal identifiers are not committed. Dirty files and
design/ remain untouched. CI validates the candidate, not production state.

## Outcome and mandatory stop

```text
P3E2G_COMMAND_DELIVERY_READY=True
P3E2G_ORIGINAL_EXECUTION_ORDER_FOLLOWED=False
P3E2G_ORDER_AND_TIMING_AMENDMENT_APPROVED=True
P3E2G_FULL_WINDOW_MONOTONIC_PRE_RECORDED=False
P3E2G_EVIDENCE_WINDOW_PASS=True
P3E2G_COMPLETE_PREFLIGHT_PASS=True
P3E2E_PREFLIGHT_RERUN_PASS=True
P3E2A_PREFLIGHT_PASS=True

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

The amended preflight establishes eligibility to request separate P3-E2E formal
execution authority for this observation window only. It does not guarantee a
future Session/resource state or authorize enable, real GUI OAuth/Consent,
normal new Grant/local mapping creation, or a single site-health call.

Stop after Draft PR/CI delivery. Before a future authorized formal run, recheck
critical Session/identity/time/protection conditions; do not repeat today's
whole preflight or reopen OTP automatically. Preserve PR89 pressure failure,
PR90 Session stop and PR91 out-of-window failure unchanged. Do not merge any PR,
pair/reset a Site, deploy/migrate, change time, revoke a Grant or open registration.
Manual copy/execution coordination and engineer-assisted preparation remain
onboarding limitations; technical preflight PASS is not self-service readiness.
