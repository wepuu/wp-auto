# P3-E2A: Desktop OAuth preflight stopped on resource metadata 404

Date: 2026-10-18, Asia/Shanghai. **Preflight FAIL; production OAuth/MCP NOT_RUN.**
The approved implementation stopped before adding project configuration or
requesting the separate real-OAuth authorization. Site pairing remains PASS.

## Authority and fixed boundaries

The operator approved read-only preflight and a later gated single Desktop
OAuth/site-health run. Decisions were: project-level configuration first, no
automatic user/global fallback, and verification of existing backups only.
No fresh database export, production repair or registration change was allowed.

```text
Site: https://www.wepuu.com
MCP resource: https://www.wepuu.com/wp-json/wp-auto/mcp
Issuer: https://auth.wpauto.cc
Client: wepuu-e2e-codex
Requested scope: mcp:read only
Reserved new server name: wepuu-p3e2a-wepuu (not added)
```

Draft PR #84 remained at 751bd985fd56207c97befe7a44b6e318481418ff, with CI
39136626145 successful. That earlier pairing evidence was not substituted for
this run's checks or modified. The operator separately confirmed that the
original platform account/workspace and WordPress backend were both logged in.
No Cookie, Session Token, email address or WordPress credential was collected.

## Completed checks and evidence limits

| Gate | Result | Evidence |
| --- | --- | --- |
| Original account, Home Tenant and active owner | PASS | Direct protected platform metadata plus separate operator browser confirmation |
| Current platform Site | PASS | Active, exact resource and original Tenant; same public binding as E1K |
| Target business Grants | PASS | Zero across relevant states, including target Tenant; no grant created |
| Prior pairing/history | PASS | The one successful E1K Attempt and two older failed target Attempts remain; no E2A pairing |
| Site A/current Codex Grant/Connector and original rows | PASS | Retained complete-row comparisons; no new Outbox or revocation operation |
| Five services/images/startup/migrations | PASS | Fixed digests and direct Control startup; 001-013+015/no014 hashes preserved |
| OTP/HMAC | PASS | Actual/persisted false, public/origin guards, read-only mount/custody; budget99 |
| OAuth Client | PASS | Active pre-registered wepuu-e2e-codex; stable loopback path registered; original metadata digest retained |
| Authorization discovery | PASS | Exact issuer, issuer-identification support, S256, code response and public-client support |
| Desktop identity/configuration inventory | PASS | Actual process paths/backend version; no target entry in existing user/project configuration |
| Current project trust | PASS | One existing trusted project entry; no trust change |
| Existing platform backup | PASS with coverage limit | Private custom-format dump hash/custody matched the E1C record; predates new Site |
| WordPress fresh identity/Grant/time/backup recheck | NOT_RUN | Prepared read-only command was not requested for execution after the earlier metadata gate failed |
| Public protected-resource metadata | FAIL | Advertised URI returns404 through public and direct-origin TLS-verified paths |
| New project entry / GUI loading | NOT_RUN | No configuration added; inventory is not proof of a future GUI-loaded definition |
| Real Desktop OAuth/Consent/PKCE exchange | NOT_RUN | No production authorization or token exchange |
| MCP initialize/catalog/site-health | NOT_RUN | No authenticated MCP request or tool call |

Platform direct read-only checkpoints were 2026-10-18T15:03:53.156593Z and
2026-10-18T15:10:18.921433Z (23:03:53 and 23:10:18 Asia/Shanghai). The second
checkpoint confirmed protections after the stop. Query visibility was checked
for the existing observer; no RLS, role, policy or privilege was altered.

Reused E1K checker fields named newAttemptCount=1/newSiteCount=1 describe the
already accepted E1K additions relative to its older baseline. They are **not
new E2A additions**. The exact existing new-Site ID digest begins235dc1100e44,
identity-kid digest c4da574d9692 and public-material digest bc675abdfbd7.
No additional Site or Attempt was created by E2A.

Unchanged runtime references:

