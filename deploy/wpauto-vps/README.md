# wpauto.cc single-VPS deployment

This deployment is intentionally isolated from existing BaoTa sites and Docker
projects. It uses the `wpauto` Compose project, the `172.30.50.0/24` Docker
subnet, loopback ports 3000/3001 and `/opt/wpauto`. It does not modify an
existing Docker network or the BaoTa Nginx main configuration.

## Public origins

- Account authentication and OAuth issuer: `https://auth.wpauto.cc`
- SaaS console: `https://app.wpauto.cc`
- Email login: `https://auth.wpauto.cc/v1/account/login`

The P4-A Compose and vhost templates in this directory are not deployed by the
repository change. P3-A completion, a database backup and separate deployment
approval are required before migration 014 or the app vhost is activated.

The auth Nginx vhost routes only established OAuth/JWKS paths to port 3001 and
auth ceremonies to port 3000. The app vhost routes only to port 3000 and
rejects OAuth, discovery and raw Better Auth paths. `/internal/metrics` is not
public on either origin.

## Host layout

```text
/opt/wpauto/compose.yaml
/opt/wpauto/config/runtime.env       root:root 0600
/opt/wpauto/config/cloudflare-realip.conf
/opt/wpauto/secrets/signing_keyring.json
/opt/wpauto/secrets/signing_private_key.pem
/opt/wpauto/secrets/signing_passphrase
/opt/wpauto/secrets/account_auth_secrets.json
/opt/wpauto/secrets/resend_api_key
/opt/wpauto/legal/{terms,privacy,support,status}.html
/opt/wpauto/backups/
/opt/wpauto/bin/{check-health,backup-database,deploy-service}.sh
/opt/wpauto/rollback/
/opt/wpauto/acme-webroot/.well-known/acme-challenge/
```

The three signing files, Better Auth active/previous secret key ring and Resend
API key are protected host files mounted read-only. They must
be owned by UID/GID 1000 and mode 0400; the deployment does not rely on
Compose file-secret ownership emulation.
The completed runtime environment file, generated keys, database dumps and
Resend API key never enter Git or image layers.

## WordPress end-to-end test site

`compose.wordpress-e2e.yaml` defines the isolated `test.wpauto.cc` acceptance
site. It uses its own Compose project, network, named volumes and database, and
publishes WordPress only on `127.0.0.1:3200`. The connector release archive is
mounted read-only into the one-shot WP-CLI service and is never rebuilt on the
VPS. Runtime database and administrator secrets live only in
`/opt/wpauto-wordpress-e2e/config/runtime.env` with mode `0600`.

Install `nginx.test.wpauto.cc.bootstrap.conf` only while obtaining the initial
HTTP-01 certificate. After the public challenge file succeeds, replace it with
`nginx.test.wpauto.cc.conf`, validate with `nginx -t`, and reload Nginx. This
test vhost is independent from `auth.wpauto.cc` and every existing BaoTa site.
`request-http-certificate.py` is a narrow wrapper around BaoTa's existing ACME
client for this manually managed vhost; it accepts only `test.wpauto.cc` and the
fixed acceptance webroot and never prints certificate private material.

## Temporary second WordPress acceptance site (P3-B2/P3-B3)

`compose.wordpress-e2e-b.yaml` is a candidate, not an approved deployment.
It fixes project `wpauto-wordpress-e2e-b`, directory
`/opt/wpauto-wordpress-e2e-b`, ingress `127.0.0.1:3201`, network
`wpauto_wordpress_e2e_b_internal` / `172.30.52.0/24`, and volumes
`wpauto_wordpress_e2e_b_database` / `wpauto_wordpress_e2e_b_files`.
It uses the same pinned WordPress, MariaDB and WP-CLI images as Site A.
Never use `-p wpauto-wordpress-e2e`, Site A's runtime file, volumes, database,
administrator password, WordPress files or persisted Connector settings.

The operator selected the existing 4 GiB/four-vCPU VPS for a short E2E run and
later cleanup, not a permanent Site B. The former 1408 MiB whole-stack gate and
resize recommendation are superseded. Low `MemAvailable` or occupied Swap alone
does not fail this temporary mode. Keep existing services/caps unchanged; no
additional Swap, cache dropping, unrelated service termination or safety bypass.
Site B retains proven caps (WordPress 512 MiB, MariaDB 384 MiB, WP-CLI 128 MiB),
because Site A recorded peaks about 414/158 MiB. These caps are not allocations
or a requirement to reserve their sum. All three Site B services use `restart:
"no"` to avoid automatic reboot/OOM restart load. WP-CLI remains tools-only.

