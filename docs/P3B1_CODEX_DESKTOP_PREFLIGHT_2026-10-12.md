# P3-B1 Codex Desktop OAuth/MCP compatibility preflight

Date: 2026-10-12

## Scope

This record covers static and local compatibility checks for the installed
Windows Codex Desktop Beta only. It does not record a real OAuth login, create
or revoke a Grant, deploy a service, change the production database, run
migration 014, or change the WordPress Connector.

The exact installed package inspected was `OpenAI.CodexBeta` version
`26.727.4816.0`. The branch started from `origin/main` commit
`fca3c2268adddd44f2bfdbd0a2876880793ad476`.

## Confirmed static compatibility

- The protected MCP resource returned HTTP 401 and advertised the exact
  same-origin Protected Resource Metadata URL.
- The metadata endpoint used one same-origin trailing-slash redirect and then
  published the exact MCP resource, `https://auth.wpauto.cc` authorization
  server, header-only Bearer transport and the existing five-scope catalog.
- Authorization metadata advertised issuer-bound authorization responses,
  PKCE S256 and public-client token endpoint authentication method `none`.
- Official Codex configuration supports a pre-registered `client_id`, stable
  callback URL, explicit OAuth resource and explicit scope list. With issuer
  binding advertised, `http://127.0.0.1/callback` remains the registered stable
  callback and Codex inserts the active ephemeral loopback listener port.
- WPAuto's native-loopback matcher requires `127.0.0.1`, the exact callback
  path and query, and an explicit dynamic port. It does not accept `localhost`,
  IPv6, a changed path or an added query.
- Migration 004 limits one live `pending`, `active` or `suspended` Grant for an
  exact tenant/site/subject/client tuple. `resolveExact()` additionally matches
  the exact resource and scope set before reusing an active Grant.
- The temporary project config explicitly requests only `mcp:read`, preventing
  the five scopes in resource metadata from expanding the existing read-only
  Grant.

## Local execution evidence

`scripts/prepare-codex-desktop-preflight.mjs` generated an isolated project at
the following non-secret temporary location:

```text
C:\Users\liulo\AppData\Local\Temp\wepuu-p3b1-desktop-20261012-8f57f886
```

Its unique server name is
`wepuu-p3b1-desktop-20261012-8f57f886`. The generated project-scoped
`.codex/config.toml` fixes the resource, client, callback and `mcp:read` scope;
it does not modify the user's global Codex configuration.

The exact bundled `codex.exe` from Desktop `26.727.4816.0` parsed this config
from an isolated `CODEX_HOME` and returned the expected enabled streamable-HTTP
server and exact MCP URL. No OAuth login command was invoked. No authorization
URL, callback, OAuth artifact or local credential was created.

The preflight implementation does not read, copy, hash or print `auth.json`,
the Codex credential store, Cookie, Token or PKCE material. The older
`scripts/test-live-codex-oauth.ps1` is explicitly unsuitable for P3-B1 because
it copies `auth.json` and was not used.

## Test results

- `node --check scripts/prepare-codex-desktop-preflight.mjs`: passed.
- Focused Node tests: 7 passed, 0 failed.
- Repository typecheck and lint: passed.
- `git diff --check`: passed.
- Changed-file secret-pattern scan: no findings.
- The complete test invocation reached 129 tests: 111 passed, 17 existing
  environment-gated tests skipped, and one existing pairing HTTPS fixture
  failed because this restricted Windows runner could not create a temporary
  certificate in the current-user certificate store. The failure occurred
  before the fixture exercised product code and is unrelated to the P3-B1
  changes; it is recorded rather than reported as a successful full check.
  The pairing package, lockfile and fixture are byte-identical to `origin/main`;
  the fixture blob is `64149b4f5e4c342ef39411036751d614ad6a2070` in both trees. TLS validation was
  not disabled or weakened.

## Production read-only confirmation

The approved SSH read-only check completed without starting OAuth or changing
production state:

- `wpauto-control-1`, `wpauto-authorization-1`, `wpauto-postgres-1`, the test
  WordPress container and its MariaDB container all reported healthy.
- Public readiness returned `ready`; OIDC metadata, OAuth metadata and JWKS
  each returned HTTP 200. The MCP resource returned the expected unauthenticated
  HTTP 401.
- `wepuu_schema_migrations` contained exactly migrations 001 through 013.
- `wepuu-e2e-codex` was active, pre-registered and had the single registered
  redirect URI `http://127.0.0.1/callback`.
- Exactly one platform Site was active. Its content-free ID hash matched the
  Connector connection and version-2 revocation-state Site hashes, and its
  resource was the exact test MCP endpoint.
- The Connector connection was active. Its revocation state remained version
  2 at sequence 2 with the two expected Grant deny markers from P3-A lifecycle
  acceptance and no token deny marker.
- The masked Codex Grant `grant_Q0YY…GETM` remained the only live Grant for
  that client. It was active, bound to the same hashed active Site and exact
  `mcp:read` scope, retained `updated_at=2026-10-12 12:03:49.698212+00`, and had
  an empty revocation reason.
- The production partial unique index still covers
  `(tenant_id, site_id, subject_id, client_id)` only while status is pending,
  active or suspended.

Using the same Email OTP account, exact client, active Site, resource and
`mcp:read` scope therefore resolves the existing active Grant through
`resolveExact()` rather than inserting another live tuple. A different account,
scope or resource is not treated as reuse and is outside the authorized
P3-B1B path. There is no unique-index conflict risk for the specified exact
reuse flow.

The P3-B1A preflight is complete:

```text
CODEX_DESKTOP_STATIC_COMPATIBILITY_PASS=True
CODEX_DESKTOP_PREFLIGHT_PASS=True
CODEX_DESKTOP_OAUTH_STARTED=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

## Remaining P3-B1B gate

The separately authorized P3-B1B run must use the temporary project,
initiate OAuth once, stop on any scope or callback mismatch, call only
`wp-auto-site-health`, clear only the temporary local credential and verify
that the existing production Grant did not change.
