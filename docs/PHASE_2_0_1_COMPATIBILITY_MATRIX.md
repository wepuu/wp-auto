# Phase 2.0.1 Compatibility Matrix

Legend: `pass` is a reproducible protocol assertion; `blocked` is an external
input or UI path that was not available; `fail` is a hard contract deviation.

| Capability | Codex CLI 0.154.0 | WorkBuddy AI 5.5.2 / codebuddy 2.137.1 | node-oidc-provider 9.12.2 | Auth0 disposable tenant |
|---|---|---|---|---|
| Streamable HTTP MCP | pass: isolated configuration | unsupported: valid project HTTP entry not loaded by GUI runtime | pass: HTTPS direct resource | blocked: resource server is outside Auth0 |
| PRM discovery | pass: observed against HTTPS fixture | unsupported: no resource request | pass | blocked: resource server is outside Auth0 |
| AS metadata | pass: observed against HTTPS fixture | unsupported: no AS request | pass | pass |
| Authorization Code | pass: pre-registered interactive code exchange, `/token` 200 | unsupported: no authorization request | pass | blocked: interactive user login not supplied |
| PKCE S256 | pass: S256-only fixture completed code exchange | unsupported: no authorization request | pass | fail: `plain` is advertised and accepted into login |
| Exact `resource` in both requests | pass: pre-registered request completed against exact resource | unsupported: no request | pass | pass: exact resource reaches login; mismatch rejected |
| Exact full-URL `aud` | pass: client token issued; provider/JWKS verifier enforces exact string | unsupported: no client token | pass | blocked: no issued tenant token |
| Issuer-bound response | pass through metadata/DCR stage | unsupported: no response | pass | pass: RFC 9207 metadata and error response |
| Pre-registered client | pass: isolated add/list/get | unsupported: project entry not loaded | pass | pass: native app configured |
| CIMD | pass: isolated mode configured | unsupported | pass: policy checks | blocked: no hosted HTTPS document |
| DCR | pass: observed 201 registration; browser handoff blocked | unsupported | pass | pass: endpoint returned 201 with public auth method |
| Loopback callback | pass: dynamic port, fixed `127.0.0.1/callback`, token exchange 200 | unsupported: no authorization request | pass | pass: registered callback; mutation rejected |
| Refresh rotation | blocked: no client refresh invocation after initial exchange | unsupported | pass including PostgreSQL restart | blocked: no issued tenant token |
| Revocation | blocked: no client revocation invocation after initial exchange | unsupported | pass | blocked: no issued tenant token |
| JWKS overlap/cache | blocked: no issued client token | unsupported | pass: bounded cache and emergency deny | blocked: no rotation credential/token |
| Scope advertisement/insufficient scope | blocked: no client tool invocation after token | unsupported | pass: 403 challenge | blocked: no issued tenant token |
| Restart/reconnect | blocked: no client reconnect invocation after token | unsupported | pass: PostgreSQL refresh state | blocked: no issued tenant token |
| Direct client to WordPress path | blocked: no Codex tool invocation after token | unsupported: no GUI request | pass: direct-wordpress simulation, content-free trace | blocked: no client token |
| WordPress/PHP JOSE | n/a | n/a | pass: real provider tokens before/after rotation | blocked: no issued tenant token |

## Decision rules

- Claims based only on documentation remain `blocked` until a protocol trace is
  available.
- A client is supported only for the tested version and registration mode.
- Any hard deviation in resource, audience, PKCE, redirect, issuer, refresh
  reuse, revocation, or key handling rejects that provider/profile.
- Auth0 is rejected for this profile because the tenant accepts `plain` PKCE;
  no compatibility shim weakens the S256 requirement.
