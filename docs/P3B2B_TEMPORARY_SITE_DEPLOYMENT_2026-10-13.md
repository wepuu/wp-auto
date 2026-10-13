# P3-B2B temporary Site B deployment: preparation checkpoint

## WP-CLI failure diagnosis and resume procedure (2026-10-13)

### Findings

PR #55 remains Draft at head `a85ebe89a5e4d7b7e336ded4b599769d9beb9e16`;
its CI run `38386807497` passed. The two Site B service containers remain stopped
with the previously recorded IDs, project labels, volumes and network. No
production container was started during this diagnostic. All five existing
Control/Authorization/PostgreSQL/Site A containers are healthy, OOM false and
restart count zero. The Codex Grant baseline and seven-row Outbox remain
unchanged.

The original WP-CLI service ran as Compose user `33:33`, using the fixed
`wordpress:cli-2.12.0-php8.3` digest. The image entrypoint is
`docker-entrypoint.sh`; its image default command is `wp shell`, overridden by
the command supplied to `docker compose run`. The effective Compose expansion
confirms the WP-CLI image, UID/GID, mounted WordPress volume, and equality of
database host/name/user/password values between the WP-CLI and MariaDB
services. These comparisons were performed in memory; no secret values were
printed. The protected admin and runtime files remain `root:root 0600`.

The attempted command shape was:

```text
docker compose -p wpauto-wordpress-e2e-b --env-file <protected runtime.env> \
  -f /opt/wpauto-wordpress-e2e-b/compose.yaml \
  run --rm --no-deps -T wpcli core install \
  --url=https://test2.wpauto.cc --title=<fixed Site B title> \
  --admin_user=<fixed Site B admin name> --admin_email=<fixed Site B email> \
  --skip-email --prompt=admin_password
```

