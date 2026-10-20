# P3-E2H: read-only gate stopped before WordPress checks

Date: 2026-10-20. Result: **NOT PASS; stop before formal authorization**.

## Scope and authority

This round implemented local preparation and fresh read-only critical gates for
the proposed Desktop OAuth acceptance. The operator confirmed both original
accounts/workspaces and the WordPress PuTTY session were ready. This was not
approval to enable the MCP definition or to perform OAuth.

No Desktop enable, OAuth/Consent/code exchange, MCP JSON-RPC/tool call, OTP,
pairing, identity reset, clock adjustment, production configuration change,
service restart/recreation, deployment or migration was performed by this task.
Metadata GETs and unauthenticated HTTP challenge checks were allowed read-only
probes, not an authenticated MCP acceptance run.

The task stopped when the operator returned a failed WordPress launcher
validation with `checksExecuted=false`. No retry was performed. No closing
production gate was attempted after this failure. The earlier gates below are
bounded observations, not a claim that all final protections were revalidated.

## Fixed target and retained history

- Target: `https://www.wepuu.com`.
- MCP resource: `https://www.wepuu.com/wp-json/wp-auto/mcp`.
- Issuer: `https://auth.wpauto.cc`.
- Client: `wepuu-e2e-codex`; requested scope for a future approved flow: only
  `mcp:read`.
- Desktop server: `wepuu-p3e2a-wepuu`, still disabled.
- Callback definition: `http://127.0.0.1/callback`.

PR #92 remained open and Draft at
`99402aabf4c0a0eee69878e722511011a0cea9cd` when read this round. Its earlier
approved timing/order amendment and PASS remain historical evidence only;
neither its WordPress result nor its amended clock window was reused here.
PR #89/#90/#91 failure/stop history is not overwritten.

## Local preparation and test results

Fresh local results: **108 tests passed; zero failed**:

- 14 existing configuration/enable/disable tests, including Python compilation
  without executing the embedded server payload.
- 12 existing read-only transport/aggregation tests.
- 22 existing timing, read-only dispatch and WordPress projection tests.
- 16 new catalog and synthetic post-authorization binding predicate tests.
- 18 existing core synthetic tests, 18 resource-diagnostic tests and eight
  login-helper synthetic tests. These tests did not send mail or invoke live
  recovery actions.

The frozen 23-name catalog was read from the reviewed repository source without
running its production acceptance script. Synthetic predicates require the
complete exact set, not just a count or filtered GUI view. A separate synthetic
binding predicate permits one correctly bound new business Grant, its Provider
Grant and local mapping while preserving old records. It does not run SQL,
inspect tokens or establish live post-OAuth acceptance. A production-safe
postcheck still must be finalized before any later formal execution; the old
zero-Grant precheck must not be used as a post-OAuth assertion.

Only ignored local helper/evidence files were created. Actual project/user
configuration and credentials were not modified. Helper hashes:

| Local artifact | SHA-256 |
| --- | --- |
| New read-only orchestration shell | `cd49383d8bb31fb604706fcbf0e7a40b842235b9d04a9bcf8838e72efeedf0c0` |
| Catalog/binding predicates | `c1f8d43e95606649c1b038456bf4a0ce7f3aff506931d25d025d288ed2ff856a` |
| Predicate tests | `a87f0fed52a1a7efeb6887878baebffca374971c946309a1bd6779d8395526a4` |
| Reused frozen core | `4cebe882863b3e69df5f5ad8cce8531b6cedbfdb8d4eb3759e41245834baf906` |
| Reused read-only dispatcher | `3096e55c103eefc44a3c025bc9349e1f17d27b1adca455492d2ddcba99a8e111` |

The inherited dispatcher retains its E2G status/nonce syntax. Its outputs are
owned by a new E2H evidence directory and fresh run; they are not copied E2G
receipts. The new wrapper does not expose recovery/enable/OAuth actions.

## Current evidence window and completed gates

Start was recorded before the first production sample:
`2026-10-20T06:25:20.079Z` (14:25:20.079 Asia/Shanghai), with a local monotonic
start. The intended 15-minute deadline was `06:40:20.079Z`. Failure stopped the
run before completion; no timing extension or order amendment was requested.

All UTCs below are receipt times unless explicitly described as a server sample.

| Gate | UTC | Result and scope |
| --- | --- | --- |
| Initial resource/services | 06:25:24.685 | PASS: MemAvailable 1,175,136 KiB; memory full avg10 0; host OOM count 174 matched baseline; five healthy; existing container identities and actual/persisted sending pause matched approved checkpoint |
| Complete platform reader including runtime protections | 06:25:38.781 | PASS: MemAvailable 1,159,148 KiB; full avg10 0; original account Session/owner, target binding, zero target Grants and protected business history matched |
| Public metadata/challenge | 06:26:36.106 | PASS: slash URL 200; non-slash 301 then same-origin 200; metadata, Discovery, read scope and 401 challenge matched; TLS verification retained |
| Direct-origin metadata/challenge | 06:26:43.429 | PASS: corresponding source-origin routes/fields and 401 challenge matched with TLS/Host preserved |
| Client/Discovery/existing platform backup | 06:26:52.030 | PASS: active pre-registered Client, stable callback, exact existing client row digest and existing backup integrity |
| Actual backend and disabled project definition | 06:26:58.778 | PASS: reviewed project layer loaded, one target/resource definition, original 349-byte disabled file; no OAuth started |
| WordPress launcher | operator returned result | FAIL at transport validation; `checksExecuted=false` |
| WordPress identity/NTP/five clock brackets/backup in this round | — | NOT_RUN, not filled using previous results |
| Lightweight ending gate | — | NOT_RUN after the stop condition |

