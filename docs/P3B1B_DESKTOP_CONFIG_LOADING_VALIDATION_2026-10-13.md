# P3-B1B Desktop MCP configuration loading

Date: 2026-10-13 (Asia/Shanghai)

## Boundary and current result

The operator approved completing the real Desktop acceptance, with a single
temporary global MCP entry as a fallback if project-level loading could not be
confirmed. This record covers configuration preparation and read-only production
checks only. No real Desktop OAuth or MCP tool call has occurred in this step.

The supplied Desktop screenshots showed only `node_repl` in the MCP list. The
custom HTTP form exposed URL/Bearer/header fields but no OAuth advanced fields.
That absence does not establish lack of OAuth support: the official Codex
configuration reference supports a pre-registered client, callback, resource,
explicit scopes and default OAuth mode in `config.toml`.

ChatGPT web custom-plugin creation is a separate connection path. No plugin was
created, installed or submitted, and no cloud callback was registered here.

## Fixed client identity and direct evidence

- Running Windows package: `OpenAI.Codex`, version `26.1007.2314.0`.
- Backend: `codex-cli 0.162.0-alpha.17.2`.
- Backend SHA-256:
  `d13914ced6c7af174d8d638db938284231227312104b06a25e9608c632a7daec`.
- Existing project/server: `wepuu-p3b1-desktop-20261012-8f57f886`.
- The existing callback digest remained
  `948841f69ec5cc63242fd56a4cfe77df01deeb57c0ad59546e99bb245fa7c3ea`.

The backend's own generated protocol schema was inspected before issuing
`config/read` with the exact temporary working directory and `includeLayers`.
Only `initialize`, `initialized` and `config/read` were used; no login, thread
turn, tool invocation or credential inspection was performed.

Before registration, the raw project layer contained the target server but was
disabled. Its bounded disabled-reason classification mentioned trust; the user
layer contained no target MCP entry. This is direct evidence of the inspected
backend's loading failure. It does not explain why a previously recorded trust
entry was ineffective, prove that absence of `.git` caused the failure, or establish
the running GUI's effective state.

This backend's typed `config` response omits MCP fields. The probe therefore
checks raw enabled layers, rejects conflicting or partial target definitions,
and projects only fixed match booleans plus a callback digest. It does not infer
success from `codex mcp get` or from a disabled layer containing the config.

## Approved temporary registration and rollback

Only the exact existing server was appended to the user `config.toml` using
`apply_patch`. No existing bytes were changed. The entry fixes the existing
client `wepuu-e2e-codex`, canonical test WordPress URL/resource, `mcp:read`, the
registered exact callback and prompt-based tool approval. No Bearer credential
or Authorization header was added.

The initial registration preparation stopped without writing because its
textual conflict check mistook a trusted-project path for an MCP declaration.
The predicate was narrowed to MCP table headers, a regression test was added,
and the same approved local operation then succeeded. No OAuth was attempted.

- Original user-config SHA-256:
  `61ac17213a216ffc50946c3e308760f1ebcce0ed9473f93f8b26d62ac546f689`.
- Registered user-config SHA-256:
  `55ec4634803c059a311e6bc33a7629f0e62e9102faec424429d4b128cc863dcd`.
- Exact appended-section SHA-256:
  `cf262b8be305e604a571094c7fa05fd15d49e3c79e54a9cb1dc4bdd6c732261f`.

Post-registration `config/read` succeeded and found matching enabled user and
project definitions. The trust/root settings were not edited; the change in
project-layer enabled state is recorded without attributing a cause.

A local ignored receipt contains only ownership/checksum metadata. Rollback
removes only the exact owned suffix, preserves unrelated preceding changes and
refuses a changed suffix. It never restores an entire config backup or clears
credentials. Cleanup remains pending until the operator completes or stops the
GUI acceptance; the entry is temporarily visible beyond the test project.

## Tests and production read-only baseline

- Focused preflight tests: 18 passed, zero failed.
- Existing issuer/lifecycle script tests: 23 passed, zero failed.
- `pnpm check`: 139 passed, zero failed, 18 environment-gated skips; typecheck
  and lint passed. The sandbox's initial pnpm launch returned EPERM while
  resolving the installed NodeJS path; the approved elevated run passed.
- The inherited Windows PowerShell module path was scoped to system modules in
  the test process only, as in the prior validation. TLS and machine settings
  were not changed.
- Script syntax and `git diff --check`: passed.

Read-only SSH checks confirmed:

- Control, Authorization, PostgreSQL, test WordPress and MariaDB healthy.
- Control unchanged at
  `sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`;
  Authorization unchanged at
  `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- Exactly migrations 001–013; no migration was run.
- One active Site, matching the Connector and original Codex Grant; comparison
  Site-ID MD5 `9ef3a43b295d9a69fe448566170a7d34` is not a security primitive.
- `grant_Q0YY…GETM` active, only `mcp:read`, unchanged
  `updated_at=2026-10-12 12:03:49.698212+00`, empty revocation reason.
- Codex client active with two redirects and unchanged metadata digest
  `82cb1b326199869a3ff9f9df7763261a94a1bdf6c75b2956345145854fe718b8`.
- Connector v2, sequence 2, two Grant markers, no token/key marker and
  `deny_all=false`; state SHA-256 unchanged at
  `74bad59adbeb286c324b7990a679fab9c2e744eeba280367c050a4632d91cdcf`.
- Seven Outbox rows, four delivered, five belonging to revoked Sites. A new
  comparison baseline over ordered id/site/sequence/delivered_at/attempt/error
  fields has MD5 `e51c63d2e3d11336a6ca36788ad69efc`; it is not the earlier
  differently shaped metadata checksum and is not a security primitive.

An initial read-only Outbox query used a nonexistent `status` column and was
corrected from the actual repository implementation to `delivered_at`. No
database write, retry of an event or production state repair occurred.

## Remaining actual Desktop gate

The operator must first confirm the same server is visible in the GUI and has
a connection/login action. Only then may the approved single GUI flow start,
with the existing account/client/resource/read scope/exact callback. CLI or a
separate app-server login must not stand in for the GUI. Stop on issuer errors,
callback differences, scope expansion, local WordPress Consent or Grant bootstrap.

Acceptance still requires actual GUI completion, MCP initialize, the frozen
23-tool catalog, one `wp-auto-site-health` call, direct WordPress evidence and
unchanged Grant/Connector/Outbox postchecks. No credential store will be read,
copied, hashed, logged or cleared automatically.

```text
CODEX_DESKTOP_CONFIG_BACKEND_MATCH=True
CODEX_DESKTOP_CONFIG_GUI_LOADED=not_confirmed
CODEX_DESKTOP_OAUTH_PASS=False
CODEX_DESKTOP_TOOL_COUNT=not_run
CODEX_DESKTOP_SITE_HEALTH_PASS=False
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

No production Client/Grant/schema/service/Connector change, P3-B2/P3-B3/P4-A
work or migration 014 occurred. `design/` remains user-owned and untracked.

## Official references

- [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [ChatGPT custom MCP connection](https://developers.openai.com/api/docs/guides/custom-mcp-server)

Historical issuer and callback failures remain in their original records.
PR #51's production registration evidence and PR #52's local diagnostic
candidate are not production deployment authorization.
