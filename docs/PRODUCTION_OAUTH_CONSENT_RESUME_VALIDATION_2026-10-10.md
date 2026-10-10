# Production OAuth Consent Resume Validation — 2026-10-10

## Status

The production WordPress end-to-end release gate remains open. This record
covers the bounded investigation and pre-deployment validation of the OAuth
consent resume path only. It does not approve connector changes, general
release, or Phase 2.0.7B2.

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

## Pre-deployment validation

- Authorization-service focused tests: 12 passed, 0 failed.
- TypeScript project typecheck: passed.
- ESLint: passed.
- Data-flow review: unchanged. MCP requests and WordPress content remain direct
  between the client and connector; the control plane handles authorization
  metadata only.
- Connector repository changes: none.

## Remaining gate

After CI and bounded authorization-service deployment, repeat the production
Authorization Code with PKCE test and require all of the following before this
record can be marked complete:

- authorization callback received with exact state;
- authorization code exchanged once with PKCE S256;
- RS256 access-token signature and issuer, audience, site, grant, tenant and
  scope bindings validated;
- refresh-token rotation and revocation validated;
- direct WordPress MCP request succeeds without content traversing WePuu;
- Application Password direct access remains unaffected.

