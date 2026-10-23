# P3-E2S-R4B-R9: authoritative classification, constrained writes and focused native lifecycle PASS

Status: the approved local candidate implementation, isolated writer/upgrade
acceptance, single test-image build and single full multi-Site target all passed.
This is not complete R5, explicit-consent A/B integration, production release or
Desktop/account-switching acceptance. Historical R5-R8 records are unchanged.

## Frozen sources and changes

Started from clean candidate `546dc51447ff99c9b592f286c6888be0913e1683` in the
existing isolated worktree. Application/SQL and constraint tools were frozen at
`1fef1ad0198a1fae28f3c2901f3dc1646532aef2`. Build tooling was frozen at
`eb5f5b573d958f40d08339ea9c2e8af8cb664c45`; application/packages have no diff
between those revisions. No dirty original-worktree or design files were edited.

Added candidate migration017 and updated the Authorization profile to exactly
001-013 +015 +016 +017 (16 files; no014). Original migrations001-016 are unchanged.
017 SHA-256:

```text
8c63110b31d9b732eb240d206c78b7c9d4ea0584515025d8a8e47c14a7fbdbcf
```

The original multi-Site test changes only its migration filter/count to include
017/16. Its OAuth, Session, Token, resource, lifecycle and negative assertions
are retained. Migration-profile tests now accept the exact017 file and reject
unknown018. No public API, WordPress Connector, catalog, Scope configuration,
OAuth Client registration or application dependency version changed.

## Authority and write-path implementation

`oauth.artifact_classifications` is the authority for Code and Refresh modes:
SESSION_BOUND, NATIVE_OFFLINE, PERSISTENT_READONLY. It stores version1, HMAC lookup
reference, immutable security binding, Tenant/Site, authorization deadline and
receipt/parent association. It does not store raw Code/Refresh bearer values.

- Mode/binding are immutable; a trigger permits only the first destroyed_at
  transition. Classification/tombstone survives artifact payload deletion.
- Registration rejects existing artifacts/tombstones across supplied key-version
  candidates. Conflicting candidate records deny rather than choose the first.
- A unique parent-successor index prevents multiple Refresh descendants from
  being minted from one consumed parent.
- New native Code mode is selected by the trusted write function from the
  Provider-produced artifact, not a caller-provided mode parameter. Active
  account/Tenant/member/Client/Site/Grant, resource and requested scopes are checked.
- Native Refresh must reference a consumed, unexpired NATIVE_OFFLINE parent,
  retain binding, not expand scope and inherit its original authorization deadline.
- Custom classification and existing016 artifact/link save share one database
  transaction. Missing or inconsistent links cannot fall back to native behavior.
- Classification reads compare current artifact security fields with ledger
  binding and verify current Grant/Site binding. Unknown or missing authority
  denies. No historical artifacts were guessed/backfilled as native.

wepuu_auth no longer directly INSERTs/UPDATEs/DELETEs secret_artifacts, cannot
mutate the ledger and cannot assume its non-login owner. It receives only exact
fixed-purpose function EXECUTE rights. Old016 unclassified save/consume function
access is removed from runtime; the restricted owner can call them internally.
Other secret models use an allowlisted writer that cannot insert Code/Refresh.
The existing native Session, reviewed Provider rotation and SQL replay/revocation
logic remain in use. No custom Token/PKCE/crypto primitive was introduced.

The ledger is FORCE-RLS. The owner is NOLOGIN/NOSUPERUSER/NOCREATEROLE/NOINHERIT/
NOBYPASSRLS and is not granted to runtime. Its schema CREATE grant exists only
inside the atomic migration while ownership is assigned and is revoked before
commit. A Grant ID-column UPDATE grant permits PostgreSQL row locking; an owner
UPDATE RLS policy WITH CHECK(false) prevents actual row updates. Definer
functions pin pg_catalog,pg_temp and qualify relations; PUBLIC execution is
revoked. Database superusers/DDL owners remain trusted, not an attack boundary
this candidate claims to defeat.

Internal changes cover save, find, verifySource, consume, Refresh inheritance,
destroy and revokeByGrantId. PersistentReadOnlyRuntime uses the authoritative
classification; it no longer infers custom origin from expiresWithSession.
Request-local native parent references are cleared on finish/close and cannot
carry into an independent request. Existing Provider-artifact handling for
Session/Grant remains distinct from classified secret-artifact writes.

## Pre-database validation

Application runtime remains Node24.22.1 / pnpm11.19.0 / oidc-provider9.12.2.
Windows Node26 is orchestration only.

| Validation | Observed result |
| --- | --- |
| Candidate TypeScript build/typecheck | PASS |
| Full apps/packages lint | PASS |
| R9 offline logic + migration-profile tests, Node24/Linux | 10 passed, 0 failed/skipped |
| R9 safe SQL reporter tests | 3 passed on host and separately on Node24/Linux |
| Existing + extended OCI/test-build contracts | 16 passed on host and separately on Node24/Linux |

