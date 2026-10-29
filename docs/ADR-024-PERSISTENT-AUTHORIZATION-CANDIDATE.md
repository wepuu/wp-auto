# ADR-024: persistent read-only authorization candidate

Status: proposed candidate; implementation and synthetic validation authorized, production rollout not authorized.

The control plane remains metadata-only. Signed WordPress Consent produces an active business Grant. A distinct, unchecked platform Consent choice may create a versioned persistent read-only receipt for one trusted Client and canonical resource. Form fields cannot supply account, Tenant, Site, Grant, Client or resource bindings. Current account membership and exact active binding are reloaded before approval. Ordinary authorization remains session-bound and creates no persistent receipt.

The immutable default policy is guard-only (A). Explicit-consent (B) permits new persistent receipts; both modes retain Code, original Provider Session, receipt, binding, scope, time and replay checks for existing artifacts. Unknown policy, receipt version, binding, schema or permission fails closed. A is the rollback floor while persistent artifacts exist. Stop B writers before claiming new persistent issuance has ended; reverting to an old binary without the guards is unsafe.

Migration 016 adds forced-RLS receipt/link tables, exact-scope/version/lifetime constraints and fixed-search-path SECURITY DEFINER operations. Linked artifact persistence and link creation share a transaction; Code consumption locks the bound Grant, receipt and original Session before the one-use transition. Refresh uses the existing reviewed Provider orchestration and replay revocation; no custom token, PKCE or signing algorithm is added. Receipt issue window is at most five minutes and durable authorization at most 90 days. Rotation cannot extend the original deadline. Concurrent clients sharing a Refresh Token may both fail closed under replay; availability or account switching is not guaranteed by these guards.

Source retains migration 014 for existing Console tests. The explicit `migrate-authorization` profile selects only 001–013, 015, 016 and checks exact packaged hashes/ledger. Authorization rejects a ledger containing 014 or unknown migrations. The old `migrate` command retains the full source migration behavior for separately scoped legacy tests. No service CMD runs either migrator. A separate privileged migration job applies the selected profile; runtime logins have no DDL/ledger-write/migrator privileges.

Node 24.22.1 LTS and pnpm 11.19.0 are fixed across candidate build/CI. Both service images start their own main directly. Packaging changes apply only when these candidate images are explicitly deployed; main merge does not deploy or authorize migration.

Consumed links and replay tombstones are retained for the existing family/receipt enforcement period. This candidate adds no automatic purge, does not delete live descendants, and does not certify a production retention scheduler. Expired records are denied regardless of their continued storage. Synthetic boundary, transaction, timeout, tenant, replay, image and startup tests must pass before a local-candidate verdict. Production migration backup/recovery, exact release transitions and real Desktop tests remain distinct gates.

No WordPress tool input/output, content, passwords or Application Passwords enter the platform. Test secrets stay in private local files/tmpfs and are excluded from artifacts. Failures preserve safe diagnostics; production rollback never restores consumed protocol state or disables security checks.

## R8 compatibility clarification and classification gate (2026-10-23)

The intended compatibility contract distinguishes ordinary authorization without
`offline_access`, the previously accepted native `offline_access`/Refresh flow,
and the new explicit persistent read-only receipt flow. The earlier statement
that ordinary authorization remains session-bound refers to the first category;
it does not authorize removing the accepted native Refresh lifecycle tests.
Guard-only closes new custom persistent issuance, not native issuance already
allowed by the reviewed Provider contract. This is an intended candidate
contract, not a claim that the current implementation meets it: R7 still fails
on the first native offline authorization.

Native offline authorization must not create a custom receipt. Custom artifacts
must not downgrade to native behavior because a link is absent, a scope changes,
or an `expiresWithSession` field is absent. Classification must remain consistent
through save, load, verification, consumption and Refresh rotation. Storage
errors, unknown versions and inconsistent classification fail closed.

R8 preparation found no dedicated protected authorization-mode discriminator in
the existing store contract. `partition_kind` expresses tenant placement, not
authorization mode; the generic base adapter can produce either placement.
`SecretArtifactCodec` authenticates the opaque-token lookup, not the payload.
An application-written JSON marker alone is not an integrity-protected or
immutable classification. The current runtime role also has general writes to
secret artifacts. A link-only read cannot distinguish native absence from a
missing custom link.

Accordingly no scope-only, partition-only or unchecked-marker bypass is
accepted. R8 stops before application changes, image build or database replay.
A follow-up design must specify versioned, authoritative classification,
write/transition restrictions, atomic link association, legacy/unknown behavior,
rotation inheritance and rollback compatibility. If that needs schema or role
changes, those require a separately approved candidate migration/permission
design; this ADR does not authorize migration017 or production execution.

## R9 isolated classification candidate (2026-10-23)

The operator approved local implementation of a dedicated classification ledger
and constrained writes in candidate017. This supersedes the R8 implementation
stop only for local source and isolated tests; it does not authorize production
migration, deployment, existing-Grant conversion or user OAuth.

The new authorization profile is 001–013 +015 +016 +017 (16 files, no014).
Original migration bytes remain unchanged. Startup verifies hashes and never
migrates. SESSION_BOUND, NATIVE_OFFLINE and PERSISTENT_READONLY are authoritative
ledger modes for Code/Refresh; scope, partition placement and missing links are
not mode authorities. Mode and binding are immutable. Delete retains a mode
tombstone and cannot permit re-registration. New custom artifacts register with
their links atomically; native Refresh requires a consumed, same-binding native
parent. Existing ambiguous/unclassified artifacts are denied, not backfilled.

wepuu_auth loses direct secret-artifact DML and old unclassified custom-save/code-
consume entrypoints. Fixed-purpose functions owned by a non-login, non-inheritable
role mediate writes. The owner cannot be assumed by runtime. Its Grant ID-column
UPDATE privilege is only for row locking; actual updates are denied by RLS WITH
CHECK. The ledger uses FORCE RLS and exposes only classification projections to
runtime. Definer functions pin a safe search_path, qualify relations and revoke
PUBLIC execution. Other secret models cannot use their writer to insert Code or
Refresh. Existing Provider and SQL replay/revocation orchestration remains in use.

Runtime and migration-owner compromise are different boundaries: database
superusers/DDL owners remain trusted and can remove these controls. This is not
cryptographic payload authentication. No new cryptographic/OAuth primitive is
introduced. No automatic tombstone purge or production retention acceptance is
claimed; no new cascading FK blocks existing deletion, but complete existing
deletion/retention compatibility still requires its own regression evidence.

Downgrade to a pre017 binary is not a supported safety rollback. A rollback floor
must retain017 readers/writers and guard-only custom issuance. No consumed state
is restored. Local compilation/tests and one bounded multi-Site run must establish
actual results; source implementation alone is not acceptance.
