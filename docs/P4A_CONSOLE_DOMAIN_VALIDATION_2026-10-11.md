# P4-A console domain candidate validation — 2026-10-11

## Scope

Local candidate validation only. No VPS, DNS, Cloudflare, production database
or WordPress Connector change was performed.

## Confirmed results

- `main` baseline: `bb71226fd21cc3c26d1f7e53e76b328b45fb095b`.
- P3-A remains incomplete according to its repository validation record;
  production cutover remains blocked.
- `pnpm check` with the repository tmpfs PostgreSQL fixture: 97 tests, 96
  passed, one existing PHP interoperability test skipped, zero failures.
- Migration 014 applied twice without checksum or idempotency failure.
- The database test confirmed hash-only browser secrets, handoff codes and
  console Session tokens; one-time exchange replay failed.
- Deleting the authoritative Better Auth Session cascaded to its derived
  console Session and pending transaction.
- The HTTP test confirmed exact auth/app Host separation, exact Origin on the
  exchange POST, a fragment-only handoff code, host-only cookies and rejection
  of a replayed code.
- Existing OAuth, PKCE, grant, JWKS, refresh, revocation and tenant-isolation
  regressions remained green.
- Connector changes: none.

## Data-flow review

The new flow carries only an opaque request ID, one-time random code, account
ID and Session metadata. It does not add an MCP endpoint, proxy, content field,
tool argument/result field, WordPress credential or Application Password to the
control plane. Client-to-WordPress MCP traffic remains direct.

## Not executed

- No `app.wpauto.cc` DNS, certificate or Nginx activation.
- No production migration 014.
- No production image rollout or smoke test.
- No P3-A/P3-B status change.

## Candidate status

`P4_A_LOCAL_CANDIDATE_PASS=True`

`P4_A_PRODUCTION_CUTOVER_AUTHORIZED=False`
