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

Hosted validation and artifact identity: PENDING until actual execution.
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

## Follow-up and states

See [E1C/E1D operation sheet](P3E1C_E1D_DEPLOYMENT_AND_RECOVERY_HANDOFF_2026-10-16.md).
It is not publication, deployment or recovery authority.

```text
P3E1B_PRODUCTION_BASELINE_VERIFIED=False
P3E1B_CONTROL_DIAGNOSTICS_HOTFIX_CANDIDATE_PASS=False
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

The first two flags require both the live image metadata and the executed
isolated gates; the live read alone is insufficient. Historical root cause and
new-site pairing stay unconfirmed/failed even if this candidate passes. No
production-proof or synthetic production diagnostic event was requested.
