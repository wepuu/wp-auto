# P3-D3: Control-only baseline hotfix candidate

Date: 2026-10-15. No production access, restart, migration, email, registry push
or public registration was performed. This is not P3-D4 authorization.

## GitHub integration

PR #68 (one historical assessment file) merged normally as
6674ea6c82b007563d7ccd7c338fa3352867eb67; main CI 38697310010 succeeded.
PR #69 was updated by normal merge from that main, Head
1abf6741314a2f0c6b2f36cf042537461f80674c, CI 38697669269 succeeded.
Its intended 15-file scope remained unchanged. It merged normally as
e8778da33d850303d1ccbdfbebf088610bf6ac5f; final main CI 38698209507 succeeded.
No force push or primary-workspace edits were used. design/ remains untouched.

## Baseline and identity gates

Candidate starts at the retained PR #44 production Control source
6345055ce213a822e24469f14cd128b650316685, not main. Historical deployment
records identify Control registry digest
ghcr.io/wepuu/wp-auto-control@sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f.
Authorization must remain
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742.
These are recorded identities, not a live VPS confirmation in this task.

Anonymous local registry inspection was unavailable. CI uses read-only packages
permission to pull the recorded Control digest and compare every retained
apps/packages source file plus root lock/build manifests to the baseline Git
bytes, before building anything. A failure blocks candidate construction.
The baseline evidence file contains hashes only. P3-D4 must still recheck the
actual running reference/configuration and stop if it differs.

Runtime changes backport only P3-D1 from #69. No Console Session/Handoff,
014, resource-bound Authorization runtime fix, or D2 test is backported.
Existing baseline pairing diagnostics and Tenant guard are preserved.
No runtime dependency version or old migration changed. Authorization is pulled
at the fixed production digest for isolated OCI compatibility, never rebuilt
or republished. Candidate Control CMD is direct node runtime, not migrate.

## Migration and isolation validation

The fixed-purpose p3d-migration-cli accepts only `apply-p3d-015`, with
WEPUU_P3D_MIGRATION_APPROVED=true and an explicitly provided database URL.
It accepts no arbitrary SQL/file/target. It checks exact filenames and SHA-256,
all existing migration rows, 014 absence, and shares the existing migration
transaction advisory lock. Schema creation and normal migration-history insertion
commit together. Existing exact 015 is a no-op; all unexpected states fail closed.

Tests cover 001–013 upgrade, repeat/concurrent invocation, changed SQL, unknown
history/014, checksum mismatch, lock timeout and deferred commit failure. OTP
rolling quota, real Better Auth handler and SDK mock-fetch tests are reused.
OCI runs the selective CLI on an isolated 001–013 database, boots fixed
Authorization and the real non-root Control default CMD against 001–013+015,
and checks HMAC owner/permissions failure plus valid 0600 access. It uses only
synthetic secrets, paused sends and a fake Resend key; no real email call.
The Nginx rollback fixture checks normalized/encoded send paths and confirms
verify/login/app/OAuth paths remain routed. New CI tests must execute, not skip.

