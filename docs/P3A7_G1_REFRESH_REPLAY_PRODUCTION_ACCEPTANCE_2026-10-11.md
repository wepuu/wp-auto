# P3-A7 G1 Refresh Replay production acceptance — 2026-10-11

## Scope

The operator authorized one production Refresh Replay acceptance attempt using
only the pre-registered `wepuu-e2e-lifecycle` client and the active
`test.wpauto.cc` test site. The existing `wepuu-e2e-codex` Grant was excluded.
G2 explicit revocation, P4-A, migration 014, service restarts, Connector
changes and manual database writes were outside scope.

This attempt did not pass. It stopped after the first replay response exposed
a validation-script defect. No automatic reauthorization or repeated replay
was attempted.

## Preconditions and backup

Immediately before the attempt, read-only production checks confirmed:

- `wepuu-e2e-lifecycle` had no pending, active or suspended Grant for the
  active test site;
- the existing `wepuu-e2e-codex` Grant was active and its ID, status and
  `updated_at` formed the protected baseline;
- the active site had no pending revocation outbox event;
- the account, Better Auth mapping and owner membership were active; and
- Control, Authorization and PostgreSQL were healthy with migrations 001
  through 013 only.

A fresh logical backup was created before authorization:

- path:
  `/opt/wpauto/backups/p3a7-g1/wpauto-p3a7-g1-20261011T133758Z.dump`;
- size: 130,340 bytes;
- SHA-256:
  `6108ca7bba42d6ceb9ffa4d45e95fbd7a6220f6505e3474d219042586f374ce0`.

The final copied file passed its SHA-256 check and `pg_restore -l` catalog
inspection inside the PostgreSQL container. The host does not provide a
`pg_restore` binary; this did not affect the container-based validation.

## Executed flow

The reviewed `scripts/test-production-wordpress-oauth.mjs --mode replay`
command resolved the active tenant and site through read-only queries. The
operator completed the normal WordPress Consent and WePuu Consent flows. A new
G1 Grant was created through the product flow; no Grant row was inserted or
altered manually.

Control flow and production state confirm that the authorization code exchange,
PKCE S256, access-token verification, R0-to-R1 refresh rotation and the MCP
probe using AT1 completed before the replay branch was entered.

## Failure and observed state

The script sent the R0 replay request and parsed its JSON response, then failed
before checking the response status and OAuth error. On Node.js 26.11.1,
`expectInvalidGrant()` called `response.body.cancel()` after `response.json()`
had locked the stream and raised:

```text
TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is locked
```

The failure occurred at the first `expectInvalidGrant()` invocation. As a
result:

- the R0 response cannot be recorded as a verified `400 invalid_grant`;
- R1 was not submitted for the required second `invalid_grant` check;
- the 60-second Connector denial poll was not started; and
- no Token, Cookie, OTP, authorization code or WordPress response content was
  retained in this record.

Read-only production inspection after the failure found:

- G1 was `revoked`, but its reason was `token_revoked`, not
  `refresh_replay`;
- the G1 outbox event also used `token_revoked`;
- the outbox event was not delivered and had `delivery_failed` after six
  observed attempts;
- no RefreshToken artifact remained for G1;
- `oauth.refresh_families` contained no row for G1; and
- the protected `wepuu-e2e-codex` Grant ID, `active` status and `updated_at`
  were unchanged from the pre-test baseline.

The `token_revoked` result is consistent with node-oidc-provider invoking the
adapter's `revokeByGrantId()` path for an already consumed refresh token. The
current adapter assigns `token_revoked` in that path. This differs from the
repository's expected `refresh_replay` reason and requires a focused code-path
investigation before another production attempt.

The script did not emit `OAUTH_REFRESH_FAMILY_REVOKED=True`. More generally,
that label describes the expected invalidation semantics for the refresh-token
lineage; it must not be treated as evidence that `oauth.refresh_families` was
updated. That table is not used by the current node-oidc-provider runtime path.

## Acceptance result

```text
G1_REFRESH_ROTATION_OBSERVED=True
G1_R0_REPLAY_INVALID_GRANT_VERIFIED=False
G1_R1_INVALID_GRANT_VERIFIED=False
G1_REVOCATION_REASON_REFRESH_REPLAY=False
G1_OUTBOX_DELIVERED=False
G1_CONNECTOR_DENIAL_BEFORE_EXP_VERIFIED=False
G1_REFRESH_REPLAY_ACCEPTANCE_PASS=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```

G1 is now revoked and must remain as production evidence. It must not be
restored, edited or reused. Migration 004 permits a later fresh Grant for the
same lifecycle client only after the script and runtime reason behavior are
fixed and a new production attempt is separately authorized.

## Required next work

Before any further production lifecycle test:

1. remove the invalid post-JSON `ReadableStream.cancel()` call and add a Node
   26 regression test covering the real fetch response consumption sequence;
2. determine and correct how consumed refresh-token replay preserves the
   `refresh_replay` reason when node-oidc-provider invokes
   `revokeByGrantId()`;
3. diagnose the G1 outbox delivery failure without modifying the Connector or
   production data; and
4. pass local/database/HTTP regression tests before requesting authorization
   for a fresh G1 attempt.

G2 explicit revocation remains not run and separately gated.
