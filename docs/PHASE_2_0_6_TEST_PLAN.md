# Phase 2.0.6 Security and Resilience Test Plan

Status: deterministic implementation validated on `codex/phase-2-0-6-security-resilience`;
live KMS/HTTPS/Codex and final available-capability review remain open.

Codex Security TAC/Daybreak is waived as unavailable and must be recorded as
`not executed`, never as a passing scan. ADR-013 defines the compensating gates
and the project owner's residual-risk acceptance.

This plan qualifies the accepted Phase 2.0.1 through Phase 2.0.5 contracts. It
does not authorize production deployment, public release, or Phase 2.0.7 work.

## Evidence rules

- Evidence records only the case id, candidate, client/runtime version, method,
  path, status, selected safe response headers, error category, counts, and
  stable placeholders such as `{opaque}` and `{timestamp}`.
- Evidence must never contain access or refresh tokens, cookies, upstream
  identity subjects, authorization codes, secret hashes, WordPress content,
  MCP request bodies, MCP results, or provider credentials.
- Every negative case must prove both the externally safe response and the
  absence of a state transition or cross-tenant disclosure.
- Any test that needs real KMS uses GitHub OIDC and the two existing test keys;
  no long-lived AWS credential is written to a fixture, log, or artifact.

## Security matrix

| Case group | Threats | Required exercise | Required result |
|---|---|---|---|
| S01 Authentication | T01, T04, T05, T06 | Login transaction tampering, state/nonce/issuer mismatch, strict redirect, PKCE downgrade, authorization-code replay | Safe error; no session, grant, or code reuse |
| S02 Token binding | T07, T08, T12, T13, T15 | Wrong issuer, resource, audience, site, grant, tenant, client, scope, and audience-array tokens | 401/403; no platform or WordPress content path |
| S03 Refresh replay | T09, T10 | Concurrent rotation, stale generation, reuse after success, family revocation | One winner; all later family uses fail closed |
| S04 Key compromise | T11 | Unknown `kid`, algorithm confusion, stale JWKS, emergency `kid` revocation, KMS denial | One bounded refresh; revoked/unsafe state denied |
| S05 Tenant isolation | T12, T13, T15, T16 | Cross-tenant list/read/write/revoke/disconnect and object-id substitution | No existence signal and no state change |
| S06 SSRF and DNS | T02, T03 | Private/loopback/link-local/metadata addresses, IPv4/IPv6 variants, redirects, rebinding, timeout and port corpus | Request rejected before unsafe network access |
| S07 Authorization freshness | T14, T16 | User deletion/demotion, membership revoke, site disconnect and re-pair | Current capability/grant state wins; old bearer denied |
| S08 Privacy and abuse | T17, T18, T20 | Log redaction, malformed input, bounded body/rate limits, deletion artifact inspection | No secret/content leakage; bounded safe errors |

## T01-T22 executable traceability

The deterministic references below are the local test names. `live` means the
same case must be repeated by the HTTPS/KMS/Codex harness before closure.

