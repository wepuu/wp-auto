# P3-B1B real Codex Desktop OAuth/MCP acceptance

Date: 2026-10-13 (Asia/Shanghai)

## Result and evidence boundary

The approved single GUI OAuth/MCP acceptance passed. The operator confirmed
that the existing server appeared in the Desktop MCP list with a login action,
initiated the flow through that UI, and reported the browser message
`Authentication complete. You may close this window.` together with a connected
Desktop state. No terminal `codex mcp login` or separate app-server OAuth login
was used for this attempt.

The connected server's 23 tools then became callable in this actual Desktop
chat. Exactly one `wp-auto-site-health` tool call succeeded through that server.
Its safe structured runtime flags were validated in memory; no response body,
WordPress content, Token, Cookie, Code, verifier or callback identifier is
included in evidence.

This passes P3-B1B only, not full P3-B acceptance or public-registration readiness.

## Fixed client and configuration

- Windows package: `OpenAI.Codex`, `26.1007.2314.0`.
- Backend: `codex-cli 0.162.0-alpha.17.2`; SHA-256
  `d13914ced6c7af174d8d638db938284231227312104b06a25e9608c632a7daec`.
- Server/project: `wepuu-p3b1-desktop-20261012-8f57f886`.
- Client: `wepuu-e2e-codex`.
- URL/resource: `https://test.wpauto.cc/wp-json/wp-auto/mcp`.
- Explicit scope: `mcp:read`; prompt-based tool approval.
- Exact no-port callback digest:
  `948841f69ec5cc63242fd56a4cfe77df01deeb57c0ad59546e99bb245fa7c3ea`.

The current package/backend identity and effective configuration were fixed
before the GUI flow. Production continued enforcing its existing PKCE S256,
issuer and exact redirect contracts. No raw OAuth request/response or Token was
extracted to independently inspect secret-bearing protocol parameters.
The older Beta/CLI evidence is not substituted for this current Desktop run.

## Actual MCP and direct WordPress evidence

- All 23 callable tools were exposed under this server's namespace; their exact
  name set matched the frozen `EXPECTED_TOOLS` list in the production validator.
  This was the complete runtime tool inventory, not a filtered GUI list.
- The host enumerates exposed names alphabetically. Raw `tools/list` wire order
  was not captured and is not claimed as separately observed in this run.
- The connected initialized runtime discovered the catalog and successfully
  executed one `wp-auto-site-health` call. No separate wire trace of initialize
  was retained.
- The single call had `isError=false` and safe structured availability/HTTPS
  checks passed. No other WordPress ability was called.
- Local tool-call clock window: `06:10:29`–`06:10:38` UTC
  (`14:10:29`–`14:10:38` Asia/Shanghai).
- Within the bounded `06:10:25`–`06:10:45` UTC origin log window, test WordPress
  recorded exactly one POST to the exact MCP path with HTTP 200 at
  `2026-10-13T06:10:39.774197747Z`.
- Control and Authorization logs in that same bounded window had zero references
  to the MCP path, `tools/call` or the called tool name. This count is corroborating
  evidence, not an exhaustive proof that arbitrary content can never be logged.

Only timestamp, fixed method/path identification, status and counts were exported
from origin logs; no IP, headers, request body or response content was recorded.
The direct server configuration, actual tool transport and origin access evidence
support the client-to-WordPress result without a platform MCP proxy.

## Unchanged production baseline

Immediate pre-GUI checks began at `2026-10-13T05:43:25Z`. Post-call read-only
checks confirmed:

- Control, Authorization, PostgreSQL, test WordPress and MariaDB healthy.
- Migration ledger: 13 entries, ending at `013_email_otp_login.sql`.
- One active Site; its comparison ID hash matched Connector and Codex Grant:
  `9ef3a43b295d9a69fe448566170a7d34` (MD5 is not a security primitive).
- `grant_Q0YY…GETM` remained active with only `mcp:read`, original
  `updated_at=2026-10-12 12:03:49.698212+00`, and empty revocation reason.
- Client active, exactly two redirects and unchanged metadata digest
  `82cb1b326199869a3ff9f9df7763261a94a1bdf6c75b2956345145854fe718b8`.
- Connector active, pairing-matched v2 state, sequence 2, two Grant deny markers
  and `deny_all=false`; state SHA-256 remained
  `74bad59adbeb286c324b7990a679fab9c2e744eeba280367c050a4632d91cdcf`.
- Outbox remained seven rows/four delivered/five old-Site rows. The same ordered
  metadata checksum remained `e51c63d2e3d11336a6ca36788ad69efc`.

No Site or platform Grant was created/replaced/revoked, no event was changed or
requeued, and no service image, schema, Connector, DNS or Nginx was modified.
Normal OAuth artifacts created by the client are not artificial database writes.

## Local cleanup

The owned appended global config section was removed with `apply_patch` after
the tool call and production postchecks. Its exact suffix/hash matched the
registration receipt. Every non-target byte present immediately before cleanup
was preserved. The full file no longer matched its original registration-time
checksum because unrelated preceding config changes had occurred; those changes
were retained rather than overwritten from a whole-file backup.

No MCP logout, credential-store read/copy/hash/deletion, server revocation or
forced Desktop shutdown occurred. The existing temporary project and its config
were retained. Cached GUI visibility can change on the next normal refresh; this
does not revoke the active platform Grant.

## Validation and status

The configuration implementation was already validated with 18 focused preflight
tests and 23 existing issuer/lifecycle tests. `pnpm check` passed with 139 passed,
zero failures and 18 environment-gated skips. Commit `8095f6b`'s hosted workflow
`38350842423` passed before this documentation-only acceptance update.

```text
CODEX_DESKTOP_CONFIG_GUI_LOADED=True
CODEX_DESKTOP_OAUTH_PASS=True
CODEX_DESKTOP_INITIALIZE_PASS=True
CODEX_DESKTOP_TOOL_COUNT=23
CODEX_DESKTOP_TOOL_CATALOG_MATCH=True
CODEX_DESKTOP_SITE_HEALTH_PASS=True
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=True
CODEX_DESKTOP_GRANT_UNCHANGED=True
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

P3-B2/P3-B3, Google login, public-plugin submission, P4-A, migration 014 and
destructive lifecycle tests were not started. `design/` remains untracked.
Historical callback/issuer failures and preparation facts remain in their original
records; this result does not retroactively turn those attempts into passes.
