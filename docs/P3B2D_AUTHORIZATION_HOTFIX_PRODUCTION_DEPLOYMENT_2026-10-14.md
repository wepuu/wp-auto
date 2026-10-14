# P3-B2D Authorization hotfix production deployment — 2026-10-14

## Scope and outcome

The operator authorized publishing the existing verified Authorization archive,
a fresh project backup, Authorization-only deployment, read-only verification,
and Authorization-only rollback if necessary. Publication and deployment passed.
No production OAuth, Consent, code exchange, refresh or revocation was executed.
PRs #57, #58 and #59 remain open/Draft; none was merged. `design/` was not changed
or staged. Historical failed isolation evidence is preserved.

## Original artifact and publication

- Candidate PR: <https://github.com/wepuu/wp-auto/pull/59>, unchanged Head
  `4fbe9ca3d221f430ee039111ec513ef5f65c63cf`.
- Original successful CI: <https://github.com/wepuu/wp-auto/actions/runs/38484253873>.
- Image Artifact ID: `11858414458`; Manifest Artifact ID: `11858584416`.
  Both were unexpired at execution. The two downloaded manifests matched.
- Original build synthetic merge: `c960519c715473d91fbedd6055c004678097dc8a`.
  Its source tree matches the candidate tree
  `d2689e64ffed5e86a6994ec34576d48b3758f115`. It is not a formal merge commit.
- Production source baseline: `5fab3eadbf23ae72ffae6e984a24947a510f43ab`.
- Original archive SHA-256:
  `8f8688f32921b1be1ad97eed9a7848d06d8ba9ffdb388acf674c6456bf7a96b3`.
- Original Docker config/Image ID:
  `sha256:f429f59839cd07a5f350805a119b2a93b48e7f7e1e44da678cffb04004bbe0f1`.
- Authorization-only publication:
  <https://github.com/wepuu/wp-auto/actions/runs/38512849953> — success.
  The operation branch replaces the registered publication workflow with an
  original-archive-only job: no Docker build, Control push or batch publication.
  It checks archive identity and image boundary before pushing, then pulls by
  registry digest and verifies the original Image ID. The workflow is not merged.
- Unique tag: `p3b2d-hotfix-4fbe9ca-38484253873`.
- Published and deployed immutable reference:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742`.

The registry manifest digest is distinct from the archive SHA and config/Image
ID. VPS Docker `29.7.2` reports the manifest digest in `inspect .Id`; direct
registry manifest inspection confirmed its config digest is the original
`f429f598...e0f1`. This storage representation is not an artifact replacement.

## Migration and runtime compatibility

Image inspection used explicit `--entrypoint node`, no network, read-only root,
`cap-drop=ALL` and `no-new-privileges`; it did not run the default startup entry.
The image contains exactly migration files 001–013. Their individual hashes
match the verified baseline and the applied production migration hashes.
Canonical sorted `name:sha256` aggregate before and after:
`b4ada268cd5c3c3e639fcb7f63d014ab0be4ed01a0c27876224667819617fcc4`.
There is no migration 014 or Console resolver; the resource Grant loader is wired.

Entrypoint remains `docker-entrypoint.sh`, user `node`, and CMD remains
`sh -ec 'node packages/database/dist/cli.js migrate && exec node apps/authorization-service/dist/main.js'`.
The existing idempotent startup migration runner therefore ran with only already
applied 001–013 available; no new migration/schema change was applied. Issuer,
signing/cookie keys and all non-image runtime configuration remained unchanged.

## Fresh backup

- Directory: `/opt/wpauto/backups/pre-multisite-authorization/20261014T044635Z`.
- PostgreSQL custom-format dump: `postgres.dump`, 162735 bytes, root:root/0600.
- Dump SHA-256:
  `8b47cc5e0e0cd0c3e8ced191ca0ed3d3010c65cdf3f78e4bdd2999303ab0803d`.
- `pg_restore -l` passed; this is archive readability, not an actual restore test.
- Protected copies: `runtime.env`, `compose.yaml`, `deploy-service`, and
  `previous-rollback.image`; each root:root/0600. Directory mode 0700.
- All five entries passed `SHA256SUMS` verification. No backup contents or
  credentials were output. No database restore was performed.

## Deployment and rollback

Actual script: `/opt/wpauto/bin/deploy-service` (no `.sh` suffix).
Its SHA-256 matched the reviewed repository script:
`b1e8fc2a93d2c107a6198df776c4a2b7f54e05f6b219373501597e2dc049bcdc`.

The captured running image and runtime reference before deployment were both:
`ghcr.io/wepuu/wp-auto-authorization@sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`.
The pre-existing rollback file pointed to older `adb448...` and was not used as
the rollback baseline. The deployment script saved the captured `d637...` value
to `/opt/wpauto/rollback/authorization.image`; exact equality was verified.

Executed once:

```sh
/opt/wpauto/bin/deploy-service deploy authorization ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