```text
Control:
ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e
Authorization:
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

Final bounded resource checks had MemAvailable950632KiB and memory full avg10
0.67, within the reused thresholds; no new OOM or unexpected restart was found.
No production service was restarted or redeployed here.

## Current Desktop and isolated compatibility evidence

Actual GUI process path identified OpenAI.Codex package26.1013.4894.0. Its
running backend is the separately installed binary under
AppData/Local/OpenAI/Codex/bin/896a0166b774037a, not the old packaged CLI:

```text
codex-cli 0.163.0-alpha.10.2
SHA-256 f6dbf48cb70f62649c645f26c87dc9bf84cc36986202dfad8e12fb5b8ca70312
```

The old Get-AppxPackage/where-based resolver found no candidate; process-path
inspection identified the actual GUI/backend instead of silently selecting a
different executable. The existing project/user configuration was inspected
through read-only parsing and initialize/config-read calls. The reserved server
is absent; the one existing user MCP server was not changed. No MCP project
entry or user/global setting was written, and no GUI-login action occurred.

OpenAI Docs was used because this task depends on current Desktop behavior.
Official callback guidance ties stable callbacks to issuer support and warns
that advertised scopes can affect selection:
[MCP configuration and OAuth](https://learn.chatgpt.com/docs/extend/mcp),
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
Published guidance is not used as proof of this exact backend's runtime choice.

Two localhost-only app-server probes used an isolated CODEX_HOME, synthetic
metadata and public Client, with the MCP mock advertising all five frozen MCP
scopes while configuration requested only mcp:read. Both an omitted login-scopes
parameter and an explicit read-only parameter generated:

- Only mcp:read, with PKCE S256 and the exact mock resource.
- Stable /callback with a native loopback listener port.
- No submitted authorization or token exchange, and no access to the real
  credential store. Six requests went only to the localhost metadata mock.

This establishes local backend compatibility, not actual GUI configuration
loading, production OAuth, Token claims verification or MCP acceptance. The
real Client's stable registered path and live issuer metadata were checked
independently; no production callback was exercised to discover compatibility.

## Blocking production observation

The unauthenticated GET to the exact target MCP URL returned401 and advertised:

```text
https://www.wepuu.com/.well-known/oauth-protected-resource/wp-json/wp-auto/mcp
```

The first metadata check failed. A subsequent bounded read-only diagnostic
classified its failing stage/status as metadata/404; no exception text or
response body was exported. An independent standard curl comparison requested
the same advertised URI through each route with normal TLS verification:

| Route | Result | Safe response metadata |
| --- | --- | --- |
| Public Cloudflare path | 404 | text/html; charset=UTF-8; CF cache status DYNAMIC; Ray header present |
| Direct origin148.135.106.145 with original Host/SNI | 404 | text/html; charset=UTF-8; no Cloudflare Ray/cache header |

Both responses contained a Location header, but404 is not a successful metadata
document or an accepted3xx redirect. These checks did not follow that header,
switch the OAuth resource, bypass TLS validation or save response bodies.
No trailing-slash, query-variable or alternative endpoint was substituted for
the URI advertised to real clients.

Therefore this is a genuine public-metadata preflight failure, not a completed
OAuth attempt. Direct-origin404 means it cannot be attributed solely to the
Cloudflare path. It does not yet distinguish Nginx location routing, WordPress
rewrite/serving behavior, another source-side component or their interaction.
No claim is made that Cloudflare WAF, Nginx or Connector is the proven root cause.

The accepted Connector implementation registers a path-specific rewrite and
serves metadata only for an active connection. Those source facts alone do not
prove the current host's effective rewrite or ingress configuration. No rewrite
flush, permalink save, plugin reactivation, direct Options update, Nginx change
or Cloudflare action was performed to make the test pass.

## Existing backups and verification boundary

The operator explicitly selected existing-backup verification, not fresh export.
The platform root-only0700/0600 backup directory was inspected read-only:

```text
/opt/wpauto/backups/p3e1c/20261016T012328Z-QmANC0
dump SHA-256:
780cddefc54feae34ad842fb824b940d4db8a64b66b7a418b37a76f138b014e6
```

It matched the recorded E1C checksum and private regular-file custody. The E1C
record contains its earlier pg_restore/readability/isolated restoration result;
this run only rechecked bytes/custody and did not repeat a restore/listing.
It predates the successful new Site. The phase-one WordPress backup likewise
predates the replacement identity; its latest E1K verification is historical,
not a fresh E2A backup observation. Neither is claimed as a current combined
platform/WordPress recovery point. No backup or SQL/content/identity secret was
uploaded, and no new export or production restore occurred.

## Validation, delivery and next gated step

Local checks executed:

- Eight synthetic public-metadata cases: success,404, wrong issuer, scope
  mismatch, wrong challenge, external redirect, allowed slash redirect and
  network-error secret sentinel. No real network calls in these cases.
- Eighteen retained Desktop preflight tests passed, including disabled project
  layers, configuration conflict/concurrency, strict callback/scope/metadata
  validation and sensitive-output filtering.
- Nine synthetic paired-state cases for the prepared WordPress reader passed,
  and its complete Base64/gzip transport roundtrip was verified. The command
  was not executed on WordPress; no server-side pass is claimed.
- Two exact-current-backend isolated compatibility probes as described above.

Hosted CI and git diff --check validate the documentation candidate only. The
independent Draft PR contains this document, not application/helper/runtime
changes. Original dirty files/design and earlier PRs remain untouched.

Next recommendation is a separately scoped read-only ingress/rewrite diagnosis
of the advertised well-known URI, including its safe Location behavior and
effective target vhost/rewrite handling. Do not reset the paired identity or
repeat pairing to diagnose metadata routing. Any repair needs its own reviewed
scope; resuming E2A requires the advertised URI to serve correct metadata,
fresh remaining gates and separate configuration/real-OAuth approval.

| Acceptance outcome | Status |
| --- | --- |
| Current E2A preflight | FAIL: advertised protected-resource metadata404 |
| Desktop GUI OAuth | NOT_RUN |
| Token binding / Provider / local Grant | NOT_RUN; no new target Grant |
| Complete runtime23-tool catalog / one site-health | NOT_RUN |
| Direct MCP tool transport | NOT_RUN |

```text
P3E2A_PREFLIGHT_PASS=False
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

The three E2 pass booleans are false because acceptance was not performed, not
because a real OAuth exchange or tool call was observed to fail. No user
configuration, production OAuth, authenticated MCP, new pairing, email,
revocation, refresh, migration, image publication/deployment or time repair
was performed. Stop after evidence/CI; do not apply the recommended diagnosis
or repair automatically and do not merge this or historical Draft PRs.
