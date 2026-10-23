# P3-E2S-R4B-R10 isolated regression execution contract

## Scope and source

Operator authorized the R10 plan after R9 `7f61523921f792f4e27f9fb75ff8b5024011afc6`.
This candidate changes tests, fixtures and local artifact tooling only. Application
implementation and migrations 001–017 remain byte-identical to R9. No production,
Desktop, WordPress, real mail, external MCP, dependency update or deployment is allowed.

## Profiles and completion

- Candidate migration profile: 001–013,015,016,017; exactly16, no014.
- Existing historical pairing/OTP fixtures retain their explicit13/14-file no014
  profiles; these prove retained contracts, not a full current-profile check.
- Console014 runs only in a separately named disposable legacy database under
  the existing operator authorization. It is not applied to candidate services.
- `r10/profiles.mjs` closes the database file/count manifest; every database test
  must execute without skip or todo. New/missing files or top-level count changes fail.
- `r10/unit-manifest.json` freezes53 offline files. Database/PHP/Windows-only and
  two pre017 R7 opt-in cases remain explicitly deferred; full unit success does
  not turn those skips into integration passes. R9's SQL-dependent script remains
  its original bounded reproducer, not silently relabelled current DB coverage.
- R8 storage characterization retains its assertions under a non-default filename.
  Reproduce the original `.test.mjs` at546dc51447ff99c9b592f286c6888be0913e1683;
  current adapter/storage assertions are in R9 and current persistent DB tests.

Production-named unit test sources were separately reviewed after an initial
manifest write was denied: network/admin/process calls are injected mocks, actual
listeners are loopback-only, and imported CLI modules guard main execution. The
retry was allowed after that evidence. Offline test containers use network none,
no host ports, no Docker/SSH sockets or user credentials; child env is restricted.

## New checks and preserved limitations

017 fixture changes preserve existing protocol/security assertions, adapting only
migration selection and the now-required consumed native Code parent. Added custom
classification, payload/link downgrade, inactive binding and expired receipt
storage tests. HTTP matrix checks ordinary and custom modes, and custom Refresh
classification; existing explicit-consent, rotation, expiry, missing-link, PKCE,
resource, withdrawal, replay and protected Grant assertions stay in place.

A/B are modes of one same-source017 candidate. Stop all B writers before starting
A in transition. A does not mean restoring a pre017 executable. Startup fingerprints
include function definitions/ACLs and relation ACL/RLS metadata, and runtime role
tests include owner-role escalation and classified-storage direct DML denial.

Not all inactive-authority variants have distinct HTTP tests: those variants have
storage-level coverage and must not be represented as separate HTTP acceptance.
No external Outbox delivery, Connector or production old-binary rollback is tested.

## Artifacts and execution

Three explicit roles are derived offline from retained exact-ID parents. Reuse
requires matching dependency-input hashes; no install, pull or registry push.
Test builds and lints this source; runtime roles receive the identical apps/packages
tree, remain `USER node`, and keep direct main commands with no automatic migration.
All three compiled identity probes must match Node24.22.1/Krypton/UID1000.

Disk gates: at least5GiB before build/integration and2GiB thereafter. No automatic
cleanup. Build each role once. Formal run order: offline harness, full offline unit,
candidate/retained database regressions, separate Console, Authorization startup,
Control startup, A/B matrix, B-stop→A transition. First failure stops later stages;
no application fix or automatic rerun. Normal startup readiness polling is not a
second test attempt. Per-scenario deadlines and request budgets stay bounded.

Only fixed filenames and schemas are exported. Raw logs, exception bodies,
synthetic credentials/keys/tokens and private evidence stay private. Stop and verify
only run-owned containers; preserve labeled volumes/networks and evidence.

## Preliminary preparation evidence

34 host Node26 pure tooling/synthetic tests passed, no skips. This is orchestration
evidence, not application runtime or a full Node24 regression result. Actual build
and formal results will be recorded separately; no success is inferred here.

Candidate acceptance, full acceptance and readiness stay False regardless of a
successful local run, pending separate review/release gates. Historical internal
read-only trial authorization is neither revoked nor revalidated by this work.
