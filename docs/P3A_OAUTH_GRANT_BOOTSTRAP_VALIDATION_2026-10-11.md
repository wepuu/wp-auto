# P3-A OAuth Grant Bootstrap Validation — 2026-10-11

## Status

The local candidate fixes the first-authorization blocker found during P3-A
production validation. It is not deployed and does not mark P3-A complete.

Production had a newly paired Email OTP account and WordPress site but no exact
active platform Grant. The authorization service therefore returned
`access_denied` before the existing WordPress-local consent flow could create
that Grant. No database row was fabricated and no connector change was made.

## Bounded correction

- When an authenticated OAuth interaction has no exact active Grant, the
  authorization service creates a five-minute RS256 internal handoff using the
  existing protected local signing key and `panva/jose`.
- The handoff binds the Better Auth account, interaction UID, OAuth client,
  canonical RFC 8707 resource, ordered MCP scopes, issuer, audience, `kid`,
  time window and a random `jti`.
- The browser carries only the compact JWT in the URL fragment. Control API
  accepts only an exact-origin JSON request, verifies the JWT with the fixed
  active public key, re-resolves the authenticated account and memberships,
  and requires exactly one active paired site for the signed resource.
- Existing `GrantService` and PostgreSQL idempotency create the pending Grant;
  the existing signed WordPress-local consent request and proof remain the
  authority for approval.
- Approval resumes the original `/interaction/{uid}`. A locally signed denial
  is posted back to that exact interaction and completes it with OAuth
  `access_denied`, avoiding an authorization loop.

No new dependency, secret, database migration, OAuth issuer, token claim,
signing key, Connector behavior or MCP data-plane route is introduced.

## Security and data-flow review

- A bounded Codex Security diff review covered all initially changed files and
  reported zero remotely exploitable findings. It identified unsigned browser
  state as defense-in-depth debt; the final candidate removes that state by
  requiring the short-lived RS256 handoff described above.
- Embedded `jwk`, `jku`, `x5u`, `crit`, alternate algorithms and extra protected
  header parameters are not accepted. Verification uses the configured fixed
  public key, exact `kid`, `alg=RS256` and dedicated
  `typ=wepuu-oauth-consent-bootstrap+jwt`.
- Account, active membership, tenant RLS, unique active site, resource and scope
  checks remain fail closed.
- WordPress content, MCP inputs and MCP outputs remain direct between the MCP
  client and Connector. The new flow handles only authorization metadata.
- No private key, passphrase, OTP, Cookie, authorization code, access token,
  refresh token or WordPress credential is added to source, URLs, responses,
  audits or logs.

## Local validation

`pnpm check` passed on 2026-10-11:

- TypeScript project references: passed;
- ESLint: passed;
- tests: 95 total, 81 passed, 14 skipped, 0 failed;
- dedicated JOSE tests cover signature tampering, expiry and account binding;
- focused authorization tests cover opaque fragment transport and exact
  interaction/client/resource/scope matching;
- focused Fastify tests cover exact Origin, invalid handoff rejection,
  authenticated unique-site selection and exact Grant input;
- existing OAuth, PKCE, JWKS, refresh, revocation, tenant-boundary and
  content-free control-plane regressions remained green where configured.

The 14 skipped tests require optional PostgreSQL, Better Auth HTTP or PHP
integration environments and are not represented as passes by this record.
There is no schema change, so no migration was run.

## Remaining production gate

Before setting `P3_CORE_OAUTH_MCP_PASS=True`, the fixed image still requires a
separately authorized production deployment followed by the planned manual
browser run:

1. start OAuth from the isolated PKCE test client;
2. complete WordPress-local consent and return to the same interaction;
3. approve platform consent and exchange the code with PKCE S256;
4. verify RS256 claims/JWKS, direct MCP initialize, the 23-tool catalog and
   `wp-auto-site-health`;
5. obtain separate approval before Refresh Replay or revocation tests.

Until those steps pass:

```text
P3_CORE_OAUTH_MCP_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
