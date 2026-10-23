# P3-E2S-R4B-R8: compatibility clarified; authoritative-classification gate not satisfied

Result: **STOPPED_AT_CLASSIFICATION_DESIGN_GATE**. The compatibility clarification
and four offline characterization tests completed. No application fix, schema
change, image build or focused database reproduction was performed.

## Authority and starting point

The operator requested implementation of R8 after its plan was presented. That
plan explicitly requires stopping if safe classification cannot be established
without new schema/permission work; it does not authorize improvising migration017.
Work started at clean candidate `92c73315b15e6c1ef1ea6bbe18c032633f1df995`
in the existing isolated candidate worktree. R5/R6/R7 execution records remain
unchanged. No production or Desktop context is involved.

R7 had directly observed operation12, resource A, the first native
`mcp:read offline_access` authorization returning `invalid_grant` without a code.
Its adapter conflict was separately reproduced, but the precise HTTP rejection
branch was not captured. This design work does not change that evidence boundary.

## Completed contract clarification

Updated proposed ADR-024 with an explicitly unimplemented compatibility section:

1. Ordinary authorization without offline_access keeps Session binding.
2. Previously accepted native offline_access/Refresh behavior is not silently
   disabled by guard-only, and creates no custom persistent receipt.
3. The new custom persistent read-only flow requires explicit approval and the
   existing complete receipt/link protection.
4. Unknown classification, missing protected linkage, conflicting metadata and
   storage errors must not fall back to native behavior.
5. These distinctions must apply consistently to save, load, verification,
   consumption and Refresh rotation, not only adapter upsert.

This clarification is not an implementation pass or approval to weaken accepted
Session, Tenant/resource/Grant, PKCE, time, rotation or replay controls. It does
not expand the real Desktop Scope, alter production or grant new user access.

