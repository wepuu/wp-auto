# P3-B1B production callback registration

Date: 2026-10-13

## Scope and result

The operator authorized merging the exact callback compatibility change,
creating and validating a new production backup, registering the one observed
callback-specific redirect on the existing `wepuu-e2e-codex` client, and
restarting only the existing Authorization container. The operation passed.

No Desktop OAuth retry, Grant creation or revocation, service image update,
schema migration, P4-A deployment, Connector change, Control restart, pairing
operation or historical Outbox modification occurred.

## Source and immutable artifact

- PR #50 merged normally as `d0a350d8a44574fa04815a0b9063d898af714a12`.
- The merge commit's hosted Phase 2 Platform run `38320841593` passed.
- One-shot Authorization candidate:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:bd8575ce1a94e2664c586e30bfdd8470ebb7e9b3708e10a907eab646e247c61e`.
- The candidate was invoked only through an explicit `node` entrypoint with a
  read-only root filesystem, all capabilities dropped and
  `no-new-privileges`. Its default migration/start command was not run and the
  candidate was not deployed as a service image.

## Backup evidence

- Backup:
  `/opt/wpauto/backups/pre-p3b1b-callback/20261012T231655Z/wpauto-pre-p3b1b-callback.dump`.
- Size: 155,273 bytes.
- SHA-256:
  `73c327a1f17d9870e98c491d5216db5bc52e0a06ea2ea2a1f5036e749f05444c`.
- Owner and mode: `root:root`, `0600`.
- The custom-format catalog check passed.
- An isolated temporary PostgreSQL restore passed and confirmed all 13 applied
  migrations plus the original single-redirect client baseline. The temporary
  restore database was removed normally.

## Registration evidence

- The callback came from the previously authorized failed Desktop request and
  matched the exact no-port
  `http://127.0.0.1/callback/<base64url-id>` shape.
- Only its SHA-256 digest is retained in evidence:
  `948841f69ec5cc63242fd56a4cfe77df01deeb57c0ad59546e99bb245fa7c3ea`.
- The fixed client remains active and pre-registered with exactly two redirect
  URIs: the stable callback and the one exact callback-specific path.
- The new client metadata digest is
  `82cb1b326199869a3ff9f9df7763261a94a1bdf6c75b2956345145854fe718b8`.
- The existing Codex Grant remained active with its original ID,
  `updated_at=2026-10-12 12:03:49.698212+00`, scopes, tenant, Site, subject and
  empty revocation reason.
- The production migration ledger remained exactly 001 through 013.
- Both the VPS callback input file and the separate local transfer file were
  removed after successful verification. The callback identifier itself is
  not recorded here or in command output.

## Restart and health evidence

Only `wpauto-authorization-1` was restarted. It continued to run the original
fixed image:

`sha256:d63768332319035d363fa337c64e33ba476763bd555886b7dcd180f0691e08d0`

Control remained on its existing image and was not restarted. Authorization
readiness, Control readiness, OIDC discovery and JWKS all passed after the
restart. The database metadata and unchanged Grant baseline were then checked
again.

## Remaining gate

The second real Desktop OAuth attempt is still separately gated. Until it
passes, status remains:

```text
CODEX_DESKTOP_OAUTH_PASS=False
CODEX_DESKTOP_TOOL_COUNT=not_run
CODEX_DESKTOP_SITE_HEALTH_PASS=False
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
