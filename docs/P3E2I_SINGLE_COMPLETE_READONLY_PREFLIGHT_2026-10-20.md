# P3-E2I stage C: one complete read-only preflight PASS

Date: 2026-10-20, Asia/Shanghai. **Complete preflight PASS; stop before
Desktop enable, real OAuth or MCP.**

## Authorization and scope

After file delivery/verification passed, the operator separately approved
one complete read-only preflight, without enabling MCP or performing OAuth.
The operator then confirmed the original P3-D5 account/Home Tenant browser
page, WordPress login and PuTTY readiness. No OTP recovery was requested.

All local preparation preceded production timing. One initial resource gate,
one full platform reader including its existing runtime protections, public
and origin metadata/Client checks, disabled Desktop inventory, one verified
WordPress checker execution, semantic validation and one lightweight ending
gate completed. No production stage was retried or reordered.

This is new direct evidence, not reused E2G/E2H samples. Those historical
failures and the earlier approved E2G timing amendment remain unchanged.

## Evidence window and actual sequence

Local UTC and monotonic start were recorded before the first production
sample. No retrospective amendment was needed.

- Start: `10:31:56.006Z` / **18:31:56.006 Asia/Shanghai**.
- Intended deadline: `10:46:56.006Z` /18:46:56.006.
- Ending receipt: `10:33:37.765Z` / **18:33:37.765**.
- Start-to-ending UTC interval: **101.759 seconds**.
- Aggregate was frozen at18:34:51.076, **175.0738 monotonic seconds** after
  the pre-recorded start; all required checks were still within15 minutes.
- Platform-host initial-resource-to-ending monotonic interval:96.500657s.

These intervals have different endpoints; the aggregate monotonic duration
is not mislabeled as the exact ending-gate duration. The close wrapper also
enforced the same pre-recorded monotonic deadline before accepting its result.

| Stage | Local receipt, Asia/Shanghai | Result |
| --- | --- | --- |
| Initial resource/services | 18:32:00.546 | PASS |
| One complete platform reader | 18:32:13.835 | PASS |
| Public metadata/Discovery/challenge | 18:32:30.127 | PASS |
| Direct-origin metadata/challenge | 18:32:37.365 | PASS |
| Client/Discovery/platform backup | 18:32:44.790 | PASS |
| Actual backend/disabled project layer | 18:32:49.288 | PASS |
| One WordPress verified-launcher execution | 18:33:18.685 | PASS |
| Existing12-group WordPress semantic validation | 18:33:29.406 | PASS |
| Lightweight ending gate | 18:33:37.765 | PASS |
| Local aggregate/protected config comparison | 18:34:51.076 | PASS,10 aggregate groups |

The inherited platform dispatcher retains E2G status/nonce syntax in the
new E2I-owned evidence directory. Its nonce was
`e2g-73b6dabd87d872e6`; the directly bound WordPress launcher nonce was
`e2i-73b6dabd87d872e6`. Matching nonces and exact projected-result SHA-256
were checked before the existing semantic validator accepted the result.
The original inner checker does not itself emit a nonce; no such claim is made.

## Platform, resource and protection evidence

| Point | MemAvailable, KiB | memory full avg10 |
| --- | ---: | ---: |
| Initial | 1055888 | 0 |
| Full reader | 1130316 | 0 |
| Ending | 1107120 | 0 |

Thresholds were unchanged: MemAvailable >=524288 KiB and full avg10 <1.
Host cumulative OOM count remained174 and matched the accepted baseline;
five services were healthy and container identities/start/restart/OOM
protection checks matched their approved checkpoint. This is bounded
preflight evidence, not proof of long-term resource stability.

The original account's valid Session and active owner/Home Tenant relation
passed server-side checks and the ending gate. The operator independently
confirmed the current browser account/workspace and WordPress login. These
are separate evidence sources, not an inspection or comparison of browser
Cookie/Session Token values.

