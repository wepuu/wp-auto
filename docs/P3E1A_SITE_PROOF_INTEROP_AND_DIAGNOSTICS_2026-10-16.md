# P3-E1A — frozen real signer interoperability and claims diagnostics

Date: 2026-10-16 (Asia/Shanghai). Candidate only; no production access or changes.
Base: `e8778da33d850303d1ccbdfbebf088610bf6ac5f` (reviewed main).
Decision: [ADR-023](ADR-023-SITE-PROOF-CLAIMS-DIAGNOSTICS.md).

## Historical evidence and preservation

The single authorized www.wepuu.com pairing failed with `proof.claims_invalid`.
Key import, protected header and EdDSA verification had succeeded before that
classification. No new platform Site or Grant was created. Operator-provided
read-only results show local active, v2 sequence 0, consumed pending state,
matching control/issuer/tenant/resource/public pins and four critical source
hashes. No original signed proof remains. These facts do not identify a failing
claim, prove clock skew, or establish installed dependency/FPM equivalence.

No Enable/Connect/Disconnect, proof request, production SSH, clock adjustment,
WordPress option/identity update, OAuth, deployment, migration, or mail operation
is part of this candidate. Historical failed evidence is not rewritten.

## Artifact and real signer procedure

Original Connector 0.1.0 ZIP SHA-256:
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
Unchanged 1,119,372-byte archive is retained only under top-level test fixtures,
with original project/vendor licenses. Its Composer autoloader, Lcobucci JWT
4.3.0 and actual SiteProofSigner are used, not a reconstructed JWT generator.
Archive hash and signer hash are asserted. The existing raw-sodium PHP test is
retained, but not treated as equivalent to this real-signer test.

Official PHP 8.2.28 Linux amd64 manifest:
`sha256:4bbc4316a5b4acd689fe791603d5340bed9184d6cb4303c070cf5630711e609a`.
Resolved read-only from Docker Registry, no images published. CI additionally
executes the retained pinned PHP 8.1 image. Exact PHP version, sodium and JWT
version are checked. Missing prerequisites fail this gate, not skip it.

Runner: `pnpm build`, then `node scripts/test-real-site-proof.mjs` and the same
command with `--legacy`. Python standard-library extraction checks hash,
entry paths/types/duplicates and bounds before writing any file. Synthetic
keys stay in the network-disabled PHP process; proofs stay in bounded memory
pipes and are never persisted or printed. Timeouts terminate children and
remove the exactly named test container; generated temporary data is removed.

Three fixed clock representations (whole second, microseconds, UTC+08) and
three PEM byte representations (LF, CRLF, no final newline) produce nine
positive proofs per PHP version and nine cross-byte PEM mismatch rejections.
This is a synthetic signer test, not a full WordPress REST/FPM/plugin-load test.

## PHP / TypeScript field correspondence

| Field | PHP signer source | TypeScript requirement |
|---|---|---|
| Header alg / kid / typ | Eddsa / synthetic SiteIdentity / fixed header | Exactly EdDSA, matching kid, wepuu-site-proof+jwt; exactly three keys |
| kind / protocol_version | Fixed pairing / string 1 | Strict schema and expected kind |
| iss | CanonicalResource hostname | Exact expected resource hostname |
| platform_issuer | Validated request | URL and exact expected issuer |
| tenant_id | Validated request | UUID and exact tenant |
| pairing_attempt_id / site_id | Validated request | Opaque IDs and exact optional bindings |
| platform_signing_key_sha256 | SHA-256 of original PEM UTF-8 bytes; base64url | 43 base64url chars and exact expected hash |
| platform_signing_kid | Validated request | Opaque ID and exact binding |
| resource | Validated request | Canonical HTTPS resource, exact expected value |
| challenge | Validated request | 32–128 base64url chars, exact match |
| iat / exp | whole_second(clock), +60 seconds | Integers; exp > now, iat <= now+5, exp-iat <=60 |
| aud / grant_id / client_id / subject_id / decision | Not set for pairing | Absent for the full E1 expected binding; null is not absence |
| scope | Not set for pairing | Existing schema/expected-scope behavior unchanged |
| nbf / unknown claims | Not set | Strict schema rejects extras |

Do not normalize PEM, alter optional-field policy, tolerance, scopes, TTL or
acceptance predicates. The pinned baseline comparison intentionally retains
existing unsolicited-valid-scope and nonpositive-interval behavior; any review
of those rules is a separate security task, not a silent diagnostic change.

