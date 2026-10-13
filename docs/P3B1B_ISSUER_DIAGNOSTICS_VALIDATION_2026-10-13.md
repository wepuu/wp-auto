# P3-B1B issuer diagnostics and Desktop acceptance preparation

Date: 2026-10-13 (Asia/Shanghai)

This record retains the earlier local diagnostic and pre-GUI state. The later
single real GUI retry passed; see
`P3B1B_CODEX_DESKTOP_PRODUCTION_ACCEPTANCE_2026-10-13.md` for current acceptance.

## Confirmed facts and remaining uncertainty

The operator supplied a failed loopback callback containing one `iss` equal to
`https://auth.wpauto.cc`. Its callback-path digest matched the exact redirect
registered in production. No complete callback URL, authorization code, state,
callback identifier or token is retained in this record.

Read-only inspection of the task **列出已加载 MCP 状态** found an actual failed
`codex mcp login` terminal invocation. Its output reported a missing required
issuer. This is real CLI failure evidence, not evidence of a connection-panel
Desktop login. The invocation did not record executable path/version/hash, so
the historical root cause cannot be attributed to the current binary or to a
specific client defect.

The current app updater reported version `26.1007.21434`, build `13901`, prod
channel and up-to-date status. Windows process/package metadata separately
identified `OpenAI.Codex_26.1007.2314.0`. These are separate version identifiers;
the older Beta `26.727.4816.0` evidence does not establish current compatibility.

The running backend reported `codex-cli 0.162.0-alpha.17.2`. Its SHA-256 is:

`d13914ced6c7af174d8d638db938284231227312104b06a25e9608c632a7daec`

The matching source tag resolves to commit
`740e5af33c71225640e0c1c1555c514c2c93ab74`.
`parse_oauth_callback()` preserves `iss` and `complete_callback()` passes it to
`handle_callback_with_issuer()`. Source inspection alone is not a successful
production Desktop acceptance result.

Read-only production checks during diagnosis confirmed Control, Authorization
and PostgreSQL healthy, migrations 001–013, public discovery issuer and issuer
support correct, and the existing Codex Grant active with its original
`updated_at=2026-10-12 12:03:49.698212+00` and empty revocation reason.
No production service, Client, Grant, schema, Connector or Outbox was modified.
The separate callback-registration operation record remains candidate PR #51;
this change does not merge or rewrite that PR.

## Local changes

- `scripts/test-codex-issuer-compat.mjs` requires an explicit absolute binary,
  records its version/hash, and exercises CLI and app-server OAuth against a
  local mock MCP/PRM/AS server. All ports are ephemeral loopback ports. Each
  case gets an independent temporary `CODEX_HOME` and file-mode synthetic
  credentials. Only OS paths are forwarded to children; existing API keys,
  proxy credentials and custom auth paths are not forwarded.
- The app-server probe uses `mcpServer/oauth/login`; the CLI probe uses
  `--no-browser`. Neither invokes production or opens a browser. The fixture
  checks the synthetic code, redirect, resource and PKCE S256 verifier before
  accepting a token request. Child execution and output are bounded. All
  synthetic artifacts and processes are cleaned up.
- The existing production validation listener now checks exactly one matching
  issuer before releasing a code for exchange. Missing/duplicate/mismatching
  issuers, invalid state/code and provider errors produce fixed content-free
  errors. Its only issuer diagnostics are presence/match booleans. Existing
  positive-rotation, replay and revocation plans are unchanged.

These changes are local validation tooling. They add no runtime API, dependency,
migration or production authentication contract change.

## Actual local validation

The explicit installed binary passed 16 scenarios:

| Entry point | Callback shapes | Matching issuer | Missing issuer | Wrong issuer | Wrong state |
| --- | --- | --- | --- | --- | --- |
| CLI, no browser | stable and callback-specific | success; one token exchange | rejection; zero exchanges | rejection; zero exchanges | rejection; zero exchanges |
| app-server RPC | stable and callback-specific | success; one token exchange | rejection; zero exchanges | rejection; zero exchanges | rejection; zero exchanges |