The exact target resource remained
`https://www.wepuu.com/wp-json/wp-auto/mcp`, with one accepted active paired
Site and its expected Tenant/public-key binding. Relevant platform Grant
count was zero, including the ending read. Query visibility/read-only
privileges were checked; RLS/permissions were not modified. The reader's
reported one Site/Attempt delta belongs to E1K pairing history, not a new
E2I Site or pairing attempt.

Site A/current active Codex Grant and Connector, retired Site B/history,
old failed Attempts and existing Outbox matched their protected summaries.
The ending gate confirmed protected business rows and canonical identities
unchanged, not merely a count comparison after hiding new rows.

Runtime identities remained:

- Control:
  `ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e`.
- Authorization:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Direct Control startup,001–013+015 migration set/hashes and no014 matched.
- Actual and persisted sending flags were false; public/origin send/resend
  guards and HMAC protection matched, including the ending check.

No service was recreated/restarted and no budget/key/configuration was reset.
No email was sent. Remaining budget was observed as99 by the full reader;
this round did not alter retention or rolling-budget policy.

## WordPress, custody and clock results

The original20,438-byte checker remained SHA-256
`73d319abd8459ca5896e1348b81ab4d92875d97eaeb0a1c79cdcb3abfe767ed4`.
Immediately before execution, the approved directory/files, external hashes,
manifest and syntax were rechecked, then the verified launcher was invoked
only once in `run` mode under this new authorization. The reviewed launcher
reserved its whole-directory once-only marker and reported child duration
9.498585s. No marker was removed to permit a retry.

Unlike earlier manual transport attempts, this result was directly collected
through SSH. Only the launcher's allowlisted projection was exported; no
raw Options, private key, credentials, full logs or exception text was exported.
The original checker uses the reviewed restricted/SHORTINIT read-only path,
not Connector business methods which could create or update state.

Results:

- Same paired Site ID/public key/Tenant/resource/Issuer/platform-key bindings.
- Local active, no pending, zero local Grant mappings; identity keypair
  consistent and unchanged against the current accepted binding.
  The inner historical `identityChanged` flag compares against the older
  pre-recovery baseline; it does not mean identity changed during this run.
- Revocation v2,sequence0,deny_all=false and all three marker counts zero.
- All789 plugin files matched the frozen manifest/tree and original ZIP.
- Existing WordPress backup custody/hashes passed; no backup was created
  or restored. The backup predates this paired identity and is not a
  complete current identity/database restore point. The old platform backup
  has the same coverage limitation.
- Homepage and login HEAD were200; business state matched before/after.
- Timesyncd active/synchronized with64.69.34.90; latest stored sample
  PacketCount88, ignored=false, Leap normal, offset **0.061ms**, root distance
  **19.531ms**. No fresh NTP query, source change or calibration was performed.

Five bracket samples, WordPress minus Control reference:

| Sample | Conservative interval, seconds | Measured window, ms | Reference requests before/after, ms |
| --- | --- | ---: | --- |
| 1 | [-1.120378, 1.879622] | 1169.378 | 562.219 /529.873 |
| 2 | [-0.940038, 2.059962] | 1170.698 | 555.686 /537.535 |
| 3 | [-0.819698, 1.180302] | 1141.234 | 529.810 /559.576 |
| 4 | [-0.670769, 1.329231] | 1162.376 | 529.990 /555.291 |
| 5 | [-0.514436, 1.485564] | 1111.258 | 529.807 /529.521 |

Every interval contains0 and is entirely within±3s. The reference was the
TLS-verified direct-origin HTTPS Date, with1000ms allowance at each end for
quantization/uncertainty. PHP CLI was also bracketed by its local host.
This is **indirect evidence, not direct Node/FPM runtime measurement** or
independent proof of absolute UTC correctness. It does not reconstruct the
historical failed Proof's iat or confirm the first pairing's root cause.

## Metadata, Client and disabled Desktop

