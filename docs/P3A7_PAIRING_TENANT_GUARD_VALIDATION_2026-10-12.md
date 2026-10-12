# P3-A7 Pairing Tenant Guard Validation - 2026-10-12

Status: implementation candidate locally validated; not deployed; production pairing remains incomplete.

## Confirmed production failure

One explicitly authorized browser pairing was attempted after the diagnostic
Control image had been deployed. Control emitted correlation ID
`X1ELfkbjhQJqs4E24bFIRK6M`, stage `persistence` and code
`pairing.persistence_failed`. PostgreSQL recorded an RLS rejection while
inserting `platform.pairing_attempts`.

Read-only checks confirmed that the authenticated account and requested Tenant
both existed, but the account had no membership in that Tenant. The account had
one different active owner workspace, while the requested Tenant had its own
different active owner. The requested Tenant was not the authenticated
account's home Tenant.

No platform Pairing Attempt, Site, Grant or Outbox event was created. Neither
Nginx nor WordPress received a pairing-proof request in the failure window.
WordPress retained its local fail-closed `pending` state. The one-time verifier
must not be reused; recovery requires the normal local disconnect action and a
new pairing using the exact Tenant ID owned or administered by the signed-in
account.

No identifiers other than the content-free correlation ID are recorded here.
No verifier, proof, session, Cookie, Token, key material or request body is
retained.

## Candidate change

The Control pairing route now resolves the authenticated account's active
workspace memberships before calling the pairing service. Only an exact
`owner` or `administrator` membership may continue. A missing membership or a
`member` role:

- returns the unchanged generic `400 {"error":"invalid_request"}` response;
- does not call `PairingService` and therefore cannot persist an attempt or
  send a site-proof request;
- records the existing `tenant.access_denied / membership_missing` audit event;
- emits only the four-field internal diagnostic with stage `state` and code
  `pairing.tenant_access_denied`.

PostgreSQL RLS remains unchanged as the mandatory second enforcement layer.
There is no migration, pairing-protocol change, Connector change, OAuth change
or signing change.

## Local validation

Focused Control and Pairing tests verified:

- an owner membership continues through the existing pairing path;
- an administrator membership is accepted;
- a different Tenant and a same-Tenant `member` role are rejected before the
  pairing operation is called;
- the browser response remains generic;
- the diagnostic contains only `occurredAt`, `correlationId`, `stage` and
  `code`;
- verifier sentinel content is absent from diagnostics and audit data;
- existing PostgreSQL integration coverage continues to enforce RLS for a
  member or cross-Tenant insert.

`pnpm check` passed with 103 tests passing, 17 environment-dependent tests
skipped and zero failures. The complete isolated PostgreSQL 16 integration
suite passed 17 of 17 tests, including the existing cross-Tenant and
non-administrative RLS denial. No dependency or schema changed.

The data-flow review confirmed that the new check reads only platform account,
Tenant, membership role and status metadata. It does not receive, store, log or
relay WordPress content, MCP tool input or MCP tool output. Production
deployment, local pending-state recovery and a new pairing remain separately
gated.

```text
P3A_PAIRING_ROOT_CAUSE_CONFIRMED=True
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
