# P3-C2B: Site B Temporary Resource Cleanup

Date: 2026-10-15 (Asia/Shanghai). Production backup and cleanup command
timestamps are recorded in UTC below.

## Result

The temporary Site B compute and storage resources were removed after a
verified backup. The platform's historical Site B records were preserved.
The dedicated DNS record, Nginx virtual host, and TLS certificate were not
removed because the hostname resolves through Cloudflare Anycast and the exact
DNS record or wildcard ownership could not be proven. Removing the virtual
host while that route remains could allow default-vhost routing, so the
explicit Site B vhost remains as a fail-closed retired endpoint.

```text
P3C2B_SITE_B_CONTAINERS_REMOVED=True
P3C2B_SITE_B_VOLUMES_REMOVED=True
P3C2B_SITE_B_NETWORK_REMOVED=True
P3C2B_SITE_B_FILES_REMOVED=True
P3C2B_SITE_B_PORT_RELEASED=True
P3C2B_PLATFORM_HISTORY_PRESERVED=True
P3C2B_DNS_RETIRED=False
P3C2B_INGRESS_CERT_RETIRED=False
P3C2B_SITE_B_CLEANUP_COMPLETE=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

P3-B2 same-Tenant Site/resource/Grant isolation and P3-B3 Application Password
results remain historical passes. This cleanup did not run OAuth, change Grants,
or alter the prior acceptance results. Independent Tenant isolation,
revocation-propagation isolation, full acceptance, and public-registration
readiness remain unproven/false.

## GitHub integration

- PR #64 merged normally as `5e818c2ecf77910f3507104ab507240f4a2cb14d`.
  Its main CI run `38647217155` succeeded.
- PR #65 merged normally as `657bc38f0ee99ac717746ae2e7817b905f416ec7`.
  Its main CI run `38647546370` succeeded.
- Resulting main: `657bc38f0ee99ac717746ae2e7817b905f416ec7`.
- The #64 document remains a historical snapshot. The later #65 record
  documents subsequent Site A recovery and Site B Disconnect; neither
  rewrites the other.
- No production deployment, migration 014, P4-A, OAuth test, or additional Grant
  operation was performed as part of this resource cleanup.

## Pre-cleanup backup

Backup directory:
`/opt/wpauto/backups/p3c2b-site-b-cleanup/20261014T223023Z`

The directory was `root:root`, mode `0700`; each listed file was
`root:root`, mode `0600`. Hashes are SHA-256.

| File | Bytes / validation | SHA-256 |
|---|---:|---|
| `compose.yaml` | 2,918 bytes | `bf91b8f23b3736af759bfdd2a315b7f8460ee7117b4c043df3eba01645535595` |
| `runtime.env` | 165 bytes | `2908dae59fb972607a35b433d1b86753ac8cea97c19eab6dc004a5f4c6a7522b` |
| `mariadb.sql` | 180,343 bytes; dump completed, 12 CREATE TABLE statements | `51cfcdc44ee5b48cf7fb2b09ac2eb40ae37acf9fdcd4f3d434e25e976f62099c` |
| `wordpress-files.tar` | 122,449,920 bytes; 5,241 archive entries | `84e3b9f70ec942328de5207c64ff6941889339c90a364f67961ce241da500fd5` |
| `test2.wpauto.cc.conf` | 799 bytes; copy of the dedicated vhost | `26660b5a5eb59ef3a89777549ab0daade80c825906efd7c0d662339e95330bc5` |

The one-off Site B administrator credential file was intentionally excluded
from the backup and removed with the Site B project directory. The backup
remains in place; it was not restored or deleted.

## Removed resources

Only resources whose Compose project identity matched
`wpauto-wordpress-e2e-b` were removed:

- WordPress container
  `16f4661588c8e1468a8195cba34bd284558f1ac4eaf4ebe4c909c3e3935d4831`.
- MariaDB container
  `fe7d9f0ab8fef52d8787facad145fde92b3833ee3f2f1e4f4fc3febd357b5524`.
- Volumes `wpauto_wordpress_e2e_b_files` and
  `wpauto_wordpress_e2e_b_database`.
- Network ID
  `e93732b833b7a7c2dedac7c94e4824f957bdabb46871748f353a5a5f51d96c95`,
  name `wpauto_wordpress_e2e_b_internal`, subnet `172.30.52.0/24`.
- Project directory `/opt/wpauto-wordpress-e2e-b`.
- Host port `127.0.0.1:3201` is released.

The removal used exact IDs/names after confirming project labels, backup hashes,
network attachments, and the resolved project path. No global prune or
`down -v` was used. Shared image layers were left untouched.

## Deliberately retained ingress

- DNS: `test2.wpauto.cc` continues to resolve to Cloudflare Anycast addresses.
  The operator had confirmed the proxied route and Full (strict), but the
  authoritative record's exact ownership (record versus wildcard) was not
  established. No DNS change was made.
- Nginx vhost:
  `/www/server/panel/vhost/nginx/test2.wpauto.cc.conf`, SHA-256
  `26660b5a5eb59ef3a89777549ab0daade80c825906efd7c0d662339e95330bc5`.
- Certificate/key directory:
  `/www/server/panel/vhost/letsencrypt/test2.wpauto.cc`; files remain
  protected as `root:root`, mode `0600`. No shared certificate or renewal
  configuration was changed.
- `nginx -t` passed after removal.
- A TLS-valid origin-direct request mapped to the local source address returned
  HTTP 502 because the vhost still proxies to the released port 3201. This
  confirms the explicit host route fails closed; public behavior through
  Cloudflare was not used as evidence of origin health.

Ingress retirement is incomplete. Before removing the vhost, verify the exact
Cloudflare record and determine whether it is dedicated or wildcard-derived.
Then retire only the confirmed dedicated record (or document the wildcard
owner's separate process), validate that public traffic can no longer target
this origin, and only then remove the dedicated vhost and certificate after
confirming they are not shared or referenced by renewal jobs. Do not remove the
DNS record or certificate based solely on hostname resolution.

## Platform and surviving service post-check

- Platform migrations remained 001–013.
- Site B platform Site remains revoked; its business records were not deleted.
- Site B lifecycle Grant is revoked; no Site B live Grant, active pairing
  attempt, or undelivered Site B Outbox event was found.
- The two Site B revocation events remained delivered:
  - sequence 1, `grant/platform_user_revoked`, delivered;
  - sequence 2, `site/site_disconnected`, delivered.
- No database restore or mutation was performed. Historical Outbox rows were
  retained. The old Site A sequence-5 `site_disconnected` event remained
  `http.401` / undelivered before cleanup; its worker attempt counter may
  change through automatic retry, and no manual Outbox operation was made.
- Current Site A remained the only active platform Site. Its current Codex
  Grant remained active with `mcp:read`, updated at
  `2026-10-14 15:06:19.849847+00`, and no revocation reason. This is the
  replacement Grant created through the separately approved Site A recovery;
  it must not be conflated with the older revoked Grant.
- Site A Connector remained active at sequence 0 with zero deny markers and
  `deny_all=false`. Site B local deny state was already `deny_all=true`
  after its delivered disconnect event; its local state files were subsequently
  removed with the authorized Site B project deletion.
- The five surviving containers (Control, Authorization, PostgreSQL, Site A
  WordPress and MariaDB) remained healthy with no new restart/OOM observation.
  Their image digests/configuration were not changed.
- Site B containers, volumes, project network and directory were absent after
  cleanup; host port 3201 was free.
- The Control and Authorization digests were not modified by this cleanup.
  No migration 014, P4-A deployment, Connector update, OAuth flow, token
  lifecycle action, or Grant deletion was performed.

## Remaining action

Site B compute and persistent storage are removed, but DNS, the dedicated
Nginx vhost and certificate are retained pending exact DNS ownership and
reference verification. Therefore this is a partial resource cleanup, not a
complete Site B ingress retirement. Any further ingress or certificate
deletion should follow a separate, precise preflight and authorization.

