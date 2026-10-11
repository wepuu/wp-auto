# P3-A token lifecycle preflight — 2026-10-11

## Result

This is a read-only code, schema and production-metadata preflight. It did not
issue, rotate, replay or revoke a production token; write production data;
deploy code; run migration 014; or modify the WordPress Connector.

```text
REFRESH_REPLAY_SAFE_PREREQUISITES=False
GRANT_REVOCATION_SAFE_PREREQUISITES=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```

The positive acceptance Grant is the only active Grant for the Email OTP test
account, exact `test.wpauto.cc` resource and active `wepuu-e2e-codex` client.
Only that OAuth client is currently registered. Full opaque account, tenant,
site and Grant identifiers are intentionally omitted from this repository
record.

## Confirmed runtime contract

- `packages/oauth-provider/src/index.ts` sets the access-token TTL to 300
  seconds, requires PKCE and rotates refresh tokens.
- `packages/database/src/index.ts` detects reuse through consumed
  `oauth.secret_artifacts`. Reuse invokes `oauth.revoke_refresh_grant()` and
  returns OAuth `invalid_grant`.
- Migration `005_token_lifecycle.sql` revokes the exact platform Grant with
  reason `refresh_replay` and creates one content-free `grant` event in
  `oauth.revocation_outbox`.
- Explicit refresh-token revocation invokes the same Grant-level function with
  reason `token_revoked`. RFC 7009's non-enumerating HTTP success response is
  not sufficient evidence that revocation took effect.
- The authorization worker polls every two seconds, signs a bounded
  `wepuu-revocation+jwt` event and posts it to the fixed Connector revocation
  endpoint derived from the paired resource.
- Successful acceptance therefore also requires the outbox row to become
  delivered and the still-unexpired access token to be rejected by the
  Connector with the established `401` Bearer invalid-token contract.

`PostgresRefreshFamilyRepository` and `oauth.refresh_families` are covered by
database tests but are not referenced by the running provider integration.
Production evidence must therefore use the actual secret-artifact consumed
marker, platform Grant state, outbox state and Connector result. It must not
claim that a runtime refresh-family row changed unless that integration is
implemented and observed separately.

## Existing automated coverage and gap

The PostgreSQL suite proves that concurrent refresh consumption has one winner,
replay revokes the exact Grant and only one outbox event is created. Provider
tests prove normal refresh rotation, RFC 7009 submission and later
`invalid_grant`. Revocation-worker tests cover fixed endpoint derivation,
public-address pinning, delivery acknowledgement and bounded retry.

The current production script proves normal refresh rotation and submits one
revocation request, but it does not:

- replay R0 after rotating it to R1;
- prove R1 is rejected after replay;
- inspect the resulting Grant reason or outbox delivery;
- retry the same access token against WordPress before its natural expiry.

Its existing success output cannot close the P3-A lifecycle gate.

## Isolation blocker

`platform.grants` has a unique constraint on
`(tenant_id, site_id, subject_id, client_id)`. Refresh replay and explicit
revocation both revoke the complete Grant, not only one token. A second token
family under the same Grant is therefore not isolated.

The current Grant creation path inserts a new row and cannot replace a revoked
row with the same unique tuple. Using the positive `wepuu-e2e-codex` Grant
would both destroy the accepted relationship and prevent normal reauthorization
for that tuple. Dynamic client registration is disabled, and the repository
does not currently expose a supported production client-registration command.
Temporary SQL or an in-container edit is not an acceptable workaround.

Two distinct pre-registered clients and Grants are required:

- `wepuu-e2e-replay` for Refresh Replay;
- `wepuu-e2e-revocation` for explicit Token/Grant Revocation.

Both must remain public clients with the registered
`http://127.0.0.1/callback` loopback path, dynamic-port matching, PKCE S256 and
`token_endpoint_auth_method=none`. Their Grants must be established through
the normal WordPress-local and WePuu consent flows. The existing
`wepuu-e2e-codex` Grant must remain unchanged.

## Separately authorized execution

After a reviewed, supported operational path has provisioned the two clients,
the destructive acceptance must receive separate authorization for exactly:

1. Creating the two Grants through normal consent.
2. On the replay Grant, exchanging R0 for AT1/R1, replaying R0, requiring HTTP
   400 `invalid_grant`, requiring R1 to fail, and confirming
   `refresh_replay`, one delivered outbox event and Connector denial of AT1.
3. On the revocation Grant, revoking R, requiring its subsequent use to return
   `invalid_grant`, and confirming `token_revoked`, delivered outbox state and
   Connector denial of the still-unexpired AT.

Connector denial should be polled every two seconds for no more than 60
seconds. The JWT expiry must be checked before every attempt. Timeout, network
failure, rate limiting or natural token expiry is a failed or inconclusive
result, never a revocation pass.

Revoked Grants and content-free audit/outbox metadata remain as evidence. No
table cleanup, database restore or Grant reactivation is part of the test.
Provisioning the clients, restarting authorization to load them, running each
destructive scenario, or deploying any supporting code all require explicit
approval. None of those actions authorize P4-A, migration 014, Connector
changes or operations on unrelated sites and containers.