The pinned [Provider code handler](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/helpers/process_response_types.js)
only explicitly writes expiresWithSession for its true branch. The
[native Session guard](https://github.com/panva/node-oidc-provider/blob/v9.12.2/lib/models/token_helpers.js)
retains its account and per-client Grant checks. Neither behavior is replaced here.

## Why the proposed shortcuts are not accepted

Source review covered:

- `packages/oauth-provider/src/persistent-readonly.ts`: broad requiresLink
  predicate and narrower eligible predicate, across save/verify/consume.
- `packages/database/src/index.ts`: SecretArtifactCodec and base adapter writes.
- `packages/database/src/persistent-readonly.ts`: link lookup and atomic-save port.
- migrations005 and016: existing metadata, grants and link constraints.

Observed facts:

- secret_artifacts has a global/tenant partition discriminator, but no dedicated
  authorization-mode discriminator.
- The real base adapter derives that partition from payload tenantId/tenant_id.
  It can write either partition without creating any persistent receipt/link.
  Its conflict update can also replace partition metadata.
- The link read queries persistent_links joined to receipts. If a link is absent,
  it returns undefined; that result alone does not attest native origin.
- SecretArtifactCodec computes HMAC lookups for opaque artifact identifiers. It
  does not authenticate the entire stored JSON payload.
- The existing runtime role has general SELECT/INSERT/UPDATE/DELETE on
  secret_artifacts. A new arbitrary JSON field cannot simply be declared an
  immutable, integrity-protected authorization class.

Consequently, changing requiresLink to eligible, treating an offline_access Scope
as sufficient native authority, treating tenant partition as custom mode, or
trusting an unchecked JSON marker does not meet R8's stated downgrade safeguards.

This is **not** proof of a remotely exploitable production vulnerability, nor an
assertion that every possible migration-free design is impossible. In particular,
observed native global records do not prove that every current/historical native
artifact is globally partitioned, and the generic storage contract explicitly
allows tenant placement. Establishing a new exclusive partition invariant would
itself require a compatibility/write-path design and supporting evidence.

The narrow conclusion is that no reviewed safe mode-classification implementation
has been established within the current port/metadata contract. Rather than ship
a broad fallback, R8 follows its explicit stop gate.

## Offline validation

Added `scripts/multisite-r8-storage-boundary.test.mjs`. Four tests passed with
zero failures/skips under the existing fixed Node24/Linux test image:

```text
sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2
actual image build: 248f9cc6616c3f8a2a143201eb3ac4d3310a3fa6
```

Tests exercise the real unchanged base-adapter and link-store methods using
mock database callbacks, plus source/metadata characterization:

1. Native base upserts can produce both partitions without receipts.
2. An empty link lookup has no independent artifact-mode information.
3. A synthetic missing-link/changed-Scope tuple defeats a naive scope predicate
   and can coincide with the fields inspected on a native tenant record.
4. Existing schema/codec contract has no protected authorization-mode field.

The third case is an abstract downgrade counterexample, not a real database
tampering run or evidence of client access to those storage fields. The fourth
is structural inspection, not a proof that stronger classification cannot ever
be designed with existing schema.

The test container used --network none, no database URL or production secrets,
no published ports, UID1000, read-only filesystem, dropped capabilities,
no-new-privileges and bounded /tmp tmpfs. It imported original runtime source
from the retained immutable image and mounted only scripts read-only. --rm
removed that temporary validation container. No PostgreSQL container was
created and no database connection, migration, OAuth exchange or MCP call ran.

These four passes are **diagnostic/design evidence**, not a successful repair,
native lifecycle regression, PostgreSQL transaction test or candidate acceptance.

## Required next decision

A separately reviewed classification design must define:

- Versioned authoritative origin/mode and allowed transitions.
- How trusted issuance establishes it and ordinary requests cannot choose it.
- Atomic custom artifact/link association and immutable mode on overwrite.
- How known custom artifacts still deny when links or payload fields are missing
  or altered, while native Refresh remains delegated to reviewed Provider logic.
- Legacy unclassified artifacts and key-version collisions: ambiguous states
  deny; no blanket backfill of existing artifacts as native.
- Refresh lineage inheritance and retention of replay tombstones.
- Existing runtime reader/writer permissions and rollback compatibility.

If this requires a new candidate migration, function or privilege boundary, the
operator must separately approve that design/scope first. No017 SQL, new role,
payload marker, cryptographic primitive, backfill or permission change has been
implemented. Existing005/016 hashes and the migration selection remain unchanged.

After that design is accepted, a later implementation can add a minimal fix,
focused adversarial tests, one newly built fixed-source test image and one
bounded database reproduction. This record does not authorize or execute those
steps or automatically continue R5.

## Final state

```text
P3E2SR4BR8_COMPATIBILITY_CONTRACT_CLARIFIED=True
P3E2SR4BR8_OFFLINE_CHARACTERIZATION_PASS=True
P3E2SR4BR8_CLASSIFICATION_CONTRACT_CONFIRMED=False
P3E2SR4BR8_NATIVE_REFRESH_COMPATIBILITY_PASS=NOT_RUN
P3E2SR4BR8_CUSTOM_PERSISTENT_FAIL_CLOSED_PASS=NOT_RUN
P3E2SR4BR8_FOCUSED_MULTISITE_PASS=NOT_RUN
P3E2SR4BR8_APPLICATION_FIX_VALIDATED=False
P3E2SR4BR8_IMAGE_BUILD_PERFORMED=False
P3E2SR4BR8_DATABASE_REPRODUCTION_PERFORMED=False
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Only the ADR clarification, characterization test and this record changed. No
public API, application type, application implementation, SQL, lockfile, runtime
configuration or original test assertion changed. No production access, OTP,
WordPress operation, Desktop credential access, deployment, Hosted CI, push, PR,
merge or global cleanup occurred. Original user changes and design files were
preserved. These candidate flags neither revoke nor revalidate the separately
approved existing single-Site internal read-only trial.
