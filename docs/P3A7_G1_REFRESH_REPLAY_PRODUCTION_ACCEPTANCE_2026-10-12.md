# P3-A7 G1 Refresh Replay production acceptance

Date: 2026-10-12

## Scope

This acceptance used the fixed-purpose `wepuu-e2e-lifecycle` public client,
the single active `test.wpauto.cc` Site and one newly consented Grant. It
executed exactly one refresh-token Replay scenario. It did not use or modify
the active `wepuu-e2e-codex` Grant, call the RFC 7009 revocation endpoint,
execute G2, deploy a service, run migration 014, modify a historical Outbox
record, or operate another WordPress site.

The earlier failed G1 attempt recorded on 2026-10-11 remains historical
evidence and was neither altered nor reused.

## Preconditions and backup

Immediately before the run:

- Control, Authorization, PostgreSQL and the test WordPress container were
  healthy with zero restarts.
- The database contained migrations 001 through 013 only.
- The platform had exactly one active Site and its identifier matched the
  active Connector connection and revocation state.
- Connector revocation state was v2 with sequence 0 and no deny markers.
- `wepuu-e2e-lifecycle` was active and had no live Grant.
- The new Site had no Outbox event.
- The active `wepuu-e2e-codex` Grant had no revocation reason; its identifier,
  active status and `updated_at` value were recorded for post-run comparison.

A custom-format PostgreSQL backup was created under
`/opt/wpauto/backups/pre-g1/20261012T124107Z`. The directory was root-owned,
the dump and checksum were mode 0600, SHA-256 verification passed, and
`pg_restore -l` accepted the archive.

## Executed result

The operator completed WordPress local consent and WePuu consent once. The
repository `--mode replay` probe then passed all of the following assertions:

- Authorization Code with PKCE S256 completed.
- R0 rotated normally to R1.
- AT1 successfully completed the direct WordPress MCP probe.
- replaying R0 returned HTTP 400 with `invalid_grant`.
- using R1 after the replay returned HTTP 400 with `invalid_grant`.
- before AT1 natural expiry, the Connector returned HTTP 401 with the Bearer
  `invalid_token` contract.

Post-run read-only verification confirmed:

- the isolated G1 Grant was `revoked` with reason `refresh_replay`;
- exactly one G1 Outbox event existed at new-Site sequence 1, was delivered on
  its first attempt and had no error code;
- Connector revocation state advanced to sequence 1 and held exactly one
  hashed Grant deny marker, verified to correspond to G1 without outputting
  the hash;
- the active `wepuu-e2e-codex` Grant retained the same identifier, active
  status, unchanged `updated_at` and no revocation reason;
- the five historical Outbox records remained assigned to the two revoked
  Sites with their prior delivery states;
- all four bounded services remained healthy.

`OAUTH_REFRESH_FAMILY_REVOKED=True` is only the probe's assertion that the
Refresh Token lineage became unusable. It is not evidence that the separate
`oauth.refresh_families` table changed, and no such claim is made here.

No authorization code, access token, refresh token, Cookie, session, PKCE
verifier, deny-marker hash, WordPress response content, email address or
secret is recorded in this document.

```text
G1_REFRESH_ROTATION_PASS=True
G1_R0_REPLAY_INVALID_GRANT=True
G1_R1_INVALID_GRANT=True
G1_GRANT_REFRESH_REPLAY_REVOKED=True
G1_OUTBOX_DELIVERED=True
G1_CONNECTOR_DENIAL_BEFORE_EXP=True
G1_CODEX_GRANT_UNCHANGED=True
P3A_G1_REFRESH_REPLAY_PASS=True
P3A_G2_REVOCATION_PASS=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