Public and direct-origin slash metadata returned200; no-slash returned one
same-origin301 then200. Fixed resource, authorization server, frozen five
advertised scopes and Bearer header support matched. Unauthenticated GET
remained401 with the expected challenge. TLS verification was never disabled;
non-metadata response bodies were not retained.

Client `wepuu-e2e-codex` remained active/pre-registered, with the accepted
row hash, two existing redirects and stable callback registration. Discovery
issuer identification/code/S256 checks passed. General Discovery advertising
openid/offline_access/other grant types does not mean those scopes or flows
were requested. No authorization request, DCR, callback registration or
code/token exchange was performed.

Desktop package remained26.1013.4894.0; backend remained
`codex-cli 0.163.0-alpha.10.2`, SHA-256
`f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312`.
The trusted project layer contained exactly one target/resource definition,
349 bytes, SHA-256
`00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139`,
still `enabled=false`, Client/resource/callback correct and only`mcp:read`.
Project and unrelated user/system config hashes matched again at aggregation.
No credentials were read or copied. Config/read evidence is not a new GUI
connection/initialization or complete runtime tool-catalog acceptance.

OpenAI Docs was used for configuration interpretation, not as proof of the
installed client's live behavior: [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
defines the enabled/resource/client/callback/scope fields. The frozen local
inventory and accepted backend compatibility evidence supplied the concrete
version/configuration checks. No new GUI/OAuth test was used to try a callback.

## Local validation, data boundary and evidence identities

Before production,34 Node synthetic tests and eight Python mocked execution
tests passed. A module-import guard initially matched a test filename and
hit only an unprepared local gate; it was corrected before the evidence
directory/window was started. No production command was invoked by that
failure, and no production stage was retried to conceal it.

The original business checker/core/thresholds were unchanged. The new wrapper
only adds custody, one-run dispatch and result-hash/nonce correlation. Its
allowlisted output is validated again using the existing12 semantic groups;
all12 and all10 aggregate groups passed.

| Local artifact | SHA-256 |
| --- | --- |
| Current preflight shell | `c92c4562457da46cc6082f67bd8dfbc5d2af88306ed960260b7ca1ad178c779e` |
| One-run local transport | `c337e5e6c88c8949b26930b86c1eaaf171e2e0902fb516a47d6298e3ce1a0518` |
| One-run Python wrapper template | `ad762e7289a8156485803201614db44f749fd0e87920122f0c185c1c94bcab35` |
| Frozen aggregate receipt | `0e67e0a9fc3a1015ddcb4e42d83c05095108514c21fae8fb97ae29b6958503e1` |

Business data/state remained read-only. The sole intended host filesystem
change during stage C was the protected helper's once-only execution marker;
local commands/receipts were also written. No WordPress content, MCP input
or output entered the control plane. No OAuth/cryptographic primitive,
application/Connector code, permission, migration or protocol was changed.

## State and mandatory stop

```text
P3E2I_COMPLETE_PREFLIGHT_PASS=True
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

**Eligible to request separate formal Desktop OAuth/MCP execution approval.**
This conclusion is scoped to this observation window, not a guarantee of
future Session validity or sustained health. No formal approval was inferred
from the read-only approval. No Desktop enable, Authenticate, Consent,
MCP initialize/tools/list/site-health, refresh/replay/revocation, pairing,
OTP, NTP adjustment, deployment or migration followed the PASS.

The helper's once-only marker is consumed; do not delete it or rerun this
directory to obtain fresher evidence. Any later necessary recheck must be
explicitly scoped rather than silently reopening this completed attempt.

This independent stage C record is added to the existing E2I Draft PR,
preserving stage A/B and failed authentication/CI history. Only docs are
committed; actual config, helper bundles, payloads and private receipts remain
uncommitted. Original dirty worktree and `design/` remain untouched.
The preceding file-delivery Head3c64f49 passed CI39390502118. This new Head's
CI is tracked separately and cannot replace production evidence.