Compilation used the retained test image with new source copied into its private
writable container layer, network none and no database credentials. Source
mounts were read-only. That build-tool process used the image's root default;
it is not represented as non-root runtime acceptance. The later database and
runtime probes explicitly ran UID1000. No dependency installation or external
package download was performed.

## One isolated database-constraint run

| Item | Direct observation |
| --- | --- |
| Source | `1fef1ad0198a1fae28f3c2901f3dc1646532aef2` |
| Run | `0269b0e08cdd` |
| Started / finished UTC | `2026-10-23T15:22:08.786Z` / `2026-10-23T15:22:22.130Z` |
| Monotonic duration | 13330 ms |
| Result | PASS, target actually executed |
| Private host evidence | `C:\Users\liulo\AppData\Local\Temp\wepuu-r9-Y5krrt` |

This stage used retained test image
`sha256:1d62d1e7f6646ddbd117505c77fd54f872d1fec20e73ab8c7ece9f2df8c544e2`,
with new database source/migrations and scripts mounted read-only. It is source-
overlay SQL acceptance, not a claim that the old image contains the new code.

The fixture creates a real, random LOGIN NOSUPERUSER/NOINHERIT runtime role with
membership only in wepuu_auth. It verifies session_user is that login and
current_user is wepuu_auth. Migration/fixture setup uses a separate administrator.
Privilege tests are not merely administrator-issued SET ROLE observations.

All fixed stages completed:

1. migration017 and exact16 ledger/hash check.
2. Runtime privileges/startup guard: direct DML, ledger deletion, owner SET ROLE,
   private primitive and old custom-save invocation all rejected.
3. Session/native modes and zero native receipts; duplicate registration and
   conflicting key-candidate classification rejected.
4. Mode immutability, destroy/re-register denial and concurrent same-ID issuance.
5. Custom Code atomic save, deleted-link denial, changed-Scope denial, failed
   custom write leaves no classification, one-use custom Code consumption.
6. Native consumed-parent requirement, duplicate successor denial, cross-resource
   Refresh denial, concurrent Code consumption and native rotation/inheritance.
7. Independent B revocation leaves A descendant present; replay revokes A with
   refresh_replay; exactly two expected Outbox records.
8. A separate016 database with an old unclassified row upgrades to017 without
   backfill; the row is denied and014 is absent. The retained old compiled
   Database startup-integrity method rejects017. No old service main ran.

The custom fail-closed result here covers the tested Code/classification/link
paths. It does not stand in for the separately pending full explicit-consent B
HTTP Refresh/transition suite or a production historical-artifact conversion.

## Single offline test-image build

New test layer uses the locally verified retained parent tag/ID, copies current
source, runs pnpm build with RUN network none and retains test CMD pnpm check.
There is no installer, migration command, service main or production image build.
The existing OCI validator gained an explicit test role; default Authorization
image user/CMD checks remain strict and are covered by regression tests.

| Item | Direct observation |
| --- | --- |
| Source/build revision | `eb5f5b573d958f40d08339ea9c2e8af8cb664c45` |
| Tag | `wepuu-r9-test:eb5f5b573d95-3acf89695fd0` |
| Immutable loaded image ID | `sha256:fafe5c617b708e2d7e83935bf6bdd9a0eeeb609ff055c80bf63dd3517e8bf4b4` |
| Identity type | OCI_INDEX, typed build metadata/IID/loaded descriptor agree |
| Started / finished UTC | `2026-10-23T15:25:32.588Z` / `2026-10-23T15:25:49.090Z` |
| Private build evidence | `C:\Users\liulo\AppData\Local\Temp\wepuu-r9-build-13yODW` |
| Runtime probe | Node24.22.1 LTS Krypton, UID1000, network none |
| Probe evidence | compiled classification reader/native writer present; packaged exact16 migrations, no014 |

The test image has a root default, not a production-service default. Actual test
execution and the probe explicitly override it to1000:1000. The probe never
constructed a database connection or started a service. No registry push,
rebuild or cleanup of old images/caches occurred. Full default pnpm check was
not run and the image is not certified as a general regression/release image.

## One complete multi-Site target

| Item | Direct observation |
| --- | --- |
| Source | `eb5f5b573d958f40d08339ea9c2e8af8cb664c45` |
| Run | `6f18de1a7008` |
| Started / finished UTC | `2026-10-23T15:26:14.422Z` / `2026-10-23T15:26:29.824Z` |
| Total / target duration | 15400 ms / 4483.345718 ms |
| Result | PASS; no skipped target, extra failure or diagnostic truncation |
| Private host evidence | `C:\Users\liulo\AppData\Local\Temp\wepuu-r9-iKLftd` |

