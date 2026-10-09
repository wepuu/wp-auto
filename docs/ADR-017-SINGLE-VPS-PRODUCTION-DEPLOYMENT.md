# ADR-017: Initial single-VPS production deployment

- Status: accepted and provisionally deployed on 2026-10-09; end-to-end release acceptance remains open
- Date: 2026-10-09

## Context

After Phase 2.0.7B1 and the ADR-016 local-signing implementation were merged,
the operator explicitly authorized an initial production deployment on the
existing operator-managed VPS and the `wpauto.cc` domain. The host already
runs BaoTa Nginx, Docker and unrelated sites. The deployment must remain small,
must not install Caddy or another key-management service, and must not modify
the WordPress connector.

## Decision

- The public control-plane origin and OAuth issuer are
  `https://auth.wpauto.cc` behind Cloudflare DNS proxying.
- BaoTa Nginx terminates a Let's Encrypt certificate and proxies only to
  loopback ports 3000 and 3001. `/internal/metrics` is not public.
- Docker Compose project `wpauto` uses its own `172.30.50.0/24` network,
  internal-only PostgreSQL and immutable GHCR images pinned by digest.
- Account login uses the operator's Auth0 tenant and a confidential Regular
  Web Application with the exact callback
  `https://auth.wpauto.cc/v1/account/oidc/callback`.
- ADR-016 encrypted RSA-3072 PKCS#8 custody is used. The private key and
  passphrase remain separate read-only host files; the database stores only a
  logical slot and public JWK.
- Terms, privacy, support and status pages are operator-managed static files.
  They contain no application Secret and can be revised without rebuilding an
  application image.

## Isolation and failure behavior

No existing Docker network, container, site configuration or global Nginx
configuration is reused or replaced. The dedicated vhost is loaded only after
`nginx -t`. Application startup and all issuer, key, audience and tenant checks
continue to fail closed. The data plane remains client-to-WordPress.

## Security and operational consequences

This is a shared single-host deployment. Host root compromise can expose the
database and loaded signing material, and host failure affects both control
services. Cloudflare, Auth0 and the VPS are external operational dependencies.
These risks are accepted for the initial operator-run service; no claim of HSM,
multi-region availability or formal compliance certification is made.

BaoTa manages ACME renewal. Port 80 exposes only the HTTP-01 challenge path and
redirects all other traffic to HTTPS. Cloudflare must use Full (strict) origin
TLS. Two encrypted offline signing-key backups in separate locations, with the
passphrase stored separately, remain an operator action before general release.

## Rollback

Before general release, rollback stops the two loopback application services,
restores the saved dedicated vhost, and preserves PostgreSQL, the public JWK
metadata and encrypted signing files for investigation. It does not delete or
disable any historical AWS KMS key. Connector Application Password access is
independent and remains available.

## Acceptance boundary

Infrastructure, TLS, OIDC redirect construction, public metadata, backup
restore and leakage checks are recorded in
`PRODUCTION_DEPLOYMENT_2026-10-09.md`. Interactive Auth0 login/callback and a
real WordPress pairing, consent, refresh, revocation and direct MCP flow remain
open. This ADR does not authorize a connector change or start Phase 2.0.7B2.
