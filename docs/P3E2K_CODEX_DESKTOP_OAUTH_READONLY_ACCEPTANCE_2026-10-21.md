# P3-E2K: Codex Desktop OAuth and direct WordPress read-only acceptance

## Result and scope

On 2026-10-21 (Asia/Shanghai), the operator completed the authorized real
Desktop OAuth for the P3-D5 account and its Home Tenant. The platform/Provider
and local Grant bindings passed, the real Desktop exposed the exact frozen
23-name tool set, and one `wp-auto-site-health({})` invocation succeeded.
Subsequent read-only production protection checks passed.

This is a bounded technical acceptance, not public registration or full product
readiness. Normal user setup still required engineer-assisted preregistered
Client/Tenant/configuration handling and one operator restart. No self-service
onboarding or repeat/refresh/revocation acceptance is claimed.

| Fixed field | Accepted value |
| --- | --- |
| Target server | `wepuu-p3e2a-wepuu` |
| WordPress / resource | `https://www.wepuu.com/wp-json/wp-auto/mcp` |
| Issuer | `https://auth.wpauto.cc` |
| Client | `wepuu-e2e-codex` |
| Scope | Only `mcp:read` |
| Saved callback | `http://127.0.0.1/callback` |
| Business tool / arguments | Only `wp-auto-site-health` / `{}` |

## Authorization and preceding failures

The operator explicitly approved the exact target enable, one real Desktop
OAuth, normal business Grant/Provider/local mapping and Desktop credential
storage, and the single read-only call. Failure policy was safe target disable
only, without revocation, credential clearing or automatic retry.

Before enablement, one lightweight ready gate failed with memory full avg10
1.23 (required <1) despite MemAvailable 601972 KiB. No enable or OAuth occurred.
An explicitly requested retry passed (1158100 KiB, avg10 0), but the subsequent
local configuration backup was NOT_CONFIRMED and the target remained disabled.
These failures remain historical; later success does not erase them.

The operator then approved implementation of the R2 backup-repair/continuation
plan. A local read-only AST probe reproduced incorrect decoding of a Chinese
path in a UTF-8-without-BOM Windows PowerShell 5.1 script. That is a proven tool
defect, not the exact historical exception, which had not been retained.
The revised ASCII-only helper accepts Unicode paths as encoded arguments and
leaves the actual TOML encoding/bytes unchanged. Synthetic tests also reproduced
missing automatic `Get-Acl` module resolution in the Node-launched helper;
explicitly importing the installed fixed system module resolved that test.
No software/profile/global environment modification was required.

All 14 final backup-helper synthetic tests passed: Unicode/space paths, empty
project, exact byte/ACL preservation, hash drift, receipt collision, reparse
rejection, six failure stages, permission/I/O propagation and temp-root
containment. Fixed failure stage/type/classification is retained without raw
exception text or sensitive sentinels. These tests were local, not hosted CI.

## Protected local backup, exact enable and GUI handoff

A new protected local configuration backup passed at 16:58:52 Asia/Shanghai
(08:58:52Z). Its private location is represented without user-specific paths:

```text
%LOCALAPPDATA%\WePuu\config-backups\p3e2k-r2-20261021T085852Z-0afccfcf8ed3
```

Directory/file access was restricted to the current user, SYSTEM and
Administrators before secret-bearing files were copied. Source bytes and ACLs
were unchanged; copy hashes, empty-project handling and private ACLs passed.
Backups, permission manifests and full configuration are not in this PR.
No database export/restore or complete disaster recovery drill occurred.

After backup, the single R2 lightweight ready check passed at 16:59 local:
MemAvailable 1209776 KiB, memory full avg10 0, unchanged OOM count 175/boot ID,
valid Session/owner, one active target Site, zero target Grants, and matching
protected production baseline. Full historical preflight remained waived and
was not relabelled as passing.

Only the owned target's `enabled = false` changed to `enabled = true`.
Byte comparison confirmed all other bytes identical at patch time:

| File state | Bytes | SHA-256 |
| --- | --- | --- |
| Original user configuration | 4155 | `adef60959a768b8ecb74d06ee9182d35004e95b8d7d5089bb0f8699c0851e5b8` |
| Enabled candidate | 4154 | `60ee87cd4a26ecf76054a19a1874baae5f4210b514817b9b90a45650773bef8d` |
| Project, unchanged empty file | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

One configuration-only App Server check passed at 17:00:59 local, with a single
enabled user-layer definition in project and nonproject contexts. RPCs were
only local handshake initialize, two `config/read`, and
`configRequirements/read`; this was not MCP initialize or a separate OAuth
client. The pinned backend's effective projection may omit `required=false`;
raw explicit false and all other fixed fields were verified.

Initially the operator saw no Authenticate/Login entry. The reviewed installed
GUI only displays it for a `notLoggedIn` host-catalog state, not merely a
configuration row. A bounded existing-log sample was truncated and did not
establish the omission's cause. The operator was asked to save work and perform
one normal restart; they reported that restart completed and the login button
appeared. No assistant process termination, cache clearing, forced restart or
CLI-login substitution occurred. This does not prove a general cache root cause.