The result proves the current tested CLI and app-server callback paths work with
a conformant local fixture. It does not prove the earlier CLI invocation used
this binary, nor does it validate a real production Desktop UI connection.

Focused automated tests: 23 passed, zero failed. They include duplicate issuer,
exact issuer/path/state checks, real HTTP listener behavior, zero exchanges after
rejection, bounded timeout/child shutdown, OS-only child environment, output
sentinels and existing Token lifecycle polling/Response regressions.

Full workspace check: passed, 129 passed / zero failed / 18 skipped.
Database-dependent tests and the PHP interoperability test remain skipped in
this run; no production database test was executed. Typecheck, lint, both
script syntax checks and `git diff --check` passed.

The first full check failed in the unchanged Windows HTTPS certificate
fixture before any HTTPS request. The inherited PowerShell module search path
could not load `Microsoft.PowerShell.Security` or the certificate drive.
`git diff origin/main` confirmed the pairing transport/test were unchanged.
The focused HTTPS test and then full check passed with this process-only
environment setting:

```powershell
$env:PSModulePath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\Modules'
pnpm check
```

No machine/user setting or TLS verification was changed. The transient
failure is retained here rather than represented as an initial successful run.
The binary-specific probe is opt-in; normal CI neither downloads nor upgrades
Codex. To rerun it, provide the absolute path to the installed binary:

```powershell
node scripts/test-codex-issuer-compat.mjs --codex-exe '<absolute codex.exe path>'
```

## Real Desktop gate

Immediate read-only preparation confirmed:

- Temporary project still has the exact registered callback digest, Client
  `wepuu-e2e-codex`, exact WordPress resource and only `mcp:read`.
- Control, Authorization, PostgreSQL, test WordPress and its MariaDB are healthy.
- Control remains on digest
  `sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`;
  Authorization remains on digest
  `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- Migration ledger remains 001–013. There is one active platform Site; its
  identifier matches the active Connector and original Codex Grant.
- The original Grant is still active, has the exact original timestamp above
  and no revocation reason. Client metadata remains active with two redirects
  and digest `82cb1b326199869a3ff9f9df7763261a94a1bdf6c75b2956345145854fe718b8`.
- Connector state is v2, sequence 2, two Grant markers, zero token/key markers
  and `deny_all=false`. Its state SHA-256 baseline is
  `74bad59adbeb286c324b7990a679fab9c2e744eeba280367c050a4632d91cdcf`.
- Outbox baseline is seven rows/four delivered. The selected content-free
  metadata snapshot MD5 is `4e3b91bed51324d4cdcce4e906936704` (a comparison
  checksum, not a security primitive). No event was edited or requeued.

These preparation checks do not constitute a Desktop OAuth/MCP pass.

The operator has approved one connection-panel test in the existing isolated
project. Before it starts, record the current Desktop/backend versions, verify
the exact callback digest, fixed Client/resource/read scope and the unchanged
production Grant/Connector/Outbox baseline. Do not launch `codex mcp login` in a
task as a substitute.

The operator clicks Connect in the Desktop UI and uses the existing Grant's
Email OTP account. Stop on another issuer error, unexpected local WordPress
consent, scope expansion or Grant bootstrap. Use actual connection notifications
and tool loading results, not a task's interpretation, as evidence.

Passing requires initialize, the exact 23-tool ordered catalog and one
`wp-auto-site-health` call from Desktop, direct WordPress access evidence and
unchanged original Grant, Connector sequence 2/deny markers and historical
Outbox. Do not automatically log out, delete stored credentials or revoke the
server Grant. Failure is recorded without retries or production repair.

Current status:

```text
CODEX_LOCAL_ISSUER_COMPAT_PASS=True
HISTORICAL_CLI_ISSUER_ROOT_CAUSE_CONFIRMED=False
CODEX_DESKTOP_OAUTH_PASS=False
CODEX_DESKTOP_TOOL_COUNT=not_run
CODEX_DESKTOP_SITE_HEALTH_PASS=False
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Historical callback mismatch and production registration evidence remain in
their separate records/PRs. No P3-B2/P3-B3/P4-A work is included. `design/` is
user-owned and remains untracked.
