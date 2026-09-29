# Phase 2.0.5 Scoped Connector Integration Validation

- Status: accepted and closed
- Date opened: 2026-09-28
- Date validated: 2026-09-29
- Platform branch: `codex/phase-2-0-5-scoped-connector`
- Connector branch: `codex/phase-2-0-5-bearer-auth`

## Evidence ledger

| Gate | Result |
|---|---|
| Contract | pass: ADR-010 and Phase 2.0.5 test plan record the accepted dual-auth, scope and data boundaries |
| Platform deterministic suite | pass in pinned Linux Node 26.7.0 container: typecheck, lint, 55 tests (48 pass, 7 opt-in external skips); typed mapping covers the ordered 23 abilities and all five scopes; native loopback ports and duplicate-resource normalization are adversarially covered |
| Connector deterministic suite | pass: 528 tests / 3608 assertions; 177-file coding-standard pass |
| Dependency audit | pass: no known high-severity pnpm or locked Composer advisories |
| Connector dependency gate | pass: Composer schema accepted with existing exact-version warnings; no locked advisories |
| Real HTTPS WordPress | pass: path-specific PRM, missing-token 401 challenge, direct MCP initialization, 23-tool order, `site-health` and scope denial passed over the fingerprinted Caddy HTTPS fixture |
| Real two-key AWS KMS Bearer verification | pass: both accepted RSA KMS keys signed independent five-minute RS256 `at+jwt` tokens in pinned Node 26.7; WordPress verified both locally without private-key export |
| Codex OAuth/direct MCP | pass: Codex 0.154.0 completed PKCE S256 authorization through the local provider, received a KMS-signed token and called `wp-auto-site-health` directly on WordPress |
| Plugin Check and release-like package | pass: fresh 789-entry production ZIP, no development paths, SHA-256 `022aebdc50fc11f86d9ca79f5aef69d3bddeaa381fcfa445d162545a5086856d`; official Plugin Check 2.1.0 static and runtime-enabled checks both exit 0 with no errors |
| Content-free trace/database review | pass: both control-plane logs and PostgreSQL were checked for the stable tool marker and response marker; neither contained MCP data-plane content |
| Security diff review | pass: Codex Security scan `230be022-1b98-4af0-a720-bd5b5fda28e3` reviewed all 12 security-relevant platform diff items with complete coverage and 0 reportable findings |
| Temporary-state cleanup | pass: `HOSTS_RESTORED=True`, `TRUST_RESTORED=True`; fixture state, hosts marker, test CA, disposable Docker containers/volumes/images, token/trace files and pending authorization URL are absent; Codex user authentication was hash-restored |

The disposable `scripts/test-live-bearer.ps1` harness passed on 2026-09-28. It
generated two independent five-minute tokens through the two real KMS keys in
the pinned Node 26.7 image, installed only public JWKS/grant fixture state,
proved direct MCP initialization and the exact 23-tool order twice, executed
`site-health`, denied `seo-update` under `mcp:read`, suppressed bodies, and
removed the token file and image. Stable evidence flags were:

```text
LIVE_HTTPS_PRM=True
LIVE_MISSING_TOKEN_CHALLENGE=True
LIVE_TWO_KMS_BEARER_READ=True
LIVE_BEARER_SCOPE_DENIAL=True
CONTROL_PLANE_CONTENT_FREE=True
```

Docker's build provenance warning is expected for this uncommitted local
candidate and is not a runtime or signing failure.

The final interactive Codex acceptance on 2026-09-29 produced only these
stable boolean evidence values:

```text
CODEX_OAUTH_LOGIN=True
CODEX_DIRECT_WORDPRESS_MCP=True
CONTROL_PLANE_LOG_CONTENT_FREE=True
CONTROL_PLANE_DATABASE_CONTENT_FREE=True
CODEX_USER_AUTH_RESTORED=True
```

The interoperability fixes required for that acceptance were deliberately
provider-neutral and fail closed:

- `oidc-provider` top-level scopes now contain only `openid` and
  `offline_access`; MCP scopes are registered only on the exact RFC 8707
  resource server, preventing repeated consent without weakening scope checks;
- an already registered `http://127.0.0.1/callback` native client may use a
  dynamic loopback port only when scheme, host, path and query match exactly;
- bounded identical duplicate `resource` parameters are folded to one value,
  while empty, distinct or excessive repetitions are rejected;
- the disposable WordPress fixture trusts only its current Caddy CA and has a
  narrowly scoped safe-HTTP exception for the exact HTTPS platform hostname so
  real JWKS refresh can run inside the isolated Docker network.

## Current decision

All implementation, live client, KMS, package, privacy, cleanup and
security-review gates passed. The user explicitly accepted and closed Phase
2.0.5 on 2026-09-29. This acceptance is not a production deployment decision;
production deployment and Phase 2.0.6 remain outside authorization.