The operator then reported `Authentication complete. You may close this window.`
and `Desktop 已连接`. Those are operator GUI evidence, independently supported
below by persisted bindings and the real connected tool result. One manual flow
was instructed/reported; internal HTTP requests are not claimed to be exactly
one, and a Grant count alone does not establish every browser interaction.

## Actual client and protocol evidence

Desktop package remained `OpenAI.Codex 26.1013.4894.0`. The configured/tested
backend was `codex-cli 0.163.0-alpha.10.2`, SHA-256:

```text
f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312
```

Final process-image reads found two running `codex.exe` images with that same
byte hash, although their running paths were not the originally assumed
WindowsApps path. Matching byte identity, not that path assumption, is the
evidence. Process arguments/environment and credential stores were not read.

Preparation used the installed GUI's settings login request shape (Scopes
omitted from RPC) and a separate explicit-read shape in loopback-only mocks.
For this exact backend both requested only `mcp:read` even with five advertised
Scopes. Stable callback/code/S256/state/issuer fixtures passed, including
fail-closed missing/mismatched issuer and wrong state. Those mocks are not
represented as real GUI protocol captures or additional production OAuth.

Official documentation reviewed:
[MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=app),
[configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
and [PowerShell encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding).
Version-specific actual observations take precedence over extrapolating a
general example to an untested client build.

## Binding acceptance

Read-only queries with reviewed visibility and transaction limits found:

- Exactly one new active target business Grant; its Scope is exactly
  `mcp:read`, and account, Home Tenant, Site and Client matches are all true.
- Exactly one corresponding Provider Grant with matching projected binding.
  No complete credential-bearing Provider payload was selected or exported.
- Exactly one local Connector Grant mapping with matching Grant, Site Identity,
  Client, resource, Scope and an existing local WordPress user.
- The original Site/public-key binding is unchanged. No Site pairing or identity
  reset was performed. Revocation remains v2, sequence 0, deny_all false, with
  empty deny markers.

Safe correlation identifiers:

```text
Site ID SHA-256:
235dc1100e449ffecd0100b16d18f7db4e2b7fbda0e3eb17c3b5cf4929300042
New business/local Grant ID SHA-256:
40c99c4a94771bdca049fb3bdbd979cbb7991cfbd7c925ea2fcd3f5f874a0f90
```

No access/refresh token, JWT, Authorization Code, state, challenge, verifier,
Cookie, complete auth URL or private key was extracted. Issuer/audience/Site/
Tenant/Client/Grant/Scope conclusions are configuration, persistence, accepted
validator-contract and successful-access correlation; they are not independent
inspection of every claim in the actual issued JWT.

## Complete runtime catalog and one read-only call

At 18:37:32 local, all current tools exposed by the real Desktop target namespace
were compared with the repository's frozen `EXPECTED_TOOLS`. Only the exact
known host prefix and hyphen-to-underscore identifier normalization were applied.
All 23 names matched, with no missing/extra names; no search subset or count-only
comparison was used. Names containing write operations do not grant write Scope
and were not called.

```text
wp-auto-site-health       wp-auto-site-info
wp-auto-posts-search      wp-auto-post-get
wp-auto-pages-search      wp-auto-page-get
wp-auto-categories-list   wp-auto-tags-list
wp-auto-post-create-draft wp-auto-page-create-draft
wp-auto-post-update       wp-auto-page-update
wp-auto-media-search      wp-auto-media-get
wp-auto-media-upload      wp-auto-media-update
wp-auto-media-set-featured wp-auto-media-import-url
wp-auto-category-create   wp-auto-tag-create
wp-auto-taxonomy-assign   wp-auto-seo-get
wp-auto-seo-update
```

A single-use local budget marker preceded the one assistant invocation of
`wp-auto-site-health({})` through that real Desktop connection:

```text
Observer UTC: 2026-10-21T10:38:37.651Z–10:38:41.561Z
Asia/Shanghai: 18:38:37–18:38:41
Tool isError: false
HTTPS / REST / Abilities / MCP Adapter available: all true
Assistant invocations: 1
Assistant retries: 0
Other business tools: 0
```

Only allowlisted status/version fields were projected. The full return was not
saved, printed or sent to the platform. Automatic Desktop initialization/tool
discovery is supported by its exposed complete catalog and accepted real call;
raw MCP initialize/tools-list wire messages were not captured. No independent
MCP client repeated initialization, discovery or the call.

Existing WordPress Nginx access metadata contains a Codex-classified POST to
exact `/wp-json/wp-auto/mcp`, no query, status 200 at `10:38:44Z`, within the
explicit observer window expanded by 10 seconds at each end. One successful
matching POST was observed. This supports direct client-to-WordPress access
with normal Cloudflare ingress, not a platform content proxy.

The log read was bounded to at most 1 MiB per approved file and 4000 lines;
tail coverage was limited. Time/method/path/agent-class/status correlation is
not a cryptographic request-ID proof. It neither proves every server request
was exactly one nor excludes all lower-level automatic retransmissions. Raw
logs, IPs, user agents, request/response bodies and Authorization headers were
not saved or printed. Four synthetic log-projection tests passed, including
timezone conversion and secret-sentinel filtering. No extra network request
was sent to obtain this evidence.

## Final protection checks and configuration caveat

At 18:41 local, final read-only checks passed on both hosts:

- Same target Grant/Provider/local bindings as before the tool call; no second
  business Grant. Local identity/mapping/revocation projections unchanged.
- All original Site, Pairing Attempt, Outbox and Grant row fingerprints retained;
  only the authorized new business Grant was added. Site A and its current Codex
  Grant/Connector, retired Site B and historical failure/revocation records
  were preserved.
- Five services and container identities healthy/unchanged. OOM count remains
  175; MemAvailable 1212044 KiB, memory full avg10 0 at the final gate.
- Migrations remain 001–013 plus 015, no 014. No migration/deployment occurred.
- Actual Control image remains the previously accepted ADR-023
  `sha256:3e60de660d8e2c344a0464cf6b8b65d008834d5517c55c57877bd7b15e080338`,
  source `69e94218c946fc620af71bfca750657465a9f26c` from
  [Draft PR #98](https://github.com/wepuu/wp-auto/pull/98). This is that accepted
  containerd manifest/image baseline, not a newly published registry digest.
  Authorization image/actual launch command and peers were retained.
- Existing-account-only OTP remains intentionally available, with actual and
  persistent sending true, raw-auth endpoint guard retained, registration closed,
  recipient quotas 3/hour and 6/day and global limit 100/day unchanged. No OTP
  was sent by this acceptance. The obsolete paused-send gate was not applied.
- WordPress's existing accepted source is 64.69.34.90, stored accepted sample
  offset -0.355 ms, root distance 26.954 ms, leap normal, ignored=false.
  Repeated reads are not new NTP updates. Post-call indirect origin-Date/PHP
  bracket was [-1.100149, +1.899851] seconds, containing zero within +/-3;
  it is not direct Node/FPM timing or a historical clock claim.

The final user file hash is
`782d1179b2a564d5d87001cbc2c110f5b77316e950dad4e8f8c8161196c1870a`,
different from the exact enable candidate. A local in-memory TOML comparison
confirmed the target's complete definition still exactly matches the approved
enabled form, no unknown target fields, and the project remains empty. The only
other semantic difference is the existing `node_repl` server's `env` field;
its enabled state is unchanged. Its values were neither printed nor saved.
The source of that later unrelated change was not independently established.

The assistant's patch-time byte-preservation assertion remains valid; a claim
that the entire final user file or every other MCP field stayed unchanged would
not be valid. Both file ACLs remain unchanged. The unrelated change was preserved,
not overwritten, and no old whole-user configuration was restored. This caveat
does not establish a change to the tested WePuu binding or production Site A,
which were independently checked. No broad local-configuration integrity pass
or controlled-use readiness is inferred from this bounded acceptance.

## Final states and stop

```text
P3E2K_LOCAL_CONFIG_BACKUP_VERIFIED=True
P3E2K_EXACT_TARGET_ENABLE_PASS=True
P3E2K_REAL_DESKTOP_RUNTIME_CONNECTED=True
P3E2K_RUNTIME_23_TOOL_NAME_SET_PASS=True
P3E2K_SITE_HEALTH_ASSISTANT_INVOCATIONS=1
P3E2K_PRODUCTION_PROTECTION_POSTCHECK_PASS=True
P3E2K_FINAL_TARGET_CONFIG_MATCH=True
P3E2K_FINAL_WHOLE_USER_CONFIG_UNCHANGED=False
P3E2K_UNRELATED_NODE_REPL_ENV_CHANGE_SOURCE=NOT_CONFIRMED
P3E2K_CONFIGURATION_ROLLBACK_PERFORMED=False

P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=True
P3E2_NEW_SITE_READONLY_MCP_PASS=True
P3E2_NEW_SITE_GRANT_ACTIVE=True
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3D_EMAIL_SEND_PAUSED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Retain the approved enabled target, its new Grant/local mapping, normal Desktop
credentials and private backups. No refresh/replay/revocation, other business
tool, write tool, new pairing, identity reset, logout, cleanup, database restore,
PHP/Nginx/NTP modification, Client change, deployment or automatic merge occurred.
This document-only candidate does not integrate or deploy main/PR #98.

Evidence provenance is separated: operator GUI messages/restart/login;
assistant real Desktop tool metadata/call; direct read-only SSH binding/health/
origin projections; and local isolated helper tests. Content-free local receipts
and helper hashes are retained separately; actual configuration, backups, raw
logs and credentials are excluded. Hosted CI for this document is separate
from production evidence and must be reported at its actual candidate Head.
