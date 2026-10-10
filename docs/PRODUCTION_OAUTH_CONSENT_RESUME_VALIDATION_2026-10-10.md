# Production OAuth Consent Resume Validation — 2026-10-10

## Status

The production WordPress end-to-end release gate passed on 2026-10-10. This
record covers the bounded investigation, correction, deployment, and
validation of the OAuth consent resume path. It does not approve connector
changes, general release expansion, or Phase 2.0.7B2.

## Observed production failure

- Auth0 authentication completed and the WePuu consent page rendered.
- A single approval submission consumed the oidc-provider Interaction and
  updated the Session, but no AuthorizationCode was persisted.
- The local PKCE callback listener received no request and timed out.
- Authorization-service and Nginx logs contained no corresponding exception.
- No WordPress content, MCP tool input, MCP tool output, bearer token, cookie,
  authorization code, or redirect URI was added to logs or evidence.

## Upstream contract review

The implementation was compared with the official `panva/node-oidc-provider`
documentation and the example for the repository-pinned `9.12.2` release:

- `docs/README.md` documents that `interactionFinished` stores the interaction
  result and redirects the user agent to the authorization resume URI.
- `example/routes/express.js` updates an existing Grant in place and returns
  `consent: {}` when `interactionDetails.grantId` was already present. It only
  returns `consent.grantId` for a newly created Grant.
- `lib/shared/authorization_error_handler.js` emits exposed protocol failures
  through `authorization.error` and non-exposed internal failures through
  `server_error`.

Upstream references:

- <https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/docs/README.md>
- <https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/example/routes/express.js>
- <https://raw.githubusercontent.com/panva/node-oidc-provider/v9.12.2/lib/shared/authorization_error_handler.js>

## Bounded correction

- Match the official example's consent result for new versus existing Grants.
- Preserve the existing exact platform Grant binding and fail closed if the
  saved Grant identifier differs.
- Record both `authorization.error` and `server_error` through content-free,
  bounded diagnostics. Diagnostics include only event type, error class, safe
  machine code, OAuth error code, and an allowlisted session-failure reason.
- Do not log error messages, descriptions, request parameters, tenant or user
  identifiers, redirect URIs, tokens, cookies, or WordPress data.

## Callback redirect root cause

The bounded stage diagnostics subsequently proved that the provider completed
`interaction.ended`, `authorization.accepted`, and `authorization.success`,
and persisted an AuthorizationCode. The user agent nevertheless remained on
the consent page and never reached the loopback callback. The consent page's
`form-action 'self'` CSP allowed the same-origin POST but blocked the resulting
redirect to the registered native-client loopback origin.

The correction keeps the base CSP closed and adds only the exact origin of the
redirect URI already validated by oidc-provider. It accepts HTTPS origins and
RFC 8252-style `http://127.0.0.1:<explicit-port>` origins. It rejects non-TLS
remote origins, portless loopback URIs, credentials, fragments, invalid URLs,
and all wildcard sources. Paths, queries, state, codes, and other request data
are never copied into the CSP or logs.

## Pre-deployment validation

- Authorization-service focused tests: 15 passed, 0 failed.
- TypeScript project typecheck: passed.
- ESLint: passed.
- Data-flow review: unchanged. MCP requests and WordPress content remain direct
  between the client and connector; the control plane handles authorization
  metadata only.
- Connector repository changes: none.

## Production gate result

After CI and the bounded authorization-service deployment, the production
Authorization Code with PKCE test passed all required assertions:

- `OAUTH_AUTHORIZATION_CODE_PKCE=True`;
- `OAUTH_ACCESS_TOKEN_RS256=True`;
- `OAUTH_ACCESS_TOKEN_BINDINGS=True`;
- `OAUTH_REFRESH_ROTATION=True`;
- `OAUTH_REFRESH_REVOCATION=True`;
- `OAUTH_DIRECT_WORDPRESS_MCP=True`.

The verifier applies the same 60-second bounded clock tolerance configured by
the authorization server while continuing to require and validate `iat`,
`nbf`, and `exp`. This accommodated the measured local Windows/VPS clock skew
without weakening time validation.

The independent Application Password regression ran in a disposable local
`wp-env` environment using isolated Node.js 24 tooling:

- MCP protocol negotiation, the frozen 23-tool order, authentication, and site
  health passed;
- connector PHPUnit passed 530 tests and 3,621 assertions;
- the disposable Application Password and WordPress environment were removed;
- connector commit `92971ceacebf557eaedbf11bccb06c8b4e6ba5c2`
  and its clean working tree were preserved.

The deployed authorization container remained healthy on the immutable image
digest recorded by the deployment operation. Control and PostgreSQL container
start times did not change. No connector repository or production WordPress
plugin files were changed, and no WordPress content traversed the control
plane.

Post-validation read-only checks found zero private-key, Bearer, token-secret,
client-secret, or passphrase patterns in the authorization and control service
logs for the validation window. No unexpired rows remained in
`oauth.secret_artifacts` after refresh-token revocation.