## Validation record

Local environment: Windows, Node 26.11.1. PHP and Docker not available locally.

| Check | Local result |
|---|---|
| Typecheck / ESLint | PASS |
| New diagnostic, pinned-baseline parity, child-sentinel tests | 36 PASS, 0 FAIL |
| Existing pairing + Control HTTP targeted tests | 35 PASS, 0 FAIL, 1 existing database-dependent SKIP |
| ZIP safety / bad hash / real archive extraction | 3 PASS |
| Script syntax and git diff --check | PASS |
| Full pnpm check | FAIL: existing Windows HTTPS certificate fixture cannot load Microsoft.PowerShell.Security / Cert drive |
| Real PHP signer locally | NOT_RUN: no PHP/Docker; not a production failure |
| Local database and OCI gates | NOT_RUN: no isolated PostgreSQL/Docker |
| Hosted full CI, real signer, database, OCI/audit | PASS; evidence below |

No Windows TLS verification was disabled and no existing test was removed or
made optional. Hosted Linux CI must run the HTTPS test, PostgreSQL tests, real
signer gates, non-root OCI exclusion checks, dependency audit and retained
conformance gates. The pinned pre-change verifier source is read from Git and
compiled only in memory for a before/after acceptance comparison.

### Executed Hosted evidence

[Hosted run 38809330475](https://github.com/wepuu/wp-auto/actions/runs/38809330475)
completed successfully against code commit
`a83f74e75153b23109da289c33ba1a9c7cb88202`.

- Strict checks: 256 PASS, 0 FAIL, 1 existing opt-in PHP test SKIP. The explicit
  legacy PHP step ran separately and returned `PHP_SITE_PROOF_INTEROP=pass`.
- PHP 8.2.28: 9 real-signer positive scenarios and 9 PEM byte-mismatch
  rejections PASS. PHP 8.1.34: the same 18 assertions PASS.
- ZIP security/extraction: 3 PASS. PostgreSQL migration/isolation: 28 PASS,
  0 FAIL, 0 SKIP.
- Non-root OCI build and fixture exclusion, production-mode local signing OCI,
  isolated database backup/restore/tombstone replay: PASS.
- Dependency audit, SBOM/license metadata and contract/evidence checks: PASS.
- Retained OAuth conformance: 37 PASS, 0 FAIL, 1 existing SKIP; the skipped
  historical coverage is not represented as a pass.

The original ZIP signer/dependencies did not reproduce an incompatibility in
these synthetic environments. This does not prove production dependency or
FPM context equivalence, exclude historical clock skew, or reveal which
historical claim failed. No runtime compatibility repair is justified by the
results; this candidate adds diagnostics only.

## Diagnostic and data-flow review

Only the first fixed claims detail is added to the existing internal event:
UTC time, existing correlation ID, stage, code, optional allowlisted detail.
External `{error: invalid_request}`, status 400, audit reason `proof_invalid`
and failure persistence remain unchanged. Known claims errors carry no raw
cause; unknown exceptions become fixed unknown. Non-claims errors do not gain
claims detail. Tests verify HTTP/audit exclusion, sink failure isolation,
runtime whitelist defense and secret-sentinel non-disclosure.

No new public API, database migration, metric label, authentication policy,
Connector change, MCP argument/output or WordPress content handling is added.

## Separately authorized next steps only

If production diagnostic deployment is subsequently approved, first read the
actual deployed Control source baseline, prepare a minimal backport, verify
001–013 + 015 and no 014/P4-A, build/test fixed artifacts, and plan Control-only
backup/deploy/health/rollback. This PR neither builds release artifacts nor
publishes/deploys them. Local-state recovery and any next pairing are separate
authorizations. Never reissue the consumed proof or clear identity/options.

## Candidate status (after executed Hosted CI)

```text
P3E1_PAIRING_PROOF_LOCAL_INTEROP_PASS=NOT_RUN
P3E1_PAIRING_PROOF_HOSTED_INTEROP_PASS=True
P3E1_CLAIMS_DIAGNOSTICS_CANDIDATE_PASS=True
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

`LOCAL` above means this Windows workstation (no PHP/Docker), not the Hosted
synthetic environment. Hosted interop was actually executed and is separately
reported. Historical root cause and production pairing remain unconfirmed/failed
despite the passing synthetic tests. A documentation-only follow-up records
these results; the PR's latest-head CI must also remain green before handoff.
