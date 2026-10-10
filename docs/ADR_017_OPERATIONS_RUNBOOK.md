# ADR-017 single-VPS operations runbook

This runbook is for the bounded operator deployment at `auth.wpauto.cc`. It is
not a general-release policy and does not authorize connector changes or Phase
2.0.7B2. Checks must remain content-free: never copy tokens, cookies,
authorization codes, WordPress content, private keys or passphrases into a
terminal transcript, ticket or repository.

## Routine check

Run weekly and after a deployment:

1. Run `pnpm check:production:public`. It verifies readiness, same-origin OIDC
   and OAuth metadata, RSA/RS256 public-only JWKS, private metrics isolation and
   the four policy pages. It prints booleans only.
2. On the VPS, run `docker compose --env-file config/runtime.env ps` from
   `/opt/wpauto`. PostgreSQL, control and authorization must all be healthy.
3. Run `nginx -t`; do not reload if validation fails.
4. Inspect container restart counts and available disk. Investigate any
   unexpected restart. Warn at 80% disk use and act before 90%. Never run a
   broad Docker prune on this shared host; identify unused wpauto image digests
   and verify that no other container uses them before a separately approved
   removal.
5. Inspect the origin certificate without printing its private key. Escalate at
   30 days remaining and renew before 14 days.
6. Confirm the Cloudflare dashboard still uses **Full (strict)**. Public TLS
   success alone cannot prove this setting.

The installed content-free host probe is `/opt/wpauto/bin/check-health.sh`.
Its success, warning and failure lines contain only check names, restart counts
and disk percentage. It never prints response bodies, identifiers or request
data. The checked-in script is the authority; do not edit the VPS copy in
place.

## Secret file checks

Only inspect metadata. The keyring, encrypted PKCS#8 file and passphrase file
must be ordinary, non-symlink files owned by UID/GID 1000 with mode `0400`.
`config/runtime.env` must be an ordinary root-owned file with mode `0600`.
Never print, hash for publication, source, or copy these files during a routine
check. Both application services mount the same three signing files read-only.

## Database backup and restore drill

- Create a PostgreSQL custom-format dump in `/opt/wpauto/backups` with mode
  `0600`; record its date, size and SHA-256 in an operator-only inventory.
- At least monthly, restore the newest dump into a disposable database on an
  isolated host or isolated PostgreSQL instance. Verify migrations and
  content-free row-count invariants, then remove the disposable database.
- Do not place a dump in Git, an image layer, public object storage or command
  output. Treat it as confidential because it contains control metadata.
- Before restoring production, stop both application services, preserve the
  failed database and current dump, verify the selected dump checksum, restore,
  run migrations, then start authorization and control and repeat the public
  probe. Do not overwrite the only usable copy.

`/opt/wpauto/bin/backup-database.sh` creates a root-owned mode-0600 PostgreSQL
custom-format dump and checksum each day. Daily files older than seven days and
Sunday copies older than 28 days are removed only from the exact
`/opt/wpauto/backups/daily` and `/opt/wpauto/backups/weekly` directories. This
host-local copy is protected but not an offline disaster-recovery copy; copy
selected database backups to separately protected storage as appropriate.

## Signing-key backup and recovery

Before inviting general users, the operator must create two encrypted offline
copies of the current locally generated PKCS#8 key in two separately chosen
locations. Copy the already encrypted key without decrypting it. Store its
passphrase separately from each key copy and from the database dump. Do not use
old-computer files or credentials. Repository automation intentionally does
not choose destinations or move these secrets.

Recovery is fail-closed: restore the encrypted key, passphrase and non-secret
keyring to protected files; apply the required ownership and modes; run
`keys:inspect` in an isolated environment; and confirm the derived `kid` and
public JWK exactly match database metadata before either service starts. A
mismatch is not repaired by changing database metadata or disabling checks.

## Signing-key rotation

Rotation is a separate scheduled change, not a routine deployment:

1. Generate a new encrypted RSA-3072 key and separate passphrase offline.
2. Mount both current and next slots read-only in control and authorization.
3. Inspect and publish only the next public JWK.
4. Wait at least 20 real minutes, then atomically activate the next key. The old
   active key becomes retiring.
5. Verify new signatures and keep the old public key published for at least 20
   further minutes and for the maximum relevant token lifetime.
6. Retire the old key only after overlap validation. Remove its online private
   files after the services no longer reference them; retain required audit
   metadata and protected offline recovery material.

At every step there must be exactly one active key. Unknown, revoked or
mismatched keys fail closed. Do not delete or disable historical cloud KMS keys
as part of this runbook.

## Deployment and rollback

Deploy only immutable images pinned by digest. Save the current compose file,
runtime file metadata, image digests and dedicated vhost before changing them.
Recreate only the affected service, wait for its health check, then run the
public probe. Do not alter global Nginx configuration, unrelated vhosts,
networks or containers.

If validation fails, restore the preceding digest and dedicated vhost, run
`nginx -t`, recreate only the affected wpauto service, and verify public
readiness. Preserve PostgreSQL and signing material for investigation. The
connector's Application Password path remains independent.

The installed `/opt/wpauto/bin/deploy-service.sh` accepts only `control` or
`authorization` and an exact project GHCR `@sha256:` reference. It serializes
deployments, atomically changes only the corresponding image entry, recreates
only that service, checks loopback and public readiness, and restores the
previous digest if validation fails. Its `rollback` action uses only the
previous digest recorded outside the secret runtime file. It never runs a
global prune or Compose `down`.

## Minimal incident matrix

| Signal | Immediate action | Safe fallback |
| --- | --- | --- |
| Public probe fails, loopback healthy | Check Cloudflare and dedicated vhost; do not rotate secrets | Restore last known-good vhost |
| Application unhealthy | Keep failed logs private; inspect configuration names and file metadata | Roll back only the affected image |
| Disk at or above 90% | Stop nonessential wpauto test workloads and identify owners of large files | Do not run global prune on the shared host |
| Suspected signing-key disclosure | Stop issuance, preserve evidence, prepare a new key and revocation plan | Application Password access remains independent |
| Database loss or corruption | Stop application services and preserve the failed volume | Restore a verified dump without weakening checks |

Any suspected credential disclosure, tenant-boundary failure or WordPress
content entering the control plane is a release blocker and requires a new
validation record before service resumes.
