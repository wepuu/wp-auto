# P3-C2C: Site B Nginx and TLS Certificate Retirement

Date: 2026-10-15 (UTC).

## Outcome

The operator manually deleted the Cloudflare DNS record for
`test2.wpauto.cc`; no Cloudflare API or DNS write was performed in this task.
The VPS resolver returned no IPv4 address for the hostname at the final check.

The former Site B certificate material was confirmed exclusive to
`test2.wpauto.cc`, backed up, and removed. Because the Nginx configuration
had no safe HTTPS catch-all and the first TLS server would otherwise be a
different business host, the Site B vhost was replaced—not deleted—with a
minimal exact-host rejection entry. HTTP requests are closed with Nginx's
`444`; TLS handshake is rejected before a certificate is presented. This
prevents an unknown/stale Host or SNI from falling through to Site A or the
Authorization service.

```text
P3C2B_SITE_B_CONTAINERS_REMOVED=True
P3C2B_SITE_B_VOLUMES_REMOVED=True
P3C2B_SITE_B_FILES_REMOVED=True
P3C2B_PLATFORM_HISTORY_PRESERVED=True
P3C2B_DNS_RETIRED=True
P3C2B_INGRESS_CERT_RETIRED=True
P3C2B_SITE_B_CLEANUP_COMPLETE=True
P3C2C_SITE_B_INGRESS_RETIREMENT_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```

The Nginx file remains only as a deliberate rejection vhost:
`/www/server/panel/vhost/nginx/test2.wpauto.cc.conf`. It contains no
upstream, certificate path, or Site B service dependency.

## Ownership and reference checks

Before deletion:

- The active vhost contained exactly two `server_name test2.wpauto.cc`
  blocks and was the only active Nginx reference to its dedicated certificate
  path.
- The certificate subject and sole SAN were `test2.wpauto.cc`; validity was
  2026-10-13 through 2027-01-11. Certificate and private key were separate,
  regular root-owned mode-`0600` files and their public-key digests matched.
- The certificate directory contained only Site B certificate artifacts
  (full chain, private key, PFX, CSRs, and a local note). No other vhost
  referenced these files.
- A Baota `ssl_saved` directory contained a second full chain/private-key
  copy and metadata whose only DNS name and subject were `test2.wpauto.cc`.
  The directory was domain-specific and had no active configuration reference.
- Searches found no Site B-specific cron, systemd timer, acme.sh or Certbot
  renewal entry. Shared ACME account/configuration and other domain
  certificates were not changed.
- Nginx was version 1.28.3. Its supported
  `ssl_reject_handshake` directive allows a server block to reject the
  handshake without retaining or referencing a certificate. The directive is
  documented as available since Nginx 1.19.4
  ([official Nginx documentation](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)).

## Backup

Protected backup directory:
`/opt/wpauto/backups/p3c2c-site-b-ingress/20261015T032726Z`

Directory permissions: `root:root 0700`. Files: `root:root 0600`.
The backup files remain in place and were not restored or deleted.

| Backup file | Validation | SHA-256 |
|---|---|---|
| `test2.wpauto.cc.conf` | 799-byte original vhost; compared byte-for-byte before replacement | `26660b5a5eb59ef3a89777549ab0daade80c825906efd7c0d662339e95330bc5` |
| `test2-letsencrypt.tar` | 7 archive entries; archive compared with original source tree before removal | `38e6c6c03633a92196de0dd056db5c354ad251059a9523ae52937b9f1a138af9` |
| `test2-panel-ssl-saved.tar` | 4 archive entries; archive compared with original source tree before removal | `b7e12c372b73f337756992c8b40ffc447948fdb1167b4a0b49a27ed1402a7294` |

No private-key contents or certificate bundle contents are included in this report.

## Changes and route verification

- Replaced the former proxying vhost with:
  - port 80: exact `test2.wpauto.cc` server closes requests (`444`);
  - port 443: exact `test2.wpauto.cc` server rejects the TLS handshake with
    `ssl_reject_handshake on`.
- The new config SHA-256 is
  `695de1a460db032b89fc01faf6977ca1754ab0af7e9f6398d45994015f682104`.
- `nginx -t` passed before reload and after certificate removal.
- One normal Nginx reload succeeded.
- A local origin request with `Host: test2.wpauto.cc` on port 80 was closed
  (curl exit 52, consistent with Nginx 444).
- A normal TLS-validated origin request with SNI `test2.wpauto.cc` failed
  during handshake (curl exit 35), as expected from explicit TLS rejection.
  No certificate-verification bypass was used.
- After cleanup, no active config referenced the old Site B certificate path;
  the dedicated certificate directory and saved copy were absent.
- Site B Compose project containers, volumes, network, project directory and
  port 3201 remained absent. The domain had no DNS answer at final resolver
  check.

## Surviving health and platform state

Five WPAuto/Site A containers remained `running/healthy`, with restart count
0 and `OOMKilled=false`: Authorization, Control, PostgreSQL, Site A
WordPress, and Site A MariaDB. Their images and environment were not changed.

TLS-validated endpoint results after reload:

| Endpoint | Result |
|---|---|
| `auth.wpauto.cc/health/live` | HTTP 200 |
| `auth.wpauto.cc/health/ready` | HTTP 200 |
| Authorization Discovery | HTTP 200 |
| `test.wpauto.cc/wp-json/` | HTTP 200 |
| `app.wpauto.cc/` | HTTP 526, unchanged from the pre-change check |

The app host's 526 is an unrelated pre-existing origin/TLS issue; P4-A is not
deployed and no app, DNS, certificate, or vhost configuration was changed.

A read-only database check confirmed:

- migrations `001_foundation.sql` through `013_email_otp_login.sql` only;
- Site A is the only active platform Site; Site B remains revoked;
- Site B has no live Grant and no pending/verifying pairing;
- Site B Outbox sequence 1 (`grant`) and sequence 2 (`site`) remain delivered;
- the current replacement Site A `wepuu-e2e-codex` Grant remains active with
  `mcp:read`, updated at `2026-10-14 15:06:19.849847+00`, and no
  revocation reason. The original earlier Codex Grant remains revoked;
- Site A historical sequence-5 `site_disconnected` remains undelivered with
  `http.401` (20 attempts at final check). It was not edited or manually
  requeued.

No Site/Grant/Outbox records were deleted, no database writes or restore were
performed, and no OAuth, revocation, migration 014, Docker prune, Connector
change, or P4-A operation was run. `design/` was not modified or staged.

## Historical checkpoints

PR #64's P3-C2A document remains a historical snapshot before Site A recovery
and Site B Disconnect. PR #65 records later recovery/disconnect facts. PR #66
records the intermediate P3-C2B state before ingress retirement, including why
DNS/vhost/certificate were initially retained. This document records the
subsequent P3-C2C completion without rewriting those histories.

