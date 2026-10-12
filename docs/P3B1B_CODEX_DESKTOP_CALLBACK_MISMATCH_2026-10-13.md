# P3-B1B Codex Desktop callback mismatch

Date: 2026-10-13

## Scope and result

One explicitly authorized OAuth attempt was started from the isolated
P3-B1 temporary project in Windows Codex Desktop Beta `26.727.4816.0`. The
attempt stopped at authorization request validation and did not reach Email
OTP, Consent, code issuance, token exchange, MCP initialization or a tool call.

The browser returned `invalid_redirect_uri`. The one-time authorization state,
dynamic port, callback identifier and complete authorization URL are not
recorded here.

```text
CODEX_DESKTOP_OAUTH_PASS=False
CODEX_DESKTOP_TOOL_COUNT=not_run
CODEX_DESKTOP_SITE_HEALTH_PASS=False
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=False
```

## Confirmed request shape

Read-only inspection of the failed browser request established that Desktop
sent:

- the expected `wepuu-e2e-codex` client;
- the exact `test.wpauto.cc` MCP resource;
- the exact `mcp:read` scope;
- an HTTP `127.0.0.1` loopback redirect with an explicit dynamic port;
- no redirect query or fragment; and
- a callback-specific path shaped as `/callback/<server-specific-id>`.

The production client registers only `http://127.0.0.1/callback`. WPAuto's
native-loopback matcher permits a dynamic port only when host, path, query and
other URI components match a registered redirect. It therefore rejected the
changed path as designed. Signature, issuer, PKCE, Consent and Grant logic were
not implicated.

The public authorization metadata still advertised the correct issuer and
`authorization_response_iss_parameter_supported=true`. Current official Codex
documentation states that existing MCP client state without a saved stable
callback can continue to use a server-specific callback ID even when issuer
binding is available. The real Desktop behavior takes precedence over the
earlier static assumption.

## Production post-check

The read-only database check after failure confirmed:

- `wepuu-e2e-codex` remained active;
- exactly one live Grant remained for that client;
- the existing masked Grant remained active with its baseline `updated_at`
  and an empty revocation reason;
- no Provider artifact had been created in the observation window; and
- no secret OAuth artifact had been created in the observation window.

No deployment, database write, Grant creation or revocation, Connector change,
pairing operation, migration 014, G1/G2 action, Token, Cookie or credential
inspection occurred.

## Minimal correction boundary

Do not accept arbitrary `/callback/*` paths and do not weaken native-loopback
matching. The minimal interoperable option is to add the exact observed
callback-specific path as a second pre-registered redirect for
`wepuu-e2e-codex`; the existing matcher can then continue to vary only the
loopback port while requiring an exact registered path.

That correction needs a reviewed, idempotent client-metadata operation, a
database backup, a read-only post-check and an Authorization Service restart if
its client metadata cache requires it. It must preserve the existing stable
callback and active Grant. No such operation is authorized or performed by
this record. A second real Desktop attempt requires separate approval after the
exact metadata change and rollback plan are reviewed.

## Current status

```text
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
