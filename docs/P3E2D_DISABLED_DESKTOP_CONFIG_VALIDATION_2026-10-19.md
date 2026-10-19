# P3-E2D: disabled Desktop MCP configuration recognition

Date: 2026-10-19 (Asia/Shanghai). Scope: approved local project configuration
creation, backend parsing and operator-confirmed disabled settings visibility.
This is not runtime MCP, OAuth or production acceptance.

## Authorization and preserved boundaries

The operator explicitly approved creating the project entry while keeping it
disabled, without enabling or starting OAuth. The original project config was
absent. No existing file was overwritten. The original dirty worktree, design/,
user/system configuration, existing servers and credential stores were preserved.
This independent branch starts from main e8778da33d850303d1ccbdfbebf088610bf6ac5f
and adds this record only. The actual project config remains local/untracked;
it is not distributed as repository configuration.

No production SSH, business database query, endpoint probe, OTP, pairing,
Consent, code/token exchange, MCP initialization/discovery/tool call, deployment,
migration, trust change or Desktop restart was performed in this stage.

## Exact approved local definition

Project-relative path: `.codex/config.toml` in the existing wp-platform project.
Size: 349 bytes, LF. SHA-256:

```text
00610c38465e25c1b90adf21108581f95f78fe50174156eecea1e6cf231ed139
```

```toml
[mcp_servers.wepuu-p3e2a-wepuu]
url = "https://www.wepuu.com/wp-json/wp-auto/mcp"
oauth_resource = "https://www.wepuu.com/wp-json/wp-auto/mcp"
scopes = ["mcp:read"]
enabled = false
required = false
default_tools_approval_mode = "prompt"

[mcp_servers.wepuu-p3e2a-wepuu.oauth]
client_id = "wepuu-e2e-codex"
callback_url = "http://127.0.0.1/callback"
```

No Bearer, header helper, secret or copied authentication state was added.
Project trust already existed. NTFS inheritance/ownership were checked, not
changed. The absent original file was recorded rather than inventing a backup
copy. Rollback was not performed: a future removal must target only this owned
new file while its exact approved hash still matches, otherwise stop.

## Direct local executable and backend evidence

- Desktop package manifest/process: OpenAI.Codex 26.1013.4894.0; executable
  ChatGPT.exe in the installed WindowsApps package.
- Actual backend: codex-cli 0.163.0-alpha.10.2, executable SHA-256
  f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312.
- App-server IPC handshake and config/read only; its initialize handshake is
  not an MCP initialize. No thread/run/login or target transport was invoked.
- Before-write gate: 07:47:33.381Z. Successful after-write reading:
  07:49:05.850Z. Post-operator-confirmation final read: 07:53:01.647Z;
  exact transition verification: 07:53:01.847Z (all UTC).
- Project layer was active/readable, with exactly one target definition and
  exactly one same-resource definition. The server itself remained disabled.
  Layer disabled=false is not server enabled=true.
- Effective definition exactly matched all approved fields. User config bytes
  and existing node_repl definition were unchanged; system config remained
  absent. No Site A definition was visible in these layers; this does not
  establish absence of Site A credentials or its production Grant.

Initial after-write observation was NOT_CONFIRMED because the observer treated
a returned project-directory path as a config file. It was corrected to
fingerprint file paths only, with a regression test. This was not a TOML parse
failure; no approved configuration field changed to resolve it.

Default sandbox command setup later failed before process launch with a helper
setup-refresh error, including one non-mutating retry. Approved alternate
execution context allowed read-only checks. Cause remains unconfirmed; no
sandbox/Windows security setting was changed and no fix is claimed.

## Operator GUI evidence and its exact limits

Computer Use skill restrictions prohibit automating the displayed ChatGPT
desktop UI. Only app inventory was obtained; no window screenshot, activation,
click or keyboard automation was used. GUI verification was handed to the
operator instead of bypassing the restriction.