| ID | Executable evidence | Expected result | Status |
|---|---|---|---|
| T01 | `account-identity.test.ts`: OIDC login/callback; `provider.flow.test.mjs`: code+PKCE | State, nonce and issuer failures create no session | deterministic pass; live pending |
| T02 | `pairing.test.ts`: SSRF policy corpus | Private, loopback, link-local and metadata targets are rejected | deterministic pass |
| T03 | `pairing.test.ts`: pinned lookup/HTTPS verifier; `revocation-worker.test.ts`: pinned delivery | DNS changes and redirects cannot move the request to an unsafe address | deterministic pass; live pending |
| T04 | `provider.smoke.test.mjs`: strict redirect metadata | Only registered redirect URI is accepted | deterministic pass |
| T05 | `provider.smoke.test.mjs`: missing PKCE and `profile.test.mjs`: PKCE S256 | Plain or missing PKCE is rejected | deterministic pass |
| T06 | `provider.flow.test.mjs`: single-use authorization code | Code replay fails without a second grant or token | deterministic pass |
| T07 | `profile.test.mjs`: exact issuer/resource/audience | Wrong issuer or resource fails closed | deterministic pass; live pending |
| T08 | `profile.test.mjs`: single audience/scope ceiling | Audience arrays and excess scopes are rejected or reduced safely | deterministic pass |
| T09 | `tenant-isolation.test.ts`: refresh CAS winner | Exactly one concurrent refresh succeeds | deterministic pass |
| T10 | `profile.test.mjs` and `provider.flow.test.mjs`: refresh replay/family revoke | Reuse revokes the complete refresh family | deterministic pass |
| T11 | `jwks-cache.test.mjs` and `aws-kms.test.ts`: unknown key/KMS denial | One bounded JWKS refresh; signing and unsafe keys fail closed | deterministic pass; live pending |
| T12 | `tenant-isolation.test.ts`: RLS; `profile.test.mjs`: binding claims | Cross-tenant access has no existence signal or state change | deterministic pass |
| T13 | `scope-contract.test.ts` and grant-claim tests | Resource, site, grant and scope substitution fails closed | deterministic pass |
| T14 | connector bearer/revocation suites and deletion lifecycle | Deleted or demoted users lose existing capability | deterministic pass; live pending |
| T15 | `profile.test.mjs`: tenant/site/grant/client bindings | Client or grant substitution cannot authorize a request | deterministic pass |
| T16 | `revocation-worker.test.ts`, connector Phase206 tests | Disconnect/revoke is immediate, idempotent and monotonic | deterministic pass; live pending |
| T17 | `audit.test.ts`, adapter redaction tests | Logs and evidence contain no credential or content fields | deterministic pass |
| T18 | registration/server tests and rate-limit tests | Malformed input and abuse are bounded with safe errors | deterministic pass |
| T19 | `resource-server.test.mjs`: direct MCP and control trace canary | MCP parameters/results never enter the control plane | deterministic pass; live pending |
| T20 | deletion lifecycle and backup/tombstone script | Reports/artifacts contain only opaque IDs, counts and status | deterministic pass |
| T21 | persistence adapter and backup/restore tests | DB outage/restart/migration replay leaves no half-active state | deterministic pass; live pending |
| T22 | JWKS outage, KMS failure, revocation retry and connector offline tests | Uncertain authentication fails closed; Application Password remains independent | deterministic pass; live pending |

## Resilience matrix

| Case group | Injected failure | Required result |
|---|---|---|
| R01 Database | Connection loss, transaction abort, process restart, migration replay | 503 or safe retry; no half-active grant, duplicate code, or leaked tenant row |
| R02 KMS | `DescribeKey`, public-key, and signing denial; disabled/unknown key response | No new signing or token issuance; existing unsafe state is not accepted |
| R03 JWKS | Fetch timeout, malformed document, stale cache, unknown key | Known unexpired key may verify; stale/unknown unsafe state fails closed |
| R04 Revocation delivery | Timeout, duplicate, out-of-order, retry, endpoint outage | Bounded backoff and idempotent sequence; local revoke remains immediate |
| R05 OIDC provider | Discovery, callback, and user-info outage or malformed response | `temporarily_unavailable`/safe denial; no partial account session |
| R06 Clock | Plus or minus 60 seconds, expired, future, and excessive lifetime claims | Only the contracted skew is accepted |
| R07 WordPress outage | Connector cannot reach platform/JWKS/revocation endpoint | Bearer fails closed when unsafe; Application Password remains independent |
| R08 Backup and restore | Dump, clean restore, pre-delete restore, tombstone replay | Restore is usable; verified deletion survives tombstone replay |

## Deletion and recovery cases

- D01 account deletion removes sessions, identity mapping, and memberships;
  sole-owner tenants fail closed until transferred or deleted.
- D02 tenant/site deletion immediately invalidates grants, refresh families,
  sites, sessions, OAuth artifacts, pairing records, idempotency records, and
  pending revocation work according to the safe-window contract.
- D03 a post-deletion backup contains no deleted object or secret artifact.
- D04 a pre-deletion backup restored into a clean database is followed by an
  external, non-secret tombstone manifest replay; all targeted records are
  absent and unrelated tenant records remain present.
- D05 deletion reports contain only record-type counts, status, timestamps,
  and stable opaque job references.

## Exit criteria

All S01-S08, R01-R08, and D01-D05 cases pass with no unresolved Critical,
High, or Medium security finding from an executed check. Low findings require
a documented disposition. The retained Phase 2.0.5 HTTPS, dual-KMS, Codex
direct-MCP, privacy, and cleanup gates remain mandatory regression gates. The
unavailable TAC/Daybreak review is not an exit gate under ADR-013.