Use the bounded read-only collector `inspect-wordpress-e2e-b-resources.sh` and
`scripts/check-temporary-site-b-resources.mjs --stage <stage>` on its safe JSON
output. The collector may be streamed over the approved SSH session; it need
not be installed, and it never changes the host. It samples six times over at
least 25 seconds, checks core health at both ends, OOM/restart deltas, disk,
inodes, and initial port/project/volume/network/CIDR conflicts. Missing, stale
or incomplete evidence fails closed. Each decision covers only the next stage.

Project temporary-test stop rules (not Linux-prescribed production standards):
three consecutive samples with memory PSI `full avg10 >= 5%` or `some >= 10%`,
or paging >= 4 MiB/s together with `some >= 2%` / `full >= 1%`, stop progression.
Any new host/core OOM kill, restart, unhealthy core service, deployment collision
or inadequate disk/inodes also stops. Mild/declining pressure is reported as a
warning, not silently treated as no pressure. Historical OOM totals are not new
events; do not reset counters. The observation window cannot prove future safety.

Staged startup after separate authorization:

1. `preflight`: allow only MariaDB startup when available RAM during the window
   exceeds its measured Site A peak plus a 64 MiB transient margin (current
   estimate 158+64=222 MiB). Start `database` only and wait for health.
2. Recollect with `wordpress`: check all existing cores and Site B MariaDB;
   use measured WordPress peak plus 64 MiB (current estimate 415+64=479 MiB),
   then start WordPress only. Verify TCP health and a bounded HTTP read-only
   login/install-page smoke with discarded body; a TCP check alone is not full
   WordPress readiness.
3. Recollect with `wpcli`: require existing cores and both B services healthy,
   plus 128+64=192 MiB available. Initialize WordPress/install/activate the
   fixed clean Connector once; do not run parallel WP-CLI jobs. Leave pairing
   disconnected. No durability/security settings or auth validation are weakened.
4. Recollect with `test`: observe both B services and the unchanged cores;
   establish the separately approved HTTPS ingress last. Repeat this observation
   before/after the later separately authorized tests. Never approve all stages
   from the initial snapshot or retry an OOM loop.

These stage estimates use charged historical peaks, which include file cache,
and remain conservative hints, not guarantees. At a failed stage stop further
work and safely stop only the newly started Site B services under deployment
rollback authorization; never reclaim capacity by changing Site A or other apps.

Under that future approval, create Site B's root-owned protected configuration
directory and `config/runtime.env` (`0600`) containing independently generated
`WPAUTO_E2E_B_DATABASE_PASSWORD` and `WPAUTO_E2E_B_DATABASE_ROOT_PASSWORD`.
Do not print completed Compose configuration, shell traces or secrets. Use
`docker compose --env-file /opt/wpauto-wordpress-e2e-b/config/runtime.env
--file /opt/wpauto-wordpress-e2e-b/compose.yaml config --quiet` for validation.
Provision a new WordPress database and a new administrator through a secret-safe
interactive procedure; do not pass its password through logged command arguments.
Install only the verified clean Connector archive with SHA-256
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
Initially leave the Connector disabled/disconnected. Do not manually create
v2 revocation state: formal pairing later creates its new site ID, sequence 0
and empty deny markers.

For public ingress, approval must explicitly cover only `test2.wpauto.cc` DNS,
its dedicated BaoTa vhost and its certificate. First check whether a valid
existing certificate covers the hostname; do not assume that Site A's certificate
or its fixed-hostname ACME helper does. An authorized dedicated vhost must use
`server_name test2.wpauto.cc`, proxy only to `127.0.0.1:3201`, preserve Host,
set `X-Forwarded-Proto https` on TLS ingress, and use the existing trusted proxy
policy without weakening TLS. HTTP-01, if needed, uses Site B's separate
`acme-webroot`; the port 80 challenge location precedes the HTTPS redirect.
Check `nginx -t` before a graceful reload and verify existing sites afterwards.
DNS propagation, Cloudflare Full (strict), origin TLS and certificate renewal
remain unverified until that separately approved work is actually performed.

Rollback is scoped to Site B: stop its containers, restore only this operation's
owned ingress configuration and retain its volumes. Do not use `down -v`,
remove networks attached to other applications, or restore any whole database.
Failure after later pairing requires normal disconnect/recovery, not SQL repair.
Site B may subsequently support P3-B3 Application Password regression; no third
WordPress instance is required. It is temporary, not a retained third production
application.

### Separately authorized end-of-test cleanup

Before deletion, enumerate exact Site B project labels, container IDs, volume
mounts and paths and compare Site A/Codex Grant baselines. Disconnect Site B
normally and process only its temporary Grants; do not use SQL to delete audit
history or quietly revoke Site A's lifecycle/Codex Grants. Delete the one-time
Application Password through its normal WordPress action before removing B.
Only after these checks and explicit cleanup approval remove B containers,
`wpauto_wordpress_e2e_b_database`, `wpauto_wordpress_e2e_b_files`,
`wpauto_wordpress_e2e_b_internal` and the validated exact directory
`/opt/wpauto-wordpress-e2e-b`. Do not use global prune or delete a computed broad
path. Remove only the operation-owned `test2.wpauto.cc` vhost/DNS record and
dedicated certificate/configuration, never a shared/wildcard certificate or
other certificate renewal entry. Keep platform audit and G1/G2/old Outbox
records. Verify surviving services/Grant/state again and record what was deleted
and whether a verified backup allows recovery. No cleanup command is executed
by this preparation or by the resource checker.

