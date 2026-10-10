# ADR-017 operations closeout: 2026-10-10

## Status

The bounded single-VPS deployment is healthy and its production OAuth and
WordPress end-to-end acceptance gates have passed. This closeout establishes a
small operational baseline and runbook. It does not approve connector changes,
general user release or Phase 2.0.7B2.

## Read-only production evidence

- Compose services `wpauto-postgres-1`, `wpauto-control-1` and
  `wpauto-authorization-1` were running and healthy with zero restart count.
- Control and authorization remained bound to loopback. `nginx -t` passed.
- Public readiness, OIDC metadata and OAuth metadata returned 200. The declared
  JWKS URI returned one RSA/RS256 signing key with a non-empty RFC 7638 `kid`
  and no private RSA members.
- The origin certificate for `auth.wpauto.cc` was issued by Let's Encrypt and
  valid from 2026-10-09 through 2027-01-07. Origin and Cloudflare-fronted
  readiness both succeeded. This network observation does not prove the
  Cloudflare dashboard setting; Full (strict) still requires operator
  confirmation.
- The signing keyring, encrypted private key and passphrase were regular,
  non-symlink files with mode `0400` and owner `1000:1000`. The runtime file was
  a regular root-owned `0600` file. File contents were not read or copied.
- The root filesystem was 80% used with approximately 16 GB available. Docker
  reported about 11 GB of reclaimable image data. Nothing was pruned because
  the VPS hosts unrelated applications.
- The existing root-owned mode-0600 PostgreSQL custom-format backup remained in
  `/opt/wpauto/backups`. Its prior isolated restore success is recorded in
  `PRODUCTION_DEPLOYMENT_2026-10-09.md`.

## Protocol and data-flow evidence

The 2026-10-10 production record confirms Authorization Code with PKCE S256,
RS256 access-token bindings, refresh rotation, revocation, JWKS verification
and direct client-to-WordPress MCP. The local Application Password regression
also passed. No connector file was changed.

The checks in this closeout used public protocol metadata, readiness responses
and host/file metadata only. No WordPress content, MCP input/output, token,
cookie, authorization code, private key or passphrase entered the repository or
control plane evidence.

## Remaining operator actions

The operator subsequently confirmed Full (strict), two separate offline copies
of the encrypted local signing key and separate passphrase storage. The
temporary combined workstation copy was deleted after integrity verification.

1. Continue weekly public/runtime checks and monthly isolated database restore
   drills using `ADR_017_OPERATIONS_RUNBOOK.md`.
2. Keep general release, final legal/residency wording and Phase 2.0.7B2 gated
   until separately approved.
