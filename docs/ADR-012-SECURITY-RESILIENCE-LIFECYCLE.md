# ADR-012: Security and resilience deletion lifecycle

## Status

Accepted for Phase 2.0.6 local qualification. It is not a production-retention
policy and does not authorize production deployment.

## Context

Phase 2.0.6 must prove that account, tenant, and site deletion cannot leave
usable sessions, grants, refresh families, OAuth artifacts, or revocation work
behind after a backup is restored. The control plane must also remain content
free and must not expose a public destructive HTTP endpoint.

## Decision

- `DataLifecycleService` is an internal service backed by the
  `platform.deletion_jobs` and `platform.deletion_tombstones` tables.
- The only scopes are `account`, `tenant`, and `site`. Account deletion refuses
  an active sole-owner membership; ownership must be transferred or the tenant
  must be deleted first.
- The first transaction immediately revokes sessions, grants, refresh
  families, and site trust and queues only content-free revocation events.
- Purging waits six minutes: five-minute access-token lifetime plus the
  sixty-second clock-skew allowance. Phase 2.0.7 will decide operational
  retention, RPO, and RTO values.
- The final report contains status, timestamps, failure category, and aggregate
  record counts only. Tombstones contain opaque record identifiers and no
  tokens, cookies, identity subjects, secret hashes, WordPress content, or MCP
  request/response bodies.
- A pre-deletion backup is not considered deleted after restore until the
  tombstone manifest is replayed. A post-deletion backup must already exclude
  the deleted objects.

## Alternatives rejected

- A public deletion endpoint was rejected because it would expand the destructive
  attack surface before an authenticated control-plane workflow exists.
- Immediate physical deletion was rejected because access-token lifetime and
  asynchronous revocation delivery require a bounded safety window.
- Storing token or upstream identity material in a tombstone was rejected because
  recovery evidence must remain non-secret and content-free.

## Consequences and rollback

The migration is additive and can be rolled back only before a deletion job is
accepted; an accepted deletion is monotonic and must not be undone by restoring
authorization state. Any failure leaves a failed job and safe error category for
operator review. Production retention and legal-hold behavior remain gated on
Phase 2.0.7.
