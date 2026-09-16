# Phase 2.0.1 Validation

- Date: 2026-09-16
- Status: provider-neutral local/HTTPS/PHP gates passed; Auth0 formally
  rejected; Codex 0.154.0 pre-registered OAuth path passed; WorkBuddy 5.5.2 is
  unsupported; Auth0 test clients and fixture state were removed; Phase 2.0.1
  is closed.

## Scope and boundaries

- All implementation is isolated under `spikes/oauth-conformance/`.
- No production service, migration, deployment, or connector change was made.
- The reference connector at `D:\Codex\wp-auto-connector` remains untouched.
- Control-plane evidence is content-free; MCP bodies, credentials, cookies, and
  user identifiers are never retained.

## Executed checks

### Local provider and persistence

`npm.cmd run test:persistent` completed with **37 passed, 0 failed, 1 skipped**
using Docker PostgreSQL 16. The single skip is the deliberately opt-in Auth0
network smoke. The suite covers the provider-neutral P01–P12 and N01–N16
catalog, authorization code + PKCE, exact resource/audience, issuer
response, strict redirects, scope ceilings, 403 insufficient scope, refresh
rotation/replay, revocation, PostgreSQL restart recovery, JWKS overlap/cache,
unknown-key denial, outage fail-closed behavior, DCR/CIMD policy, and direct
WordPress resource simulation.

The final parallel run exposed a PostgreSQL catalog race when independent test
workers initialized an empty database concurrently. Schema preparation now uses
a transaction-scoped advisory lock, and a four-way concurrent preparation
regression passed in the final persistent run.

### Auth0 disposable tenant

Metadata was fetched from tenant `dev-o173hfg1cbmd0crj` with no secrets stored:

- AS metadata: 200; issuer, JWKS, authorization, token, registration, and
  revocation endpoints present; RFC 9207 issuer response enabled; S256 listed.
- Exact resource authorization request: redirected to Auth0 login (302).
- Mismatched resource: redirected to the registered loopback callback with
  `error`, `iss`, and `state` (302).
- DCR probe: 201 with `token_endpoint_auth_method=none`; response fields were
  redacted and the client must be removed with the Management API.
- Plain PKCE: Auth0 advertised `plain` and accepted the request into login.
  This is N04 hard-fail and rejects Auth0 for this profile. No audience/private
  compatibility shim was added.

The repeatable probe is `npm.cmd run conformance:auth0`. It never runs DCR
creation unless `AUTH0_DCR_PROBE=1` and `AUTH0_MGMT_TOKEN` are both present, so
an orphan client cannot be created accidentally.
The already-created probe client can be removed with
`AUTH0_CLEANUP_CLIENT_IDS=<opaque-id>` plus the same short-lived management
token; the cleanup path uses `DELETE /api/v2/clients/{opaque}` and records only
the status code.

The DCR probe client was deleted through the minimum-scope Management API path.
The content-free result was `DELETE /api/v2/clients/{opaque}` with status 204;
neither the client ID nor the Management API token is retained in evidence.
The one-time M2M application used to mint that token was subsequently deleted
from the Auth0 Dashboard.

### Temporary HTTPS fixture

The pinned `node:24.21.0-alpine` + `caddy:2.10.2-alpine` fixture successfully
served `https://auth.example.test` and the exact resource URL. It exposed PRM,
Bearer challenge, AS metadata, DCR, explicit login/consent, and S256-only PKCE.
The imported CurrentUser root was tracked by SHA-256 fingerprint
`66BADF4D6A660ECF203800091FCAE9B24002023C5620F81D4909C2F59EC51AA6`.

### PHP/JWKS interoperability

`npm.cmd run interop:php` passed with Docker PHP 8.1.34, Composer 2.10.3, and
`lcobucci/jwt` 4.3.0. Tokens were issued by the real local provider before and
after overlapping key rotation. RS256, `typ`, `kid`, issuer, single audience,
time, and scope validation passed; audience-array, expiry, unknown-`kid`, and
unknown-algorithm cases were rejected. `npm.cmd audit
--audit-level=high` reports zero vulnerabilities; Composer audit reports no
security advisories.

### Client evidence

- Codex CLI 0.154.0 accepts all four isolated registration configurations. Its
  pre-registered native-client path completed PRM/AS discovery, emitted an
  Authorization Code + S256 URL, completed explicit login and consent in an
  isolated no-proxy Chrome profile, accepted a dynamic `127.0.0.1` loopback
  callback port with fixed `/callback` path, and exchanged the code at
  `/token` with status 200. The fixture permits this port variance only for
  `codex-test-client`; scheme, host, and path mutations remain rejected.
  Refresh, revoke, reconnect, and direct tool invocation were not exercised by
  the Codex `mcp add` command and remain client follow-up coverage, not an open
  Authorization Code exit gate.
- WorkBuddy GUI 5.5.2 / `codebuddy` 2.137.1 read the valid project `.mcp.json`
  documented by CodeBuddy, but after full restart the Connector runtime still
  listed only two built-in MCP services. A synthetic, content-free request
  produced no resource, AS, or browser request. This version is recorded as
  **unsupported** for standard OAuth-protected Streamable HTTP MCP; no global
  config or protocol relaxation was used.
- Before cleanup, `~/.mcp.json` and `~/.codebuddy/.credentials.json` remained
  absent exactly as in the baseline snapshot.

### Restoration

- Codex temporary state and the temporary Chrome profiles were removed. The
  control/resource traces, fixture signing key, and CA state were removed.
- The conformance Compose project has zero containers and zero named volumes;
  port 443 is no longer held by the fixture.
- The cleanup verifier reports `STATE_PRESENT=False`, `HOSTS_INSTALLED=False`,
  and `TRUST_INSTALLED=False` for the marked hosts block and fingerprinted CA.
- The isolated Codex and WorkBuddy temporary configuration directories were
  removed and `.tmp` is empty.
- `D:\Codex\wp-auto-connector` remains clean.

## Evidence and decisions

- Machine-checkable content-free cases: [PHASE_2_0_1_EVIDENCE.json](PHASE_2_0_1_EVIDENCE.json)
- Compatibility matrix: [PHASE_2_0_1_COMPATIBILITY_MATRIX.md](PHASE_2_0_1_COMPATIBILITY_MATRIX.md)
- Version matrix: [PHASE_2_0_1_VERSION_MATRIX.md](PHASE_2_0_1_VERSION_MATRIX.md)
- Provider decision: [ADR-003-OAUTH-ENGINE-SELECTION.md](ADR-003-OAUTH-ENGINE-SELECTION.md)
- Token profile: [ADR-004-TOKEN-AND-SIGNING-PROFILE.md](ADR-004-TOKEN-AND-SIGNING-PROFILE.md)

## Exit state

The local provider, HTTPS fixture, PHP hard gates, Codex pre-registered path,
Auth0 rejection, DCR probe cleanup, fixture restoration, and WorkBuddy
unsupported conclusion are accepted. Phase 2.0.1 is **closed**. Its first local
Git commit may now be created on `main`; no push or deployment is authorized,
and Phase 2.0.2 does not start as part of this closure.
