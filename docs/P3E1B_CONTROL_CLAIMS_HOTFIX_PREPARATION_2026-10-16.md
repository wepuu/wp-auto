# P3-E1B: production-baseline Control claims diagnostic candidate

Date: 2026-10-16 (Asia/Shanghai). Candidate only. No registry push, deployment,
production DB/WordPress access, pairing, OAuth, email or clock operation.

## Baseline and production read-only confirmation

The only production command inspected a whitelist of container/image metadata:
image reference/ID, source Commit/Tree labels, User, CMD, Entrypoint, running and
health status. It did not inspect Env, secrets, DB, options, application logs or
WordPress. Control and Authorization were healthy and matched:

- Control: `ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe`.
- Authorization: `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.
- Control source label: `2b1474dd3b2d892df1f5d89e2fcafdde02884ff2`.
- Control Tree: `38bc13da5bf08b3d44f8d2ff4bba25961b2d9c9a`.
- Control User `node`, Entrypoint `[docker-entrypoint.sh]`, CMD
  `[node, apps/control-api/dist/main.js]`.

PR #70 Head `ecacb7999004a6e74ebb5163ff337de4a12b5508` has exactly that Tree.
The new branch starts there, not main and not pre-OTP `6345055`.
PR Base remains `codex/p3d3-control-hotfix-6345055`, confirmed at that Head.
Do not merge this production lane into main; #70 and #74 remain untouched.

Docker 29 on the VPS reports local image ID as the registry manifest digest.
This is not mistaken for historical config/Image ID
`sha256:5db506d0a488e24410796dbe9ec5577963dcca01121d2b46de46f95b3e1d235a`.
The isolated registry gate separately verifies the manifest config digest,
metadata, every retained source/lock file, and source Tree before building.

This read-only metadata check does not claim fresh production migration,
five-service, budget, Grant, Connector or Outbox verification. Those states
were not read in E1B. Existing production evidence is preserved; E1C must
reconfirm them under its separate authorization.

## Minimal backport and image boundaries

From reviewed #74 Head `ef6b185b243d09b4a149af78a26c87288655af02`, only proof
classification and Control event forwarding are backported. Runtime diff is
limited to pairing src/index and Control src/server; the third apps/packages
change is the internal-only HTTP regression. main.ts, UI, account-auth runtime,
quota implementation, dependencies, HMAC custody, migrations, Containerfile,
guard and Compose override remain byte-identical to the deployed source.
ADR-023 applies; no diagnostic endpoint or startup test event is added.

Public 400/invalid_request, audit proof_invalid, persistence, verifier order and
acceptance remain unchanged. The pinned before/after test now compares against
`ecacb799...`, not main. Unexpected errors remain fixed unknown. Diagnostic
details never contain claims/expected/actual, proofs, credentials or exceptions.

The mandatory real-signer tests use the frozen ZIP hash
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`, actual
Composer/Lcobucci dependencies and signer, in PHP 8.2.28 and 8.1.34. Archive and
fixtures are excluded from the build context. No Connector source is changed.
Only synthetic test secrets are generated; no real mail transport is used.

CI checks out the PR Head explicitly, records actual Commit/Tree plus workflow
event SHA, pulls only the existing fixed Authorization, and builds only Control.
Image source and compiled-file inventories must match the pulled baseline
outside the approved proof/Control module changes. No new runtime files or
Console/Handoff/014 are admitted. Migration bytes remain exactly 001–013 +015.
Control starts with its real direct default CMD on an isolated upgraded DB;
the entire migration ledger is compared before/after Control startup.

## Validation and artifact record

Local typecheck/lint and focused tests are run separately from Hosted CI.
Local PHP/Docker/database tests are NOT_RUN when their prerequisites are absent.
The known Windows PowerShell Security/Cert-drive HTTPS fixture failure is not
disabled, and local skip/failure is not represented as a pass.

Actual local results: typecheck/lint PASS; diagnostic/baseline parity 36 PASS;
source/OTP/migration boundary 3 PASS; extraction safety 3 PASS; targeted
pairing/Control 34 PASS, 0 FAIL, 1 existing DB-dependent SKIP. Final full check:
132 PASS, 1 existing Windows certificate-provider FAIL, 18 environment SKIP.
An initial local boundary fixture named a nonexistent database quota path; it
was corrected to the actual unchanged account-auth/otp-send-quota.ts and passed.

