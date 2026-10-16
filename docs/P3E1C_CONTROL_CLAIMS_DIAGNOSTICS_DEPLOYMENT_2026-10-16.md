# P3-E1C Control Claims diagnostics production deployment

Date: 2026-10-16 (all execution times below are UTC).

## Scope and current outcome

The operator authorized original-artifact publication, fresh backup, and a
Control-only deployment. Publication, independent VPS image verification, fresh
production preflight, and isolated backup restoration passed. Deployment initially
paused for the operator's read-only check of the separately hosted WordPress
scene; that checkpoint is retained in commit `4506b6d`. The operator subsequently
confirmed the Connector was still active. After a fresh zero-drift preflight,
**Control-only deployment and the complete post-deployment checks passed**.

The diagnostic code is deployed, but the failed pairing has not been recovered.
No production Claims detail was generated or observed. No new Proof or pairing
operation was used to validate this deployment.

## Approved artifact and publication

| Item | Verified identity |
| --- | --- |
| Candidate | [Draft PR #75](https://github.com/wepuu/wp-auto/pull/75) |
| Source Head | `b1ebf130458a17d71527e365e617451ba8c6c484` |
| Source Tree | `ed593e352ddfc5eef8bceaef2d1964e5cc15655e` |
| Original successful CI | [38819055043](https://github.com/wepuu/wp-auto/actions/runs/38819055043) |
| Original image artifact | `12011958339` |
| Independent manifest artifact | `12012292228` |
| Original config digest / Image ID | `sha256:97f7836d672de53202a8f4334a4a01f6d179c0716e6a95a215bba387d75f3329` |
| Original docker-save gzip SHA-256 | `51db517fd3b2312102fb1e65a698438f4c02cd60a64360df2013af0d7d2c76e2` |
| Independent manifest file SHA-256 | `a46c6e2e4e069546d9a46f21f4f343e89814e40e60b4aa9b7d108b665ce89972` |
| Publication workflow source | `8b28d1dc11b0679373a533db1a15732fc1126a3f` |
| Successful publication | [38835382525](https://github.com/wepuu/wp-auto/actions/runs/38835382525) |
| Unique publication tag | `p3e1c-claims-b1ebf130-38819055043` |
| New immutable Registry reference | `ghcr.io/wepuu/wp-auto-control@sha256:8fccf8903a2a319864909b25a2516ecbb3e13ebe11d0198e85b18324ae21d87e` |

The publication workflow downloaded the two pinned original artifacts, checked
their expiry and independent manifests, verified the original archive hash,
loaded that archive, and pushed only Control. It did not rebuild an image, push
Authorization, or overwrite a stable tag. It then pulled the immutable Registry
reference and checked the original Image ID/config digest. The Registry digest,
config digest, and archive hash above are distinct identities.

Independent checks on the VPS also passed: Registry manifest config digest,
source labels, all retained file hashes, lockfile, migration inventory, `User=node`,
`Entrypoint=[docker-entrypoint.sh]`, and
`CMD=[node,apps/control-api/dist/main.js]`. The image inventory is exactly
001–013 plus 015, without 014. Verification used network-disabled, read-only,
capability-dropped one-shot Node processes with no production environment or
secrets. It did not invoke the image's service startup or migration command.

## Fresh production baseline

At 2026-10-16T01:20:58Z, all five relevant services were healthy with zero Docker
restarts and no OOMKilled state. The host historical OOM counter remained 174;
MemAvailable was 1,149,748 KiB, memory PSI full avg10 was 0, and short vmstat
samples showed no sustained serious swapping. These are instantaneous evidence,
not permission to reuse a stale resource sample for deployment.

Pre-deployment Control (now the verified rollback target):

```text
ghcr.io/wepuu/wp-auto-control@sha256:7c7308a6064740f9f732d2fb12a8f4c4c9dd3fd284edd26cea09df79b976c8fe
```

Unchanged Authorization:

```text
ghcr.io/wepuu/wp-auto-authorization@sha256:e4c3f43f57f62098c43aa56d65699bed4ae8ac6d1a9e4c147470f19dbfc49742
```

Read-only checks confirmed:

- Migrations are exactly 001–013 plus 015, with no 014. Hashes were captured.
- The replacement Site A and its replacement Codex Grant remain active; the
  original historical Grants remain revoked. The current Grant hash prefix is
  `a290a8dc95c3`, updated at `2026-10-14T15:06:19.849847Z`, with no revocation reason.
- Site A Connector remains active, v2, sequence 0. Connection and revocation-state
  hashes were recorded through a read-only transaction without loading plugins.
- There are no undelivered events for the active Site. Site B remains revoked;
  its two events remain delivered. Historical failed events were not edited.
- Full-row comparison hashes were captured for five Sites, eleven Grants,
  twelve Outbox rows, seven pairing attempts, and one OTP reservation. Raw rows,
  full identity values, and authentication artifacts are not in this document.
- The new `www.wepuu.com` resource has no platform Site or Grant. Its existing
  pairing attempt remains failed/verification_failed. No fresh Proof was fetched.
- Persisted and actual OTP sending switches are false; quotas remain 3/hour,
  6/day per recipient and 100/day globally. Budget at sampling was 99; the one
  historical accepted reservation remains. Process send counters were all zero.
- The HMAC file's custody, protected bytes, and read-only mount matched the
  existing protected baseline without logging the key or a public key hash.
- Empty POST probes through origin and public ingress returned send=503,
  resend=503, raw Better Auth send endpoint=404; no email address was supplied.

The operator's fresh read-only check confirmed the separately hosted new
WordPress Connector still displayed active. This is operator-attested local
state, not a new assistant-side inspection of WordPress Options or identity keys.
The platform's failed attempt/no-Site/no-Grant state was independently checked
before and after deployment; its full-row hashes did not change.

## Fresh backup and isolated restoration

Protected server backup directory:

```text
/opt/wpauto/backups/p3e1c/20261016T012328Z-QmANC0
```

The directory is root-owned 0700 and backup files are 0600. It contains the
PostgreSQL custom-format dump, migration baseline, configuration/Compose/override,
guard/vhost configuration, deployment script, current and previous rollback
references, protected key copy, and protected verification evidence. No backup
contents or secrets are committed here.

Database dump SHA-256:

```text
780cddefc54feae34ad842fb824b940d4db8a64b66b7a418b37a76f138b014e6
```

`pg_restore -l`, file permissions, and backup SHA-256 checks passed. A disposable,
network-disabled PostgreSQL container with 256 MiB cap restored the dump with
`--exit-on-error --single-transaction --no-owner --no-privileges`, using isolated
placeholder NOLOGIN roles. Counts matched: 14 migrations, 5 Sites, 11 Grants,
12 Outbox rows, 7 pairing attempts, 1 OTP reservation. This verifies data restore
readability, **not complete production role/ownership reconstruction**. The
label-verified temporary restore container, volume, and synthetic password were
cleaned; production PostgreSQL was never a restore target.

## Deployment and rollback safety

Actual script inspected: `/opt/wpauto/bin/deploy-service` (no `.sh` suffix).
SHA-256: `b1e8fc2a93d2c107a6198df776c4a2b7f54e05f6b219373501597e2dc049bcdc`.

Before deployment, the rollback file referenced older `3a4eed...`; that reference
was backed up and was **not used as a rollback target**. The captured running
`7c7308...` is the authorized rollback target. At 03:01:21Z, a fresh preflight
matched the protected baseline: all container identities, all protected database
row hashes, Connector state, configuration hashes, HMAC metadata, rollback
reference and historical OOM count were unchanged. MemAvailable was 1,094,408
KiB and memory PSI full avg10 was 0.

The deployment used the existing direct-start override and explicit
`COMPOSE_FILE=/opt/wpauto/compose.yaml:/opt/wpauto/config/p3d-control.override.yaml`.
`deploy-service deploy control` used the new immutable `8fccf890...` reference,
wrote the then-current `7c7308...` as rollback, changed only the Control image
variable, and recreated Control with `--no-deps`. At 03:01:32Z it returned exit
code 0. Its stdout/stderr remain in restricted backup files and were not dumped
into this record. No automatic or manual rollback was needed.

Actual new Control container ID:
`0bf7724136435a66e24cdcd9a9ec96dbee15170a0f5da4996627db16fceafcc2`.
Its start time is `2026-10-16T03:01:26.519027547Z`.

## Post-deployment verification

The complete read-only postcheck passed at 03:02:17Z:

| Check | Result |
| --- | --- |
| Running Control reference, original config digest, source Head/Tree and direct command | PASS |
| Rollback reference exactly equals captured `7c7308...` | PASS |
| Five containers healthy, zero Docker restarts/OOMKilled | PASS |
| Other four container IDs, images, start times and restart counts unchanged | PASS |
| Local and public live/ready, existing `/app` login entry, Site A HTTPS | PASS |
| OIDC and OAuth Discovery issuer, public RS256 JWKS with no private members | PASS |
| Full Site/Grant/Outbox/pairing/reservation row hashes unchanged | PASS |
| Current replacement Codex Grant and Site A Connector active/v2/sequence 0 unchanged | PASS |
| Migration records/hashes unchanged: 001–013 plus 015, no 014 | PASS |
| Actual and persisted send switch false, quotas and HMAC unchanged | PASS |
| Origin/public send and resend 503, raw Better Auth send 404 | PASS |
| Budget remains 99; reservation and all send/result counters unchanged | PASS |
| Compose, override, guard, vhost and deploy-script hashes unchanged | PASS |
| Runtime file byte comparison: only the Control image reference changed | PASS |
| New WordPress failed pairing and absence of platform binding unchanged | PASS (platform); local active operator-attested |
| Site B project containers, labelled volumes/networks and project directory absent; port 3201 free | PASS |
| New production Claims detail | NOT_OBSERVED; deliberately not generated |

Host OOM counter remained 174; MemAvailable was 1,070,916 KiB and memory PSI full
avg10 was 0.08. No serious sustained swapping or unexpected restart was observed.
All detailed sanitized comparison evidence is in restricted `postcheck.json` in
the backup directory. The diagnostic sink's runtime availability is established
by original-artifact identity and the already-executed isolated sink tests, not
by injecting a production error. No Nginx reload, service other than Control
recreate, database migration, Proof request, email, OAuth, or WordPress operation
was performed.

## Boundaries and state

The publication workflow is isolated on its own branch, not proposed as a main
runtime change here. This record-only Draft PR does not merge #70, #74, #75,
or any other PR. User dirty files and `design/` were not edited or staged.

No historical pairing root cause is confirmed. E1D local recovery/re-pairing
requires separate authorization; normal local Disconnect deletes Site Identity
and is not a lossless diagnostic step. Do not reset the scene for this deployment.

```text
P3E1C_ORIGINAL_CONTROL_ARTIFACT_PUBLISHED=True
P3E1C_CONTROL_DIAGNOSTICS_DEPLOYED=True
P3E1C_PRODUCTION_HEALTH_PASS=True
P3E1C_PRODUCTION_CLAIMS_DETAIL_OBSERVED=False
P3E1_HISTORICAL_PROOF_ROOT_CAUSE_CONFIRMED=False
P3E1_NEW_SITE_PLATFORM_PAIRING_PASS=False
P3D_REAL_EMAIL_ACCEPTANCE_PASS=True
P3D_EMAIL_SEND_PAUSED=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The production diagnostics deployment is complete. E1D still requires fresh
read-only reconciliation that this resource has no platform Site/Grant and a
separate explicit authorization for any WordPress local reset and one new pairing.
Retain protected local backups and failed attempt history; do not use SQL/Options
edits, copy Site Identity, or automatically retry Connect. Local Disconnect
deletes identity, so the operator must approve that identity transition separately.