The target used the new immutable image, with only the diagnostic test copy and
scripts mounted read-only (no application-source overlay). Original target
source hash after the reviewed migration-only change:

```text
82713c019efefb4375779aca903d5d7e99c3762965707079cc607336a22e069e
```

Diagnostic copy hash:

```text
6b6bea27b20125e89a8bf3d5a3331d4c481ab505f4db3b3c3787e5289315a298
```

All14 authorization callbacks contain Code, no OAuth error and no duplicate
critical parameters. In particular, operation12 A/native-offline, operation13
B/native-offline and operation14 A/native-offline passed. The complete unchanged
protocol sequence then passed native Refresh rotation, cross-resource denial,
independent B revocation, unaffected A lineage, consumed-token replay denial,
descendant denial, expected Grant reasons and exactly two Outbox events.

The four earlier Provider metadata-corruption failures are intentional assertions
from the target, not unexpected failures. Safe diagnostics carry their inherited
last-operation context, as already explained in R7. A PASS proves the repaired
target behavior, not a newly captured private branch from the historical R7 run.

## Isolation, data-flow and cleanup

Both database runs used fresh PostgreSQL containers/data volumes on verified
internal networks; PostgreSQL published no host ports. Test containers shared
their corresponding PostgreSQL network namespace, ran UID1000 with read-only
filesystem, dropped capabilities, no-new-privileges, bounded tmpfs, disabled
healthcheck and log-driver none. Target/outer bounds remained120/150 seconds.
No automatic retry occurred. Initial free space was above5GiB; all ending
samples were above2GiB (final6384107520 bytes). No compaction/prune was performed.

Independently verified stopped, all exit0:

```text
wepuu-r9-test-0269b0e08cdd
wepuu-r9-pg-0269b0e08cdd
wepuu-r9-test-6f18de1a7008
wepuu-r9-pg-6f18de1a7008
```

Corresponding internal networks and database volumes are retained, as are prior
evidence/resources. Temporary build/validation probe containers were removed or
verified stopped. The private directories contain synthetic connection secrets
and private build logs; they must not be uploaded or printed. Safe receipts were
read separately and source/image/callback/cleanup linkage checks passed.

Data-flow review: changed paths persist control-plane artifact classification,
bindings, receipts and lifecycle metadata only. No WordPress tool input/output,
content, passwords or Application Passwords enter the platform. Test accounts,
mail, sites and proofs are synthetic; no real OTP, Desktop credentials, OAuth,
WordPress, MCP or production host operation occurred.

## Remaining work and non-claims

- Full R5 database regression, explicit-consent A/B HTTP integration, default-main
  startup/transition, cross-image release identity, Hosted CI and production
  rollout are NOT_RUN here. No push, PR or merge occurred.
- Full-suite fixture compatibility remains to be reconciled before claiming a
  general pnpm check/test-image pass. Examples include older fifteen-migration
  assumptions in persistent-readonly.test.ts and the R8 characterization script
  whose assertions deliberately describe pre017 adapter behavior. These must be
  version-scoped or updated with preserved historical evidence, not silently
  counted as current regression passes. They were not executed as R9 tests.
- R9 adds no new cascading account/Grant FK. That structural property and
  retained tombstones do not prove full existing product deletion/privacy/
  retention compatibility; no purge scheduler or deletion acceptance is claimed.
- Full custom B Refresh/replay/rollback-floor behavior still needs its separately
  defined integration suite. Native lifecycle PASS does not replace it.
- The startup upgrade check rejects pre017 readers; it is not a full mixed-
  release rollout test. Safety rollback must retain017 guards, not restore
  consumed state or reopen direct DML. Historical production artifacts were not
  inspected, converted, revoked or reauthorized.

```text
P3E2SR4BR9_CLASSIFICATION_DESIGN_REVIEW_COMPLETE=True
P3E2SR4BR9_CLASSIFICATION_STORAGE_PASS=True
P3E2SR4BR9_RUNTIME_WRITE_RESTRICTIONS_PASS=True
P3E2SR4BR9_NATIVE_REFRESH_COMPATIBILITY_PASS=True
P3E2SR4BR9_CUSTOM_CODE_FAIL_CLOSED_PASS=True
P3E2SR4BR9_CUSTOM_PERSISTENT_FAIL_CLOSED_PASS=PARTIAL
P3E2SR4BR9_FOCUSED_MULTISITE_PASS=True
P3E2SR4BR9_APPLICATION_FIX_VALIDATED=True
P3E2SR4BR9_FULL_R5_REGRESSION_PASS=NOT_RUN
P3E2SR4B_CANDIDATE_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Application-fix validation is scoped to this record's tested classification,
writer and native-lifecycle target, not full persistent authorization acceptance.
These candidate flags do not revoke or revalidate the separately approved
existing single-Site internal read-only trial. Implementation stopped after
the planned targeted acceptance and this record; no further repair or retry ran.