Pairing and the production cross-Site test require another explicit approval.
Immediately before that test, read-only record both site/tenant bindings,
Client metadata, the original Codex Grant ID/status/updated_at/reason,
Connector state hashes/counts/sequences and Outbox metadata checksums. Require
no lifecycle live Grant for either site. Use the same platform account and Tenant
and the existing active `wepuu-e2e-lifecycle` public client, not Codex credentials.
Then run the following only with that approval, replacing the non-secret IDs:

```powershell
node scripts/test-production-wordpress-site-isolation.mjs --account-id <account-id> --tenant-id <tenant-id> --site-a-id <site-a-id> --site-b-id <site-b-id> --execute true
```

The script opens two normal browser authorizations using a one-use local handoff.
It holds both Access Tokens in one local test process, requests only `mcp:read`,
never refreshes/replays/revokes, and validates both own-site MCP probes, both
cross-site denials, and own-site postchecks within 45 seconds. Both Tokens must
have at least 60 seconds remaining at matrix start. Slow Consent that exhausts
this margin stops the run; do not automatically reauthorize. Tokens and MCP
responses never become output files or platform traffic. The two approved test
Grants remain active until a separately authorized cleanup.

Postchecks must confirm the original Codex Grant is unchanged, Site A stays at
sequence 2 with its two markers, Site B stays at sequence 0 with no markers,
both new lifecycle Grants are active, and old Outbox metadata is unchanged.
Report only same-account/same-Tenant cross-Site resource/Grant isolation, not
independent tenant-claim proof or actual revocation-propagation isolation.
See `docs/P3B2A_SECOND_SITE_PREFLIGHT_2026-10-13.md` for current blockers.

## First-key bootstrap

1. Pull the two immutable `git-<sha>` images.
2. Start PostgreSQL only and run the database migration from one image.
3. Generate a new encrypted RSA-3072 PKCS#8 key and a separate passphrase in
   `/opt/wpauto/secrets`; do not import an AWS or old-computer key.
4. Write the public keyring slot, publish the public JWK, and wait a real 20
   minutes before activation. Do not backdate production metadata.
5. Activate the key, then start the control and authorization services.
6. Install each dedicated BaoTa Nginx vhost only after its certificate exists
   and `nginx -t` succeeds.

Install `cloudflare-realip.conf` with the auth vhost and review it against
Cloudflare's published IP ranges before every rollout. Nginx trusts
`CF-Connecting-IP` only from those source ranges and overwrites
`X-Forwarded-For` with the resulting `$remote_addr`; arbitrary client-supplied
forwarding chains therefore cannot choose the Better Auth limiter key.

The port 80 vhost serves only the ACME HTTP-01 challenge directory before
redirecting all other requests to HTTPS. Keep that directory in place so the
BaoTa-managed certificate can renew without changing another site.

## Required acceptance

- `/health/ready` succeeds on both loopback services.
- public discovery, JWKS and control readiness succeed through Cloudflare;
- JWKS contains RS256 public members only;
- Email OTP registration/login, Session issuance and OAuth interaction resume
  complete without exposing raw Better Auth routes;
- existing BaoTa sites and `tikdd` containers retain their previous status;
- a database backup can be restored into a disposable database;
- no private key, passphrase, Resend API key, OTP or WordPress content appears in
  logs, images, PostgreSQL metadata or public responses.

The bounded ADR-017 OAuth/MCP acceptance passed on 2026-10-10. Better Auth and
Email OTP browser entry passed in production on 2026-10-11; P3-A completed on
2026-10-12 and the real Desktop P3-B1B passed on 2026-10-13. P3-B2/P3-B3
remain pending. P4-A is not deployed by this repository change. For ongoing checks,
run `pnpm check:production:public` from a trusted workstation and follow
`docs/ADR_017_OPERATIONS_RUNBOOK.md`. The public probe is content-free and does
not replace the VPS file-permission, certificate, disk, backup-restore or
Cloudflare Full (strict) checks in the runbook.

The three scripts under this deployment directory are installed without the
`.sh` suffix under `/opt/wpauto/bin`, owned by root and mode `0700`. The health
probe is suitable for a five-minute cron entry. The database backup job is
suitable for a daily cron entry. Cron output must go only to the system logger;
the scripts themselves emit content-free result lines. The deploy script is
manual-only and must never be scheduled.