The operator first confirmed the target name, URL and disabled state. They then
clarified the exact surface: **Settings > Plugins > MCP shows the definition,
but the chat-window /mcp list does not show it.** This correction is retained.

| Check | Result | Evidence source |
| --- | --- | --- |
| Approved file created and unchanged | PASS | direct file/hash checks |
| Current backend reads exact disabled definition | PASS | config/read |
| Settings list recognizes name/URL/disabled state | PASS | operator report |
| Chat-window /mcp shows target | NOT_CONFIRMED | operator reports not visible |
| Enabled runtime loading/transport | NOT_RUN | deliberately disabled |
| Target initialize, tools/list, tools/call | NOT_RUN | outside authorization |
| Production GUI callback/OAuth | NOT_RUN | outside authorization |

Official OpenAI documentation says enabled=false disables a server without
removing its configuration: [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
It does not establish how this exact desktop version renders disabled entries
in the chat-window /mcp list. No UI bug, runtime success or cache/restart cause
is claimed. Do not enable or restart merely to make the item appear there.

Callback configuration uses the stable loopback path previously tested in E2C.
The same backend version/hash is still present. E2C isolated mock tests checked
resource, mcp:read, code/S256 and callback behavior; these remain isolated
compatibility evidence, not fresh production registration/callback validation.
See [E2C Draft PR #87](https://github.com/wepuu/wp-auto/pull/87), Head
1e7eddbb602892f2a401519db7d86bb3ec40c6a8 and
[CI 39213190559](https://github.com/wepuu/wp-auto/actions/runs/39213190559).
Issuer-dependent callback behavior is documented in the
[MCP configuration guidance](https://learn.chatgpt.com/docs/extend/mcp).

## Tests, data boundary and handoff

Local node tests: **14 PASS, 0 failed/skipped**. Synthetic cases cover exact
disabled definition, existing/conflicting files/resources, untrusted project,
backend drift, non-regular file, duplicates, accidental enable, scope/callback
or secret mismatch, ignored project layer, changed global/other-server state,
unapproved byte changes, and directory-versus-file paths. Exact transition
verification passed after the operator GUI confirmation. Helpers/evidence are
local temporary files, not application runtime changes or hosted test claims.

No WordPress content, credentials, token payloads or business identity rows were
read or sent to the platform. This document contains only control configuration
and sanitized evidence. Hosted document-candidate CI is linked against the
immutable Head in the Draft PR; it cannot replace GUI or production evidence.

```text
P3E2D_DESKTOP_CONFIG_CREATED=True
P3E2D_DESKTOP_BACKEND_CONFIG_PARSED=True
P3E2D_DESKTOP_SETTINGS_CONFIG_RECOGNIZED=True
P3E2D_DESKTOP_GUI_CONFIG_LOADED=NOT_CONFIRMED
P3E2D_DESKTOP_CHAT_MCP_VISIBLE=NOT_CONFIRMED
P3E2D_DESKTOP_SERVER_ENABLED=False
P3E2D_CALLBACK_STATIC_COMPATIBILITY_PASS=True
P3E2D_CALLBACK_PRODUCTION_VALIDATED=False
P3E2A_PREFLIGHT_PASS=False

P3E2_NEW_ACCOUNT_CODEX_OAUTH_PASS=False
P3E2_NEW_SITE_READONLY_MCP_PASS=False
P3E2_NEW_SITE_GRANT_ACTIVE=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Production pairing/Grant/mail state above is carried from E2C, not freshly
revalidated by this local-only stage. The ambiguous GUI_CONFIG_LOADED flag is
not set True from settings visibility alone. Disabled settings recognition is
complete; active chat runtime recognition is deliberately not accepted.

Stop after this Draft PR/CI handoff. Keep the new local definition disabled.
Enabling, runtime loading, one real GUI OAuth and one read-only tool call need
separate authorization and fresh applicable prechecks. Do not merge any PR or
change global settings, production Client registration, Site A or credentials.