First Hosted run [38817877666](https://github.com/wepuu/wp-auto/actions/runs/38817877666)
at `94b328515db125502e34a8130d29f0b3b1dc4b74` passed strict checks, real signer,
PostgreSQL, guard and production baseline registry/config/source identity.
Candidate construction succeeded but the compiled-file boundary gate rejected
the changed server.test.js/map: the inherited tsconfig compiles src/**/*.ts,
including the approved HTTP regression. Local baseline/candidate inventory
comparison identified exactly those two omitted test artifacts; only those
explicit paths were added to the allowlist. No source, dependency, migration,
runtime validation or whole-directory comparison was loosened. Remaining gates
and artifact upload did NOT run on this failed attempt; its image is not approved.

Hosted validation and artifact identity: executed successfully below.
Mandatory gates include OTP rolling quota/DB faults/Better Auth HTTP/provider
mock tests, real signer, baseline identity, exact image boundary, actual Control
runtime/HMAC custody/send pause/unchanged ledger, fixed Authorization/JWKS,
Nginx guard, DB backup/restore/tombstone, audit/SBOM and retained conformance.

Artifact format is explicitly `docker-save gzip` (loadable image archive), not
a fabricated Registry Digest or a claim of OCI-layout tar encoding. Save the
original archive, SHA-256, manifest, baseline file hashes and SBOM as two Actions
artifacts retained 14 days. Remove only the CI candidate tag, reload the saved
archive and compare ID, metadata, migration hashes and all inventoried files.
`registryDigest` remains null. Record latest successful Run/Artifact IDs and
expiry separately; expired or changed bytes require a new reviewed candidate.

### Successful complete candidate execution

[Hosted run 38818479623](https://github.com/wepuu/wp-auto/actions/runs/38818479623)
succeeded at code Head `b315e3ddf1fbb75892dd8c954f5339183ba8e200`, source Tree
`8bf87e56ccb1816c6c14ccdf60f548f9dc7b73c4`.

- Strict: 154 PASS, 0 FAIL, 1 existing opt-in raw PHP SKIP; explicit raw PHP
  interoperability executed separately and passed.
- Real ZIP signer PHP 8.2.28 and 8.1.34: each 9 positive + 9 PEM mismatch
  rejections PASS; ZIP extraction safety 3 PASS.
- PostgreSQL: 22 PASS, 0 FAIL, 0 SKIP. Registry/config/source identity,
  candidate complete file inventory/approved compiled changes, migrations
  001–013 +015, non-root direct CMD and fixture exclusion: PASS.
- Real Control startup: migration ledger unchanged and actual send flag false.
  HMAC permission failures/valid custody, fixed Authorization/JWKS, guard,
  backup/restore/tombstone, audit and SBOM gates: PASS.
- Retained OAuth conformance: 37 PASS, 0 FAIL, 1 existing SKIP (not claimed as
  a pass). Secret-sentinel scan of the complete Hosted log: 0 matches.
- Saved archive reloaded successfully; Image ID, metadata and all inventoried
  files/migrations remained identical. Nothing was pushed to a registry.

This green code-run's original artifacts (historical precursor evidence):

| Identity | Value |
|---|---|
| Image artifact | 12011253125 |
| Independent manifest artifact | 12011313043 |
| Image ID/config digest | `sha256:eadd3b3e924a410e08b0dc08529cf25bf0f48afae81f4116b096ea27abdef8a5` |
| Archive SHA-256 | `b560941f73a4ad5aeb31170cdf70060c9ef65f7cd7cab49f4b0cebd2c99a3563` |
| Registry Digest | None; unpublished |
| Expiry | 2026-10-30 approximately 06:41 Asia/Shanghai |

Runtime Node v26.7.0, build pnpm 11.19.0 and unchanged digest-pinned Node
Containerfile/lockfile. Lockfile SHA-256:
`be0701f43ac3fb0e6f2b2837d293f9c145f069f1874750ef46419b7d2ab56f45`.
The workflow event was synthetic merge `7c45b292263ff1e25513b09a7548f41360e33b74`,
but it explicitly checked out and labeled the actual code Head above.

This documentation-only results update creates a new Head and must rerun CI.
The delivery artifact MUST be the latest successful Head's original archive,
not the precursor above. Final Head/Run, manifest, Artifact IDs, archive hash
and expiry are pinned in [Draft PR #75](https://github.com/wepuu/wp-auto/pull/75)
after the final run. Re-read that exact identity before a separately authorized
publication; never substitute or rebuild an approved artifact silently.

## Follow-up and states

See [E1C/E1D operation sheet](P3E1C_E1D_DEPLOYMENT_AND_RECOVERY_HANDOFF_2026-10-16.md).
It is not publication, deployment or recovery authority.

```text
P3E1B_PRODUCTION_BASELINE_VERIFIED=True
P3E1B_CONTROL_DIAGNOSTICS_HOTFIX_CANDIDATE_PASS=True
P3E1B_CONTROL_DIAGNOSTICS_DEPLOYED=False
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

The first two flags are supported by both live metadata and executed isolated
gates; the live read alone is insufficient. Latest-head CI is also required
before final artifact delivery. Historical root cause and
new-site pairing stay unconfirmed/failed even if this candidate passes. No
production-proof or synthetic production diagnostic event was requested.
