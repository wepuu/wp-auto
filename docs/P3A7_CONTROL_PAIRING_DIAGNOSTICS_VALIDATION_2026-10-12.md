# P3-A7 Control Pairing Diagnostics Validation - 2026-10-12

Status: local candidate validated; historical production root cause remains unconfirmed; no production deployment or pairing performed.

## Scope

This change adds content-free diagnostic classification around the Control pairing persistence, HTTPS response and site-proof boundaries. It does not change the public pairing response, security-audit schema, database schema, pairing protocol, SSRF policy, TLS verification, Connector, OAuth issuer or token contracts.

The browser continues to receive only `400 {"error":"invalid_request"}`. The existing database audit event remains `pairing.denied / proof_invalid`. A separate process sink receives exactly `occurredAt`, `correlationId`, `stage` and a fixed low-cardinality `code`.

## Implemented classifications

- DNS and destination: `dns.failed`, `destination.unsafe`.
- Network and TLS: `network.failed`, `network.timeout`, `tls.failed`.
- HTTP: exact `http.401`, `http.403`, `http.429`; bounded `http.4xx`, `http.5xx`, `http.other`.
- Response: invalid content type, excessive size, invalid JSON and schema mismatch.
- Proof: invalid key, protected header, signature and claims.
- Pairing lifecycle: invalid state and repository persistence failure.
- Unclassified exceptions: `unknown`.

Original exceptions remain only as non-serialized in-memory causes. Neither exception messages nor HTTP bodies are used to derive log fields.

## Executed validation

The focused Pairing and Control API suite passed with 33 tests passing and two environment-dependent tests skipped. It used a real Node HTTPS server on a random loopback port and a runtime-generated test certificate. The tests verified:

- pinned target address with the expected SNI and Host;
- POST, JSON content type and exact content length;
- 401, 403, 429, other 4xx, 5xx and redirect rejection;
- response content-type, JSON, schema and size failures;
- self-signed and hostname-mismatch TLS rejection;
- connection reset and timeout classification;
- one request per scenario with no retry;
- proof key, header, signature and claims separation;
- generic public API response and unchanged security-audit reason;
- a diagnostic event with exactly four allowed fields;
- absence of verifier, request/response sentinel, exception text and sink failures from returned or captured diagnostic data.

An isolated PostgreSQL 16 database was migrated using only migrations 001 through 013. The integration test passed and confirmed:

- an RLS-rejected `createAttempt` becomes `pairing.persistence_failed` before any site-proof client call;
- a classified proof failure leaves the attempt in `failed` with the existing bounded failure code;
- no Site or Grant is created on either failure path.

The temporary database and TLS material were removed after the tests. The runtime image contains no generated test certificate.

The complete repository gate passed with 101 tests passing, 17 environment-dependent tests skipped and zero failures. The complete PostgreSQL suite passed 17 of 17 tests. Dependency audit reported no known vulnerabilities. The pinned SBOM check passed with 286 components. Locally built Control and Authorization images ran as the non-root `node` user; the production-mode local-signing OCI gate passed, JWKS contained no private members and no AWS KMS runtime dependency was present. The local main-branch image correctly contained migration 014 and is not the production hotfix artifact; the separately built production-baseline image must be limited to migrations 001 through 013 before it is published.

## Historical production pairing failure

The failed production pairing created no new `platform.pairing_attempts` row. Because `PairingService.begin()` runs before DNS and HTTPS proof retrieval, this is evidence that a persistence-stage failure is plausible and must be diagnosed first. It does not prove the historical cause: the old Control image did not retain the new typed diagnostic, and no surviving log directly identifies the database, DNS, network, response or proof boundary.

No new production pairing was performed. No real Cloudflare hop was exercised by this local validation. A future pairing may be attempted only after a fixed Control diagnostic image is separately approved and deployed.

## Historical Outbox HTTP 401

Existing origin Apache evidence shows the revocation POST reached the WordPress REST route and returned 401. The observed result therefore must not be described as a Cloudflare rejection.

Two Connector fail-closed conditions remain consistent with the retained evidence:

- before disconnect, legacy state had `last_sequence=2`, so the same sequence with a different digest was rejected;
- after disconnect, the local connection was absent, which also causes the revocation endpoint to return its generic 401.

The historical response cannot distinguish those conditions because the Connector intentionally exposes only a generic 401. No old Outbox row was modified, deleted or requeued.

## Not executed

- production Control deployment;
- production or Cloudflare-backed pairing;
- Site or Grant creation;
- G1 Refresh Replay or G2 revocation;
- Connector, Nginx, DNS or database-schema changes.

```text
P3A_PAIRING_ROOT_CAUSE_CONFIRMED=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```
