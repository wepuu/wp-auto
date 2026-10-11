# P3-A token lifecycle preflight — 2026-10-11

## Result

This combines a read-only code, Connector, schema and production-metadata
preflight with a disposable local PostgreSQL integration test. It did not
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

## Grant uniqueness and re-consent correction

Migration `002_pairing_and_grants.sql` originally created a complete unique
constraint on `(tenant_id, site_id, subject_id, client_id)`. Migration
`004_grant_reconsent.sql` drops that constraint and creates the partial unique
index `grants_one_live_consent_idx`, which covers only Grants in `pending`,
`active` or `suspended` state. No later migration restores the complete
constraint. A read-only production catalog query confirmed that production has
the partial index and no complete tuple constraint.

The disposable PostgreSQL test now proves the actual path:

- `GrantService.begin()` and `PostgresGrantRepository` create and activate G1;
- replay through `PostgresOidcAdapter` revokes G1 with `refresh_replay`;
- the same account, tenant, site and client tuple can create and activate a new
  G2 through the normal Grant repository path;
- G1 remains revoked, its R0/R1 remain unusable and exact G1 claims no longer
  resolve after G2 becomes active;
- revoking G2 through the runtime refresh-token path marks only G2 revoked with
  `token_revoked`.

The existing Connector repository was inspected read-only at commit
`92971ceacebf557eaedbf11bccb06c8b4e6ba5c2`. Its local Grant and revocation
records are keyed by the exact opaque Grant ID, so G1's deny state remains in
force and does not deny the fresh G2 ID. Existing pairing tests continue to
cover signed proof verification around the repository activation boundary.

## Minimum isolated client path

One additional pre-registered client is sufficient. The local candidate adds
non-HTTP, fixed-purpose commands for `wepuu-e2e-lifecycle` with only
`http://127.0.0.1/callback`: `provision-p3a-lifecycle` and the compensating
`suspend-p3a-lifecycle`. It is a public client; the existing provider still
enforces PKCE S256 and `token_endpoint_auth_method=none`. Provisioning is
idempotent, obtains a transaction advisory lock and fails closed if an existing
row differs in registration mode, redirect URI, digest or status. Suspension
only accepts an exact matching row and is idempotent; neither command accepts
an arbitrary client ID or redirect URI, and neither can update
`wepuu-e2e-codex`.

No schema migration is needed. Dynamic client registration remains disabled.
Authorization loads active clients at process startup, so a future separately
authorized production provisioning operation requires one Authorization
Service restart before the client is usable. The command has not been run on
the VPS, and the existing `wepuu-e2e-codex` client and positive Grant remain
unchanged.

The reviewed one-shot command must be invoked directly as the fixed CLI; it
must not start a new Authorization image with its default entrypoint because
that entrypoint runs all bundled migrations, including migration 014. After the
row is provisioned, restarting the existing fixed production Authorization
container is sufficient to reload clients. Any one-shot image use and that
restart remain separately authorized production operations.

Local verification passed all 16 PostgreSQL integration tests, including
provision/suspend idempotency and the re-consent lifecycle. The production
probe now supports `--mode replay` and `--mode revocation`: it distinguishes
OAuth `invalid_grant`, checks Connector `401` with `invalid_token`, and polls
only while the JWT is still unexpired. Grant status, reason and revocation
outbox delivery remain a separate content-free VPS read-only check; the probe
never prints tokens or secrets. The complete repository check passed after
these additions: 103 tests, 87 passed, 16 environment-dependent tests skipped
and 0 failures. The hosted CI for commit `15537a2` also passed.

## Separately authorized execution

After the reviewed operational path has provisioned the one lifecycle client,
the destructive acceptance must receive separate authorization for exactly:

1. Creating G1 for `wepuu-e2e-lifecycle` through normal WordPress-local and
   WePuu consent.
2. On G1, exchanging R0 for AT1/R1, replaying R0, requiring HTTP
   400 `invalid_grant`, requiring R1 to fail, and confirming
   `refresh_replay`, one delivered outbox event and Connector denial of AT1.
3. Creating fresh G2 for the same tuple through the normal consent flow after
   G1 is revoked.
4. On G2, revoking R, requiring its subsequent use to return
   `invalid_grant`, and confirming `token_revoked`, delivered outbox state and
   Connector denial of the still-unexpired AT.

Connector denial should be polled every two seconds for no more than 60
seconds. The JWT expiry must be checked before every attempt. Timeout, network
failure, rate limiting or natural token expiry is a failed or inconclusive
result, never a revocation pass.

Revoked Grants and content-free audit/outbox metadata remain as evidence. No
table cleanup, database restore or Grant reactivation is part of the test.
Provisioning the client, restarting authorization to load it, running each
destructive scenario, or deploying any supporting code all require explicit
approval. None of those actions authorize P4-A, migration 014, Connector
changes or operations on unrelated sites and containers.
