# P3-A7 pairing tenant guard production-baseline validation

Date: 2026-10-12

## Scope

This candidate is based on the deployed Control diagnostics baseline at
`84f260e584b6cb819626763950f9e7fcf2d746db`. It adds only the authenticated
tenant membership guard required before a pairing attempt can be persisted or
a WordPress proof can be requested.

The route now requires the current account to have an active `owner` or
`administrator` membership for the exact submitted tenant. A missing,
inactive, or non-administrative membership fails closed with the existing
generic `invalid_request` response and the content-free internal diagnostic
`pairing.tenant_access_denied`.

The candidate does not include P4-A, console sessions, migration 014, an OAuth
or signing change, a Connector change, or a database schema change. Migrations
remain 001 through 013.

## Validation

- `pnpm check`: passed; 90 passed, 15 environment-dependent tests skipped,
  0 failed.
- Focused Control API tests verify that a missing membership and a normal
  member are rejected before `PairingService` or the proof client is called.
- Focused Control API tests verify that an active administrator is accepted.
- The external response remains generic and diagnostic output remains bounded
  and content-free.
- `git diff --check`: passed.
- Isolated PostgreSQL 16 integration validation against migrations 001-013:
  15 passed, 0 failed.

## Production status

This record does not authorize or report a production pairing. At the time of
validation, the test WordPress site remains safely disconnected. Deployment of
a digest-pinned Control image and any subsequent normal pairing are separate
controlled steps.

```text
P3A_PAIRING_TENANT_GUARD_VALIDATED_LOCALLY=True
P3A_NEW_SITE_PAIRING_EXECUTED=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
