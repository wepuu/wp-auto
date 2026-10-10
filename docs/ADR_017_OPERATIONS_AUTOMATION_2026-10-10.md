# ADR-017 operations automation validation: 2026-10-10

## Scope

This bounded change implements low-ceremony single-VPS operations after the
production OAuth and WordPress acceptance gates passed. It does not modify the
connector, rotate a signing key, invite general users or start Phase 2.0.7B2.

## Backup evidence

- The operator confirmed two separate removable-media copies of the encrypted
  locally generated PKCS#8 signing key and separate passphrase storage.
- The temporary workstation directory that contained both key and passphrase
  was deleted after all three transferred files matched the VPS source by
  SHA-256. Neither secret content, fingerprint nor destination is recorded.
- A new root-owned mode-0600 PostgreSQL custom-format backup was created at
  `/opt/wpauto/backups/wpauto-20261010-post-e2e.dump` after the production E2E
  gate. It restored with `--exit-on-error` into the isolated disposable
  database `wpauto_restore_20261010`; a non-empty schema dump succeeded, then
  the disposable database and container temporary files were deleted.

## Automation contract

- `check-health.sh` checks the three exact wpauto containers, disk thresholds,
  public policy/readiness endpoints, same-origin OIDC/OAuth metadata, public
  RSA/RS256-only JWKS, metrics isolation and 30-day origin certificate expiry.
- `backup-database.sh` creates a validated daily custom-format dump and
  checksum under exact protected directories. Retention is bounded to seven
  daily days and four weekly weeks.
- `deploy-service.sh` accepts only digest-pinned control or authorization
  images, updates only one runtime image entry, recreates only that service,
  and automatically restores the preceding digest on failed health.
- None of the scripts reads WordPress content, emits response bodies, runs a
  global Docker prune, stops the Compose project or touches unrelated sites.

## Data-flow review

The automation handles public protocol metadata, low-cardinality process
state, image references and confidential PostgreSQL backup files. It does not
receive, inspect, store or relay WordPress content, MCP tool input/output,
Bearer tokens, cookies, authorization codes, signing-key bytes or passphrases.

## Remaining boundary

The host-local database retention set is not an offline encrypted
disaster-recovery copy. General-release backup policy, legal/residency wording,
alert delivery and Phase 2.0.7B2 remain separately gated. Cloudflare Full
(strict) and the two-key-copy signing backup gates are complete.
