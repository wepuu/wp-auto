# P3-B2B temporary Site B deployment: preparation checkpoint

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