First candidate CI 38698454047 proved the baseline source identity and image
boundary, strict checks (114 passed, zero failed, one skipped), PostgreSQL
(22 passed, zero skipped) and real Nginx guard. The subsequent actual Control
startup check failed; the fixture lacked the baseline's mandatory Grant
idempotency key. A synthetic random key was added without changing runtime
validation. Failure remains evidence, not a production outage or acceptance.
Local typecheck/lint pass; full local check has the already reproduced Windows
certificate-provider HTTPS fixture failure. No TLS check was disabled and
local database skips are not claimed as passes.
Full CI [38698932953](https://github.com/wepuu/wp-auto/actions/runs/38698932953)
passed at branch Head 4d7d648df1d78a811f12a2db18561c7f5a54a185: strict 114
passed/0 failed/1 skipped; PostgreSQL 22 passed/0 failed/0 skipped; real Nginx,
baseline identity, image boundary, actual Control runtime, non-root HMAC,
fixed Authorization signing/JWKS, backup/restore, dependency audit, SBOM and
retained OAuth conformance all passed. Local totals are 92 passed, 1 known
Windows certificate-provider failure, 18 environment skips.

Recorded green precursor artifact (not a Registry Digest):

- Image artifact 11954708880; manifest artifact 11954563991; retention 7 days.
- CI synthetic merge/source commit ad59f626382cfcb8993e9265aad04d0d7984007c.
- Source tree 106bc9db93ca109dea53d008eb3f58a17e91b5af.
- Image ID sha256:780cf451e5ab7d1a930ee11c737db7290d7705e57a05b34803d5871828c43723.
- Archive SHA-256 582c37207a78a6b61d2a3dc380ec37568db11ee7c23477f0f6113bd8edd4d64f.

This documentation-only evidence update also reruns CI. The final delivery
must use the final successful PR Head's original artifact and manifest recorded
in the PR, not silently substitute the precursor or rebuild an expired artifact.
Final log review found expected synthetic commit-fault text in the PostgreSQL
service's own logs, despite sanitized application errors. The isolated CI
database now suppresses error-message/statement logging before fault injection;
the actual error, rollback and fail-closed assertions still execute unchanged.
This is test-server logging only, not a production database configuration change.
The final CI log must be checked for synthetic secret sentinels before delivery.
The artifact contains baseline.json, manifest.json, archive and SHA-256;
manifest fixes source Commit/Tree, Image ID, commands/user and migration hashes.
CI may use a synthetic merge commit: record it and its exact source tree rather
than claiming it is the formal branch Head. No Registry Digest exists for this
unpublished candidate. Never rebuild silently if the approved artifact expires.

## P3-D4 separately authorized procedure

1. Verify actual production image/config/source evidence, five healthy services,
   migrations 001–013, current replacement Codex Grant, Connector and historical
   Outbox baseline. Do not use the revoked original Codex Grant as a baseline.
2. Verify/download original CI archive and manifest, load and publish only that
   Control image, capture Registry Digest, pull and compare config/Image ID.
   No production write occurs if publication/identity validation fails.
3. Create UTC PostgreSQL custom-format and configuration backups, root-owned
   0700 directory/0600 files, SHA-256, pg_restore -l and isolated restore check.
   Backup is not permission to restore the production database.
4. Generate one stable 32-byte random key encoded as canonical unpadded base64url.
   Match actual container UID (expected node UID 1000, verified rather than
   assumed), file 0400/0600, no group/other permissions, no symlink, read-only
   bind. Keep a separate root-owned protected backup. Root:root 0600 mounted
   directly is INVALID for this non-root loader. Never print the key/hash.
5. Back up ingress and enable the exact p3d-otp-send-deny.conf safety guard
   inside auth's HTTPS server BEFORE migration/deploy. nginx -t then normal
   reload; verify send/resend 503, raw /api/auth/ 404, verify/session unaffected.
   No unrelated route/vhost is changed. P3-D4 must explicitly authorize this
   temporary ingress change. Keep the guard throughout this no-email rollout.
6. Run the fixed selective migration CLI with explicit node entrypoint, protected
   migration credentials, read-only filesystem, no-new-privileges/cap-drop,
   existing internal network and bounded timeout. Do not run generic migrate.
7. Check exact ledger 001–013+015, all hashes, table permissions, no 014.
8. Apply only the control stanza from p3d-control.override.yaml, with sends
   explicitly false. Do not copy repository Compose over production. The override
   must be included in the deployment AND automatic/manual rollback compose
   invocation, e.g. explicit COMPOSE_FILE=<base>:<reviewed-override>. Verify the
   actual deployed /opt/wpauto/bin/deploy-service path/hash and its behavior;
   do not assume the repository .sh filename is the deployed executable.
9. Capture actual old Control digest for rollback, verify rollback file equality,
   and deploy only Control at the new Registry Digest. Do not recreate any other
   service or change signing keys, Session secrets, issuer or OAuth metadata.
10. Verify health/live, health/ready, protected metrics from DB, startup permissions,
    fixed Authorization/Discovery/JWKS, Site A and five-service health, images,
    no new OOM/restarts, unchanged Grant/Connector/Outbox snapshots. Do not
    exhaust production quota with fake sends to test it.
11. Leave sends paused AND ingress guard enabled. Separately authorize genuine
    mail/onboarding acceptance, protection removal and subsequent opening.
    SEND_ENABLED is read at startup; changing it requires a controlled Control
    recreate, not a fictional live toggle. No invitations/allowlist is added.

## Failure / rollback

Before the first deployment the ingress guard is already active, so the existing
deploy script's automatic rollback cannot expose the old unlimited sender.
Keep it active if migration, deployment or health checks fail; rollback only
Control to the captured reference, preserving direct runtime entrypoint and all
other services. Explicitly probe both send routes after rollback. Setting the
new env flag false is NOT protection in the old image, which ignores it.
If the guard cannot be proven active, stop the release. Do not claim rollback
safe. Keep the additive table, charges, HMAC key, migrations and backups; do not
drop objects, restore the database or reset quota. A future rollout that removes
the ingress guard must separately implement/test guard reactivation before any
rollback; this no-email release does not authorize that removal.

## State

```text
P3D_EMAIL_OTP_PROTECTION_CANDIDATE_PASS=True
P3D_TENANT_OAUTH_ISOLATION_CI_PASS=True
P3D3_CONTROL_BASELINE_VERIFIED=True
P3D3_CONTROL_HOTFIX_CANDIDATE_PASS=True
P3D_PRODUCTION_DEPLOYED=False
P3D_REAL_EMAIL_ACCEPTANCE_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Baseline/candidate flags reflect the executed gates above; #69 alone does not
prove this distinct backport. Published final latest-head results and
artifact identity are recorded in the candidate PR conversation/body. Stop
after preparation; no GHCR push, VPS connection or P3-D4 operation here.
