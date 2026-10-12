# P3-A7 new-site positive OAuth and MCP acceptance

Date: 2026-10-12

## Scope

This production acceptance used the newly paired `test.wpauto.cc` site and the
pre-registered `wepuu-e2e-codex` public client. It exercised only the positive
Authorization Code, PKCE, access-token, MCP and one normal refresh rotation
path. It did not replay a refresh token, call the revocation endpoint, revoke a
Grant, modify an Outbox event, deploy a service, or run migration 014.

The validation script was extended with `--mode positive-rotation`. That mode
probes MCP with the initial access token, rotates R0 to R1, probes MCP again
with the refreshed access token, and exits while preserving the Grant. Tests
continue to pin the existing `normal`, `replay` and `revocation` plans.

## Preconditions

- Control, Authorization, PostgreSQL and the test WordPress container were
  healthy with zero restarts.
- The database contained migrations 001 through 013 only.
- Exactly one platform Site was active and its identifier matched the active
  Connector connection and revocation state.
- Connector revocation state was v2 with sequence 0 and no deny markers.
- Both test OAuth clients were active; neither had a live Grant.
- The new Site had no revocation Outbox event.
- A protected database backup was created at
  `/opt/wpauto/backups/pre-positive-oauth/20261012T115029Z`; its checksum and
  custom-format archive listing were verified before authorization began.

## Executed result

The following checks passed in one authorization transaction:

- WordPress local consent and WePuu consent;
- Authorization Code with PKCE S256;
- RS256 access-token verification through published JWKS;
- exact issuer, audience, client, tenant, Site, Grant and `mcp:read` bindings;
- MCP initialize with the expected protocol version;
- the exact 23-tool catalog;
- `wp-auto-site-health`;
- normal R0 to R1 refresh rotation;
- a second MCP initialize, catalog and site-health probe using AT1.

Post-run read-only verification confirmed one active `wepuu-e2e-codex` Grant
for the new Site with no revocation reason. The lifecycle client still had no
live Grant. The new Site still had zero Outbox events; the five historical
events for revoked Sites, including three undelivered events, were unchanged.
The Connector remained active with sequence 0 and no deny markers.

No authorization code, access token, refresh token, session, Cookie, PKCE
verifier, email address, WordPress response content, or secret is recorded in
this document.

```text
P3A_NEW_SITE_PAIRING_PASS=True
P3A_POSITIVE_OAUTH_MCP_PASS=True
P3A_POSITIVE_REFRESH_ROTATION_PASS=True
P3A_CODEX_GRANT_ACTIVE=True
P3A_G1_REFRESH_REPLAY_PASS=False
P3A_G2_REVOCATION_PASS=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