Resource thresholds were unchanged: MemAvailable >= 524288 KiB and memory full
avg10 < 1. Current readings do not establish long-term resource stability.

The platform reader confirmed fixed Control and Authorization images, direct
Control startup, unchanged migration hashes for 001–013 + 015/no014, unchanged
Site A/current Codex Grant/Connector, historical rows and Outbox, HMAC and public
and origin sending guards. Visibility was checked with read-only queries; no
RLS or privileges were changed. Earlier pairing deltas reported by the reader
refer to E1K history, **not new E2H Attempts or Sites**.

Control digest:
`sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e`.
Authorization digest:
`sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.

Desktop package was `26.1013.4894.0`; backend was
`codex-cli 0.163.0-alpha.10.2`, SHA-256
`f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312`.
Project file SHA-256 remained
`00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139`.
The backend inventory is not new real GUI connection or OAuth evidence.

The existing platform backup was hash-verified; it predates the new Site. The
WordPress backup was not reverified in this failed round. Neither old backup
is represented as a complete current paired-identity restore point.

## Transport failure and limits of attribution

The operator returned only:

```json
{"status":"e2c_transport_validation_failed","checksExecuted":false}
```

The reviewed launcher gates execution on decoding/decompression plus a fixed
payload SHA-256. The local stored command had SHA-256
`1d0b03a243db66d207876ba2819fc0fb5b3b033c9d8d28ba5b1a5ef63d3418af`;
the expected decoded payload hash was
`73d319abd8459ca5896e1348b81ab4d92875d97eaeb0a1c79cdcb3abfe767ed4`.
These are hashes of local artifacts, not proof that identical bytes reached
the terminal. The returned category does not distinguish decode, decompression
and digest mismatch. The received command bytes were not collected. Whether
the difference occurred in assistant publication, copying or terminal input
is **NOT_CONFIRMED**; no WordPress/server defect is inferred.

The assistant initially published an incomplete non-executing placeholder
which would only print `COMMAND_NOT_READY`, immediately withdrew it, then
published the purported complete command. Execution of the withdrawn
placeholder was not confirmed. The actual failure above was preserved without
retrying or weakening the integrity check. Local tests did not establish an
end-to-end byte identity for the command as displayed/copied through chat.

Operator evidence and assistant direct readings are deliberately separate:
platform/public/origin/backend results were directly collected; browser
readiness and failed WordPress launcher output were supplied by the operator.
There was no fresh FPM/Node time measurement or fresh WordPress runtime
inspection in this round.

## Stop, next minimum action and state

Do not request formal OAuth execution approval on this incomplete gate.
First repair only the local command-delivery workflow: regenerate a bounded
read-only command from the frozen source, verify the exact delivered form
end-to-end with synthetic corruption/truncation tests, then propose a separately
approved single read-only retry with a new evidence window. Do not ask the
operator to bypass SHA-256, run a partially decoded payload, or reuse stale
WordPress evidence. A shorter reviewed command or verified local file transfer
may be considered, but no new transfer channel or host file execution is
authorized merely by this recommendation.

Formal enable/OAuth still requires a full passing gate report and its own
explicit approval. No approval was sought or inferred here.

```text
P3E2H_CRITICAL_PREFLIGHT_PASS=False
P3E2A_PREFLIGHT_PASS=False
P3E2H_WORDPRESS_CHECK_EXECUTED=False
P3E2H_WORDPRESS_TRANSPORT_CAUSE_CONFIRMED=False

P3E2E_DESKTOP_ENABLE_PERFORMED=False
P3E2E_OAUTH_ATTEMPT_PERFORMED=False
P3E2E_MCP_TOOL_CALL_PERFORMED=False
P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=False

P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The paired active Site, zero target Grants and paused email were directly
confirmed at the completed platform gate, not by an end-of-run recheck.
Earlier pairing/clock-repair PASS and E2G window-specific PASS are not rewritten.

## Repository delivery

Independent docs-only branch from main
`e8778da33d850303d1ccbdfbebf088610bf6ac5f`. No application/runtime files,
actual Desktop configuration, credentials, raw logs, business payloads or
private helper bundles are committed. Original dirty worktree and `design/`
are preserved. Draft PR only, no merge. Local and Hosted CI results are
reported separately; document CI cannot turn this production gate into PASS.