UTC start `2026-10-14T04:48:08Z`, successful completion `04:48:15Z`.
Only Authorization was recreated. Deployment returned `WEPUU_DEPLOY_OK`.
The other six container IDs, start times and restart counts were unchanged.
Compose hash and the runtime hash excluding only the Authorization image entry
were unchanged. No DNS, Nginx, certificate, Connector or Control change occurred.

Rollback was not required or exercised. If separately needed, the reviewed
script's `rollback authorization` now targets the captured `d637...` image;
recheck that reference first. Database restore is not implicitly authorized.

## Read-only verification

- Seven services healthy, OOMKilled false, restart counts zero.
- Authorization local and public `/health/live` and `/health/ready` passed.
- Public Discovery issuer, issuer response support and S256 declaration passed;
  JWKS returned public RSA keys with valid key identifiers and no private fields.
- Both WordPress MCP HTTPS endpoints returned expected unauthenticated 401.
  This is reachability/challenge evidence, not an authenticated MCP test.
- Two Sites remain active, Connector Site bindings consistent.
- Codex Grant remains active, `mcp:read`, null revocation reason, original
  `updated_at=2026-10-12T12:03:49.698212+00:00`.
- Lifecycle Site A Grant digest prefix `623c362c435d` and Site B prefix
  `f1f54908e651` remain active with exact account/Tenant/Site/resource and
  `mcp:read` bindings. All three complete Grant row digests were unchanged.
- Both complete OAuth Client row digests were unchanged.
- Site A remains revocation v2, sequence 2, two Grant deny markers; Site B
  remains v2, sequence 0, zero markers. Full projected state summaries unchanged.
- All seven historical Outbox row metadata digests were unchanged. No event
  was deleted, edited, requeued or generated by an OAuth test.
- Database migration names and hashes remained exactly 001–013.

Pre-deployment six-sample resource evaluation allowed execution: minimum
MemAvailable 1281.633 MiB. Post-deployment minimum 1017.562 MiB, final
1032.461 MiB, disk available 15061 MiB. Both samples had healthy services,
zero new container/host OOM or restart deltas and no sustained severe pressure.
Host OOM total 174 was historical and did not increase. Swap in use remained a
warning, not an independent failure. These are bounded observations, not a
long-term capacity guarantee.

## Status and stopping point

```text
AUTHORIZATION_HOTFIX_PUBLISHED=True
AUTHORIZATION_HOTFIX_DEPLOYED=True
AUTHORIZATION_HOTFIX_HEALTH_PASS=True
AUTHORIZATION_MIGRATIONS_UNCHANGED=True
P3_CORE_OAUTH_MCP_PASS=True
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3B2_SITE_ISOLATION_PASS=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Stop after deployment verification. A future independently authorized two-Site
OAuth revalidation must precisely reuse the existing two active lifecycle Grants;
do not require live Grant count zero, delete Grants, copy Provider artifacts, or
clear browser cookies to avoid the resource-selection issue. Production behavior
of the fix remains unverified until that actual revalidation passes.
