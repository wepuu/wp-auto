# P3-A7 G2 RFC 7009 Token Revocation production acceptance

Date: 2026-10-12

## Scope

This acceptance used the fixed-purpose `wepuu-e2e-lifecycle` public client,
the single active `test.wpauto.cc` Site and one newly consented, independent
Grant. It executed exactly one RFC 7009 Refresh Token revocation scenario. It
did not perform Refresh Token rotation or Replay, use or modify the active
`wepuu-e2e-codex` Grant, deploy a service, run migration 014, modify a
historical Outbox record, re-pair the Site or operate another WordPress site.

The G1 Replay acceptance and its sequence-1 deny marker remained unchanged.

## Preconditions and backup

Immediately before the run:

- Control, Authorization, PostgreSQL and the test WordPress container were
  healthy with zero restarts.
- Authorization still ran the fixed hotfix image with digest
  `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- The database contained migrations 001 through 013 only.
- The platform had exactly one active Site, matching the active Connector
  connection and revocation state.
- Connector revocation state was v2 at sequence 1, with exactly the G1 hashed
  Grant deny marker and no token or key marker.
- G1 was `revoked` with reason `refresh_replay`, and its sequence-1 Outbox
  event was delivered on its first attempt.
- `wepuu-e2e-lifecycle` had no live Grant.
- The active `wepuu-e2e-codex` Grant retained its pre-G1 identifier, active
  status, unchanged `updated_at` and no revocation reason.
- The five historical Outbox rows for the two revoked Sites retained their
  prior states.

A custom-format PostgreSQL backup was created under
`/opt/wpauto/backups/pre-g2/20261012T141512Z`. The dump and checksum were
root-owned with mode 0600. SHA-256 verification and `pg_restore -l` using the
PostgreSQL container both passed. The dump SHA-256 was
`72caaebef63eafda5f60435d56e92197eb25377eaa324cf031b36cc6bfeddc2a`.

## Executed result

The operator completed WordPress local consent and WePuu consent once. The
repository `--mode revocation` probe then passed all of the following:

- Authorization Code with PKCE S256 completed.
- The issued Access Token and Refresh Token were bound to the expected client,
  tenant, Site, resource, Grant and scope.
- AT0 successfully completed the direct WordPress MCP probe before revocation.
- R0 was submitted once to the RFC 7009 revocation endpoint and received a
  successful response.
- subsequent use of R0 returned HTTP 400 with `invalid_grant`.
- before AT0 natural expiry, the Connector returned HTTP 401 with the Bearer
  `invalid_token` contract.
- no Refresh Token rotation or Replay request was made.

The desensitized G2 identifier is `grant_UmUv…oprT`.

Post-run read-only verification confirmed:

- G2 was `revoked` with reason `token_revoked`;
- exactly one G2 Outbox event existed at new-Site sequence 2, was delivered on
  its first attempt and had no error code;
- Connector revocation state advanced to sequence 2 and held exactly two
  hashed Grant deny markers, verified to correspond to G1 and G2 without
  outputting either hash;
- G1 remained `revoked / refresh_replay` with its delivered sequence-1 event;
- the active `wepuu-e2e-codex` Grant retained the same identifier, active
  status, unchanged `updated_at` and no revocation reason;
- the five historical Outbox rows retained their prior states;
- all four bounded services remained healthy and migrations remained 001
  through 013.

No authorization code, access token, refresh token, Cookie, session, PKCE
verifier, deny-marker hash, WordPress response content, email address or
secret is recorded in this document.

## P3-A aggregate conclusion

The repository evidence now covers the complete P3-A core sequence:

- Email OTP account login, account mapping and OAuth interaction recovery;
- formal WordPress and WePuu Consent;
- Authorization Code with PKCE S256, RS256/JWKS and exact token bindings;
- direct WordPress MCP initialize, the frozen 23-tool catalog and the
  read-only `wp-auto-site-health` call;
- normal Refresh Token rotation with the rotated Access Token still accepted;
- isolated G1 Refresh Replay detection, lineage invalidation, delivered
  sequence-1 event and pre-expiry Connector denial;
- isolated G2 RFC 7009 revocation, `token_revoked`, delivered sequence-2 event
  and pre-expiry Connector denial;
- unchanged positive Codex Grant throughout both destructive lifecycle tests.

P3-B, real Codex Desktop compatibility, a second Site combination-isolation
run and the independent Application Password regression remain outside P3-A.
Therefore this record closes only the P3-A core gate and does not establish
full acceptance or readiness for controlled/public use.

```text
G2_AUTHORIZATION_CODE_PKCE_PASS=True
G2_PRE_REVOCATION_MCP_PASS=True
G2_RFC7009_REQUEST_PASS=True
G2_R0_INVALID_GRANT=True
G2_GRANT_TOKEN_REVOKED=True
G2_OUTBOX_DELIVERED=True
G2_CONNECTOR_DENIAL_BEFORE_EXP=True
G2_CODEX_GRANT_UNCHANGED=True
P3A_POSITIVE_OAUTH_MCP_PASS=True
P3A_POSITIVE_REFRESH_ROTATION_PASS=True
P3A_G1_REFRESH_REPLAY_PASS=True
P3A_G2_REVOCATION_PASS=True
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
