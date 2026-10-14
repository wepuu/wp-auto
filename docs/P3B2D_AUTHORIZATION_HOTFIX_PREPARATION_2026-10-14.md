# P3-B2D: unpublished production-baseline Authorization hotfix candidate

## PR integration recommendation (no merges performed)

#57 remains Draft at `abe59a1668fd1ed6ee0334adbd37b736cebb8419`, CI
`38420064117` success. Its four files are the isolated acceptance scripts/tests
and Site B pairing/failed authorization records.
#58 remains Draft at `ebcabc005f7ab5188cbb0b34ba723cb71fe8be9c`, CI
`38429726552` success. Its ten files are runtime repair, tests, test-only jose
declaration/lockfile, ADR-021 and local diagnosis evidence. The file sets do not
overlap. Both target main and are mergeable. This candidate does not contain
#57's scripts or rewrite historical failures.

After separate merge approval: integrate #57 with normal merge commit, await
main CI, merge latest main into #58, verify its runtime diff remains unchanged,
rerun CI and review, then integrate #58 with normal merge commit and main CI.
Do not drop failed production evidence or promote local proof to production PASS.

## Actual production read-only baseline

- Running Authorization reference, image ID and RepoDigest:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
- Three running source-file SHA-256 values match source commit
  `5fab3eadbf23ae72ffae6e984a24947a510f43ab` (PR #39 hotfix Head):
  server `e0c9b9843f7d7f574a6b07ca0b8f9aa31792b8c4f64d382e01341bd7e0841e16`;
  provider `c6cd042bc2a58ab27ef4ec8bf4c4e8011cc7b3e6d28f7e2ed0f586f1875dc325`;
  database `afcfc1580d2138f3a9786f972bea3fc3e0876e08c3dea3a47695d1c5c7d697be`.
  Runtime lockfile also matches that commit:
  `be0701f43ac3fb0e6f2b2837d293f9c145f069f1874750ef46419b7d2ab56f45`.
- Image has no source revision label. Shared runtime release revision is
  `00f506961d5699e1c4766e9a46101fa441701251`, not Authorization source identity;
  it was not used to infer the actual binary/source baseline.
- Entrypoint: `docker-entrypoint.sh`; CMD:
  `sh -ec 'node packages/database/dist/cli.js migrate && exec node apps/authorization-service/dist/main.js'`.
  Image and database both contain exactly migrations 001-013.
- Compose project `wpauto`, directory `/opt/wpauto`, file `/opt/wpauto/compose.yaml`
  SHA-256 `98b06b187c0dde90b0a40e3939f4442b3133086944b5d8a48b3864174601a941`.
  Runtime configuration is `/opt/wpauto/config/runtime.env`. Only public image/
  revision fields and variable names were read; secrets were not printed.
- Issuer remains `https://auth.wpauto.cc`. Control remains fixed at
  `sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`.
- Seven services healthy, no OOM flags or restarts. Resource sample allowed test
  stage; minimum/latest available RAM 933.027 MiB, no sustained pressure failure.
  Occupied swap and historical OOM count remain warnings.
- Two active Sites; A/B Connector IDs match platform rows. A sequence 2 with
  two deny markers, B sequence 0 with none. Original Codex Grant active with
  unchanged `2026-10-12T12:03:49.698212+00:00`, null revocation reason.
- Two active lifecycle Grants: A digest `623c362c435d`, B `f1f54908e651`, each
  exactly mcp:read and its own resource. A's Provider Grant exists; B's does not.
  No payload, token or Session was read. B should obtain its own Provider Grant
  through normal Consent after deployment, not through artifact copying.

## Minimal hotfix and image evidence

This branch starts at the verified `5fab3ead` runtime baseline, not main. Runtime
changes are only Authorization handler/diagnostics, official resource-bound
Provider hook and one-line fail-closed ambiguous resolver handling. Control,
historical migrations 001-013, Containerfile and runtime dependency versions
are unchanged. No 014, P4-A console code or later client-provisioning CLI is
backported. Tests use signed GrantService Consent; only synthetic Client/Site
fixtures are seeded in the isolated database.

The CI-only image gate runs with explicit node entrypoint, no network,
read-only filesystem and dropped capabilities. It compares all thirteen
in-image migration hashes with the production baseline commit, verifies exact
CMD/entrypoint/non-root user, absence of console resolver code and presence of
the wired resource hook. It never runs default CMD for inspection.
Existing real HTTP/PostgreSQL tests exercise A-B-A, active Grant reuse, missing
B Provider artifact, independent/interleaved Sessions, Code/Refresh target
rejection and isolated rotation/Replay/RFC7009 reasons/outbox.

After all normal Linux/OCI/audit/SBOM/conformance gates pass, CI saves an image
archive and a manifest as seven-day GitHub artifacts. Workflow permissions are
contents:read only; no GHCR login/push or publish workflow is invoked. The
manifest records build source commit, production baseline, image ID and
migration hashes; archive SHA-256 is separate. Neither an image ID nor an
archive hash is called a registry digest. A registry digest can only be fixed
after a separately authorized publication. Local Docker is unavailable;
actual candidate identity/results are obtained from the exact CI artifact.

## Future deployment and rollback authorization

The existing executable is `/opt/wpauto/bin/deploy-service`, not the previously
proposed `.sh` path. It is root:root 0700 and matches the repository script:
`b1e8fc2a93d2c107a6198df776c4a2b7f54e05f6b219373501597e2dc049bcdc`.
The stored old rollback record points to `adb448...`; it is not the rollback
target for this future operation. Deployment must first capture the actual
current `d637683...` reference into its bounded rollback record.

Next minimum authorization: publish the exact validated Authorization candidate
only, record immutable registry digest; fresh PostgreSQL/config backup with
checksum and restore-list checks; recheck resource/service/Grant baselines;
deploy only Authorization using the verified executable and fixed digest;
check actual digest, readiness, Discovery/JWKS, both registered Clients, seven
services and migrations 001-013. No Control/Connector/ingress changes.
On failed health, restore only Authorization to the captured current
`d637683...` image and original reference; no full database rollback.

Do not execute a command containing a placeholder/unpublished digest. Do not
blindly use the stale rollback file or nonexistent `.sh` executable. Deployment
approval does not include OAuth reacceptance: after health passes, request
separate approval for two formal Consent/PKCE transactions reusing the exact
active lifecycle Grants, then the original six-step isolation matrix with
minimum Token lifetimes and protected Codex/Connector/Outbox postchecks.
No zero-live-Grant requirement, automatic revocation, cookie clearing, artifact
copying, cleanup or retry is allowed.

```text
LOCAL_MULTI_SITE_GRANT_MECHANISM_CONFIRMED=True
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3B2_SITE_ISOLATION_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
```

This record describes preparation only. Candidate build identity and exact CI
conclusion are reported on its Draft PR; publication and production deployment
remain unexecuted. `design/` is untouched and untracked.