The password was redirected from the protected file to standard input; its
value is intentionally absent here. WP-CLI's official `core install` reference
documents this same `--prompt=admin_password < admin_password.txt` pattern and
`--skip-email`. This confirms the command shape is supported in general, but
does not prove behavior of the exact pinned image in the unavailable local
runtime: [WP-CLI core install](https://developer.wordpress.org/cli/commands/core/install/),
[WP-CLI global parameters](https://make.wordpress.org/cli/handbook/config/).

The one-shot container used `--rm`, so its inspect record no longer exists.
Docker's retained event stream had no matching WP-CLI `die` event; the exit
code and original standard output/error cannot be recovered. They were
redirected to `/dev/null` by the execution wrapper. No OOM evidence points to
the WP-CLI job; the retained B containers have false OOM flags, and the host
and core OOM counters did not change during the observed run. The failure
classification is therefore `unknown`, and a specific cause is **not
confirmed**.

Read-only checks found `wp-config.php` with the expected environment-variable
references. The MariaDB data directory exists but contains no per-table InnoDB
`.ibd` files for `wpauto_e2e_b`. This is evidence consistent with core tables
not having been created, but is not a database query and cannot establish
installation state while MariaDB is stopped. No WordPress table contents or
site content were read. No production retry was made.

### Local reproduction status

The Windows host has Docker CLI 29.8.0 but no working engine. Docker Desktop
reports unable to start; its expected executable is absent. WSL enumeration
returned `E_ACCESSDENIED`. No Podman, local PHP+MariaDB stack, or local WP-CLI
runtime is available. Consequently the fixed WordPress/MariaDB/WP-CLI images
could not be run against fresh local volumes, and no local core-install result
is claimed. No local test resources were created, so there was nothing to clean
up. This is an environment blocker, not evidence that the production issue is
fixed or reproduced.

No command or Compose change is justified by current evidence. In particular,
the prompt/stdin, service UID, and database environment configuration have not
been shown to be the cause. Do not change the fixed image, resource limits, or
WordPress database by guesswork.

### Recovery plan for a separately authorized resume

The initial deployment preflight correctly treats the retained Site B directory,
containers, volumes and network as conflicts. Resume must use a dedicated
read-only identity check that recognizes only this exact retained resource set;
it must not ignore generic conflicts. The identity check should require the
recorded container IDs/project labels, fixed image digests, exact two volume
names and network ID/subnet, root-owned mode-0600 configuration, the expected
Compose/ZIP hashes, and no Site B vhost. Any mismatch stops before startup.

After a separate production-resume authorization:

1. Recheck backups, resources, existing core health, memory pressure, OOM and
   the Site A/Codex/Outbox baseline. Keep the existing Site B volumes and
   configuration; do not regenerate its database passwords or admin password.
2. Start only the identified Site B MariaDB service using its existing Compose
   project/configuration and volume. Verify it is healthy and all five original
   services remain healthy.
3. Recollect resources, then start only the identified Site B WordPress
   service. Verify its health and a bounded local HTTP install-page response.
4. Before any installation write, run a one-shot read-only `wp core is-installed`
   check. If installed, skip `core install` and verify only the expected host,
   database and administrator identity metadata. If not installed, inspect the
   table inventory using a read-only command: zero WordPress tables permits one
   controlled install attempt; any partial WordPress table set stops for manual
   review rather than rerunning a potentially non-idempotent installer.
5. If a controlled install is later authorized, use the pinned WP-CLI image,
   UID/GID `33:33`, `--rm --no-deps -T`, protected stdin, and fixed arguments.
   Capture output only into a bounded root-owned mode-0600 temporary file;
   report stage, exit code and a fixed error category (`cli`, `stdin`,
   `database_auth`, `database_unreachable`, `already_installed`,
   `filesystem_permission`, or `unknown`). Never echo or persist raw output,
   command environment, password, or site content. Delete the temporary output
   after classification. On failure, stop only Site B and retain its data.
6. Recollect resource and health evidence before Connector installation. Install
   and activate the fixed ZIP only after core installation is verified. Confirm
   connection, pending pairing and identity state are absent; do not pair.
7. Enable the dedicated HTTPS vhost only after certificate and DNS checks,
   `nginx -t`, and another resource sample. Verify origin TLS and public HTTPS
   independently.

This is a procedure, not permission to resume or start any container. Until the
exact one-shot WP-CLI failure is reproduced locally or safe classified output is
available from a future authorized attempt, the production root cause remains
unknown. This round made no runtime, Connector, database, DNS, certificate, or
vhost changes; the certificate remains unreferenced. `design/` remains untouched.

## Current execution result: initialization failed, Site B stopped

The operator added the TXT. Public resolvers `1.1.1.1` and `8.8.8.8` both
matched the original order's challenge. That same order was finalized once;
no replacement order was created. The dedicated certificate was issued into
`/www/server/panel/vhost/letsencrypt/test2.wpauto.cc`, with protected directory
and file permissions. SAN is exactly `test2.wpauto.cc`; validity is
2026-10-13 09:46:21Z through 2027-01-11 09:46:20Z. Hostname, system-trusted
certificate-chain and public/private key matching checks passed without
disabling TLS verification or printing private key material. No vhost references
the certificate yet. The operator may remove only this order's exact TXT value;
other same-name TXT records must not be removed.

All three pinned images were already cached and matched the template digests.
The ZIP matched the fixed SHA-256; its plugin header version is `0.1.0`, with
789 archive files. The archive was copied cleanly, not Site A installed state.

Entry preparation/backup directory:
`/opt/wpauto/backups/site-b-deployment/20261013T104644Z`. Existing auth/Site A
vhosts were copied with preserved metadata and later source hashes matched:

- auth vhost: `f44e9086951b488c5763f3d9adfd516cc8fad51ac7a4954df2fb4bdaccb57656`
- Site A vhost: `3c310af3b4b967c7a7d430d1a49a78522b880e1bdb07bd2838653c5081ab5e8b`

The Site B vhost was absent before and after execution. No DNS A/wildcard record
was changed by the agent; existing DNS configuration was confirmed by the
operator. A dedicated candidate vhost was uploaded to the preparation directory,
but not installed, and Nginx was not reloaded.

Fresh stage assessments and actual outcomes:

| Stage | Minimum/latest available MiB | Next budget MiB | Assessment and actual result |
| --- | --- | --- | --- |
| preflight | 1332.465 / 1332.465 | 222 | allowed; independent MariaDB started and became healthy |
| wordpress | 1114.645 / 1192.359 | 479 | allowed; WordPress healthy; loopback install page HTTP 200 |
| wpcli | 969.828 / 1061.949 | 192 | allowed; single `core install` invocation failed; stopped |
| test/HTTPS | not sampled | not assessed | not run |

The WordPress assessment emitted transient paging/pressure warnings as well as
occupied Swap/historical OOM warnings; no sustained-pressure stop condition was
observed. The other two assessments emitted occupied Swap/historical OOM
warnings. Startup polls checked core health, OOM and pressure; no existing
container was restarted or stopped. Source-byte hash was verified before
creating Site B and database startup occurred within the fresh sample window.

`wp core install` was attempted once with the administrator password supplied
from the protected file on stdin, `--prompt=admin_password`, `--skip-email`,
and a one-shot `run --rm --no-deps -T` container. It returned nonzero before
the install-success marker. Output was discarded to avoid leaking prompt or
credential data, so the underlying error classification was not retained.
**The root cause is unconfirmed.** Do not attribute it to memory, credentials,
stdin prompting or database connectivity without isolated evidence. The
one-shot container was automatically removed; it is not resident.

Connector installation/activation and its installed-file manifest verification
were never reached. The WordPress files and `wp-config.php` exist, but the
installation/database initialization outcome is unconfirmed; no second
initialization was attempted. No Connector plugin directory exists in Site B.

The failure handler stopped only the two owned Site B containers, leaving
volumes, database, network, files and root-owned `0600` credentials intact.
No `down -v`, prune, database restore or resource deletion occurred. At
`2026-10-13T10:52:52Z`, the five original cores remained running/healthy,
OOM flags false and restart counts zero. Site B containers were exited, OOM
flags false and restart counts zero; their stopped health state is not
misrepresented as healthy. Migrations remained 001–013, active Site count one,
Codex Grant remained active with the original timestamp/null reason, and
Outbox remained seven rows/four delivered.

Owned retained resources (all project labels `wpauto-wordpress-e2e-b`):

- directory `/opt/wpauto-wordpress-e2e-b`; Compose `compose.yaml`, protected
  `config/runtime.env` and `config/admin_password`, clean `artifacts/connector.zip`;
- stopped database container
  `fe7d9f0ab8fef52d8787facad145fde92b3833ee3f2f1e4f4fc3febd357b5524`;
- stopped WordPress container
  `16f4661588c8e1468a8195cba34bd284558f1ac4eaf4ebe4c909c3e3935d4831`;
- volumes `wpauto_wordpress_e2e_b_database` and `wpauto_wordpress_e2e_b_files`,
  mounted under their exact `/var/lib/docker/volumes/<name>/_data` paths;
- network `wpauto_wordpress_e2e_b_internal`, subnet `172.30.52.0/24`, ID
  `e93732b833b7a7c2dedac7c94e4824f957bdabb46871748f353a5a5f51d96c95`;
- dedicated, unreferenced certificate directory and the original order reference;
  preparation/backup directory listed above.

No platform Site, Grant, Token or pairing was created. No lifecycle tests,
Application Passwords, migrations, P4-A, core image/limit changes or Connector
code changes occurred. The final read-only check also confirmed Site A v2,
sequence 2, two Grant markers and the unchanged state digest; five old Site
Outbox rows remained. Local targeted template/resource tests passed 11/11.
Full `pnpm check` passed typecheck/lint and 164 tests with zero failures and
18 environment-gated skips (182 total). Compose dummy-credential rendering
and `git diff --check` passed. The new dedicated vhost is tested as a candidate,
not claimed to have passed a live Nginx syntax/reload or HTTPS acceptance.
Next task is isolated reproduction of the exact
WP-CLI invocation with safe error categorization, followed by an explicitly
approved resume procedure that recognizes the owned retained resources.
The initial preflight checker correctly rejects these resources as conflicts;
do not falsify or ignore that result to resume. Current result:

```text
P3B2_TEMPORARY_4GB_MODE=True
P3B2_DEPLOYMENT_PREFLIGHT_PASS=True
P3B2_SITE_B_DEPLOYED=False
P3B2_SITE_B_HTTPS_PASS=False
P3B2_SITE_B_CONNECTOR_INSTALLED=False
P3B2_SITE_B_PAIRED=False
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

Preflight True records the actual successful historical stage checks, not
current permission to resume or full deployment success. Sections below are
earlier checkpoints, retained without rewriting their historical results.

## Later DNS-01 preparation checkpoint

After the initial checkpoint below, the operator confirmed the Cloudflare
record/wildcard origin is `5.255.99.225`, proxy enabled and Full (strict)
unchanged, and explicitly authorized Let's Encrypt issuance. The installed
BaoTa ACME code was inspected before use. A single dedicated RSA-2048 manual
DNS-01 order for `test2.wpauto.cc` was created, using TLS verification enabled
only on this ACME instance. The existing ACME account was used without exposing
its credentials. No website/vhost or global renewal job was created.

Order reference: `742f1d04a93cd32ee79c8b0d293e6f43`. Its public TXT challenge
was returned only to the operator, not stored in this record. Issuance is
pending operator TXT creation and public DNS verification. Do not create a
second order or finalize before verifying the exact challenge. Certificate
issuance, Site B startup and HTTPS acceptance remain unrun/False. No Site B
container, volume, network, credential or deployment directory was created.

The initial statement below that no certificate order existed remains the
historical pre-order checkpoint, not the current order state.

## Execution scope and current stop point

The operator authorized PR #54 integration and staged deployment of the temporary
Site B on the existing four-vCPU/4 GiB VPS, including dedicated DNS-01/TLS ingress
and rollback of newly owned resources. Pairing, OAuth Grants/Tokens, MCP calls,
Application Passwords, lifecycle tests, migration 014 and P4-A are excluded.

This is a **partial preparation record, not deployment acceptance**. No Site B
directory, credentials, container, network, volume, DNS record, certificate order
or vhost was created by this execution checkpoint. No rollback was required.
DNS source-record ownership/origin confirmation and a dedicated DNS-01
certificate require operator collaboration before staged startup proceeds.
No previous preflight sample may be reused after that wait.

## GitHub and fixed source

PR #54 was reviewed at head `57338e6a710507fcb92081a1d5e14cf55ae4998a`:
seven planned files, no review threads/blockers, head CI `38371397325` successful.
It was marked Ready and normally merged as
`455179fe9bee281d7530ece4b968a110decf66ff`.
[Merged-main CI 38382245367](https://github.com/wepuu/wp-auto/actions/runs/38382245367)
completed successfully. Site A, Connector code, Provider and migrations were not
changed. The deployment evidence branch starts from that merge.

SHA-256 of source files at this checkpoint (local checkout bytes):

- `deploy/wpauto-vps/compose.wordpress-e2e-b.yaml`:
  `bf91b8f23b3736af759bfdd2a315b7f8460ee7117b4c043df3eba01645535595`
- `deploy/wpauto-vps/inspect-wordpress-e2e-b-resources.sh`:
  `a3c2b234a6d5600d0529191d801f4223e4e0fa06b85d364cf45183b41a574f9d`
- `scripts/check-temporary-site-b-resources.mjs`:
  `366148cff476dbc74c70cdec5bd8c479dc1c13d84218494540bd6c4f98ccea9b`

Streaming the collector normalizes CRLF to LF; these checkout hashes are not
claimed to be hashes of an installed VPS copy. No collector was installed.

## Production read-only baseline

At `2026-10-13T10:17:29Z`, all five existing core/Site A containers were healthy,
OOM flags false, restart counts zero:

- Control: `sha256:3a4eed82715339076947aaa9ada0a8a065b1784041bc2f4c353d79f8a3d6038f`
- Authorization: `sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`
- PostgreSQL: `postgres:16.10-alpine`
- Site A WordPress: `sha256:85c24b4b92dc7fcea65317d2be635643189d0d8ad4bba65d79a660fd018fe246`
- Site A MariaDB: `sha256:345fa26d595e8c7fe298e0c4098ed400356f502458769c8902229b3437d6da2b`

Read-only PostgreSQL transactions confirmed 13 migrations, latest
`013_email_otp_login.sql`, one active Site, lifecycle live Grant count zero, and
Codex Grant `grant_Q0YY...GETM` active with unchanged
`updated_at=2026-10-12 12:03:49.698212+00` and null revocation reason.

At `10:19:39Z`, Site A Connector connection was present and its masked Site
digest matched the active platform Site. Revocation state remained v2,
sequence 2, two Grant markers, zero token/key markers, and state digest
`74bad59adbeb286c324b7990a679fab9c2e744eeba280367c050a4632d91cdcf`
matched the earlier baseline. Outbox remained seven rows, four delivered,
five rows associated with old revoked Sites. No rows were modified.

Disk had 15,798 MiB available and 4,005,149 free inodes. The Site B directory,
dedicated Nginx vhost and dedicated certificate path were absent. The clean
Connector archive `/opt/wpauto-wordpress-e2e/artifacts/wepuu-auto-connector-p3a7.zip`
matched SHA-256
`f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.
No installed plugin directory, database, identity or credentials were copied.

## Dynamic resource assessment

The current repository collector was streamed through authorized SSH into Bash
read-only, then its six-sample output evaluated by the matching local checker.
The preflight assessment returned `allowed=true`, no reason codes/conflicts,
minimum available RAM 1210.141 MiB, latest 1297.578 MiB, and next-stage budget
222 MiB. Only occupied Swap and historical OOM-count warnings were emitted;
no new OOM, restart or sustained-pressure stop condition was observed.

This assessment permits only the next database-start stage within its validity
window. It does not prove all subsequent stages or future runtime safety. No
1408 MiB hard gate, Swap change, cap reduction or unrelated service stop was used.

## Ingress blocker and remaining steps

Public DNS currently resolves `test2.wpauto.cc` to Cloudflare edge addresses.
That does **not** establish whether an exact or wildcard record is used, its
origin, or ownership. Operator confirmation must establish the intended origin
`5.255.99.225`, proxy enabled and unchanged Full (strict), without overwriting
unrelated records. Dedicated DNS-01 certificate preparation is still unrun.
Do not create a website/vhost merely to bypass this preparation stop point.

After DNS/certificate collaboration completes, take fresh baselines, back up
owned ingress configuration (record absent prior objects), verify fixed cached
images, and run a fresh preflight before creating Site B resources. Continue
database, WordPress, one-shot WP-CLI/clean Connector and HTTPS stages only after
their independent checks pass. Keep Connector unpaired. Final acceptance must
verify origin TLS and public HTTPS separately and unchanged Site A/core/Grant/
revocation metadata. Failure rollback stops only newly owned Site B containers,
retains files/volumes/database and restores only owned ingress changes.

## Status at this checkpoint

```text
P3B2_TEMPORARY_4GB_MODE=True
P3B2_DEPLOYMENT_PREFLIGHT_PASS=True
P3B2_SITE_B_DEPLOYED=False
P3B2_SITE_B_HTTPS_PASS=False
P3B2_SITE_B_CONNECTOR_INSTALLED=False
P3B2_SITE_B_PAIRED=False
P3B2_PRODUCTION_ISOLATION_TESTED=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The preflight True is the timestamped resource assessment only; DNS/certificate
preparation remains blocked, not passed. `design/` remains untracked and untouched.
