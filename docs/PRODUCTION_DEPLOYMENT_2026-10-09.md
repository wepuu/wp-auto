# Production deployment validation: 2026-10-09

Status: provisional deployment operational; interactive identity gate passed;
WordPress end-to-end gate remains open

## Scope and authorization

The operator explicitly authorized the initial `wpauto.cc` production
deployment, CI-approved merges and VPS changes on 2026-10-09. The deployment
uses the existing BaoTa Nginx and Docker host without changing the connector,
installing Caddy, deploying Vault/HSM, or starting Phase 2.0.7B2.

## Source and build evidence

- ADR-016 implementation: merge commit `7007caf`; post-merge Phase 2 Platform
  run `37870163066` passed.
- Isolated VPS deployment: PR #7, merge commit `26e1c62456e4bc5d7274613f4f498092e677e9f9`;
  PR and post-merge CI passed (`37874358513`, `37874546201`).
- Immutable production images: workflow run `37874716892` passed. Control image
  digest is `sha256:d386d694f917a1df1798e4c6331dafcbeb61db65b63646ce56a450fd3f676486`;
  authorization image digest is
  `sha256:7d72342ab9472d5fc381eb016d322c5eee9d9cc3e4111650af6548ee3f28c616`.
- ACME renewal correction: PR #8, merge commit
  `7fc794b8721c6d0e1cf43d27258dd2975f8e440b`; PR and post-merge CI passed
  (`37876500352`, `37876805831`).

## Host isolation and runtime

- Compose project: `wpauto`; private subnet: `172.30.50.0/24`.
- PostgreSQL is internal-only. Control and authorization bind only to
  `127.0.0.1:3000` and `127.0.0.1:3001`.
- All three containers became healthy. Both loopback readiness endpoints
  returned `{"status":"ready"}`.
- The dedicated `auth.wpauto.cc` vhost passed `nginx -t` before reload. It uses
  a Let's Encrypt certificate valid from 2026-10-09 through 2027-01-07 and a
  BaoTa-registered renewal order.
- Existing site status-code regression matched the pre-change baseline:
  `greatppt.com` 301, `tikdd.cc` 301, `api.tikdd.cc` 404 and
  `admin.tikdd.cc` 307. `longyanbowuguan.com` timed out both before and after
  this deployment and is not represented as healthy.

## Signing migration

- A new encrypted RSA-3072 PKCS#8 key was generated on the VPS. No KMS or
  old-computer private material was imported.
- Public RFC 7638 `kid`:
  `FeWRIY_KI8gWkHp2JSuDiFxOdadU-4hH6utGej5g0LI`.
- The public key was published at `2026-10-09T02:36:43Z`. Activation occurred
  only after the real 20-minute window, at or after `2026-10-09T02:56:46Z`.
- Loopback JWKS validation found exactly one RSA/RS256 signing key and no
  `d`, `p`, `q`, `dp`, `dq` or `qi`. The public and loopback JWKS response
  hashes matched.

## Public and identity validation

- Through Cloudflare, TLS verification succeeded and readiness, JWKS and OIDC
  discovery returned 200. `/internal/metrics` returned 404.
- Terms, privacy, support and status URLs returned 200.
- Auth0 discovery returned 200 from the VPS with successful TLS validation.
- The account-login start response used the configured Auth0 tenant, exact
  callback, Authorization Code, PKCE S256 and a Secure/HttpOnly transaction
  cookie. State, nonce, challenge and cookie values were not recorded.
- A cookie-preserving probe reached Auth0 Universal Login without an obvious
  client or callback rejection. It did not authenticate and does not replace
  the then-open interactive login/callback gate.
- The Auth0 dashboard was confirmed to use client ID
  `AY4V93U0IUs6aWPKgLqClwodKWOneQa9`, the exact production callback and
  `client_secret_basic`. Initial real browser attempts produced a successful
  Auth0 login followed by `Failed Exchange: Unauthorized`; no platform account
  or session was created.
- The failure was isolated to a stale Auth0 Client Secret in the VPS runtime.
  The current Secret was supplied through a local protected prompt, verified
  against the Auth0 token endpoint before installation, written only to the
  root-owned mode-0600 runtime environment file, and loaded by recreating only
  the control service. Neither the Secret nor an authorization code was
  recorded in repository files or validation output.
- An independent post-change probe returned `invalid_grant` for an intentionally
  invalid authorization code rather than a client-authentication rejection,
  proving that Auth0 accepted the configured confidential-client credentials.
  The control container remained healthy, the runtime file and container value
  matched, and public readiness returned 200.
- A fresh Chrome login completed the callback and rendered the tenant workspace.
  PostgreSQL then contained exactly one pseudonymous account, one active
  account session, one tenant, one membership and one home-tenant record. No
  identity subject, Cookie, token or authorization code was inspected or
  retained. The production interactive identity gate is passed.
- Data-flow review: this validation exercised only identity and content-free
  control metadata. No WordPress content, MCP tool input or MCP tool output
  entered the control plane.

## Backup and leakage evidence

- A root-owned mode-0600 PostgreSQL custom-format backup was created at
  `/opt/wpauto/backups/wpauto-initial-20261009.dump` with SHA-256
  `5b5eb77ac0a4684cc1958ad828ae06c67fa1a61fc652ee7280f9b1da9c5f39c5`.
  It restored successfully into an isolated disposable database, which was
  deleted after verification.
- Current Secret values were not found in new application/PostgreSQL logs,
  image history or a database text export.
- The signing private-key marker and passphrase were absent from container
  environments. No private RSA JWK member was stored in PostgreSQL.

## Startup incident and containment

The first application start failed closed because three generated JSON key
arrays had lost dotenv quoting. The authorization error log printed the two
then-current transaction keys. Both application containers were stopped before
public routing was enabled. All three JSON key sets were regenerated, the
failed containers and their Docker logs were deleted, and fresh containers
were created. No login, session, authorization code or OAuth token had been
issued. A post-rotation scan found none of the current Secret values in logs,
image history or PostgreSQL. The exposed values are not recorded here and are
no longer valid.

## Open gates

- Confirm Cloudflare SSL/TLS mode is Full (strict).
- Create two encrypted offline signing-key backups in separate locations and
  store the passphrase separately. Do not copy old-computer credentials.
- Complete a real WordPress pairing, consent, access/refresh, revocation, JWKS
  refresh and direct MCP call while preserving Application Password fallback.
- Confirm the final data-residency/retention wording and obtain any legal review
  the operator considers necessary before inviting general users.

Until these gates close, the endpoint is an operator validation deployment,
not a completed Phase 2.0.7B2 or connector-release acceptance.
