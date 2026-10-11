# P3-A6 production lifecycle client pre-registration — 2026-10-11

## Scope and result

The operator authorized one bounded production operation: prepare the fixed
one-shot Authorization image, create and restore-validate a fresh project
backup, pre-register only `wepuu-e2e-lifecycle`, restart only the existing
Authorization container, and verify the non-sensitive OAuth surface. The
operation passed.

This operation did not deploy the candidate image, run migration 014, change
Control, Connector, Nginx or DNS, or execute Refresh Replay, token revocation,
an authorization code exchange or an MCP tool call.

## Immutable artifacts and baseline

- Repository merge commit: `a8d2b215bc7ce5acdc3aaa314cb72597308caa00`.
- One-shot Authorization image:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:5f5732172a2595717bc3b60b7a95038af063948e2762f18708061a8bebfc91b9`.
- Image publication workflow: GitHub Actions run `38140050027`, successful.
- Running Control image remained
  `ghcr.io/wepuu/wp-auto-control@sha256:791159decdc75b85b00a9b0b474c427f652cdfe7d03bd80fb43e5a54138e4ed5`.
- Running Authorization image remained
  `ghcr.io/wepuu/wp-auto-authorization@sha256:adb448c60e3ecd7d680afcdadcf0f0356bdc70e37d93d9f22b747f635db1c6b1`.
- PostgreSQL, Control and Authorization were healthy with zero restarts before
  the operation. The root filesystem was 79 percent used with 17,217,304 KiB
  available.
- The database contained exactly migrations 001 through 013. The existing
  `wepuu-e2e-codex` client was active and the lifecycle client was absent.

The candidate contains migration 014 in its default startup path. The
operation therefore overrode the entrypoint explicitly with `node` and invoked
only `packages/database/dist/oauth-test-client-cli.js`. Local and VPS artifact
checks confirmed that this path reached the CLI without running the default
migration command.

## Backup and recovery evidence

- Backup:
  `/opt/wpauto/backups/pre-register/wpauto-p3a6-20261011T125653Z.dump`.
- Size: 130,150 bytes.
- SHA-256:
  `1cb2e0627d0092beed9d481d5bf3a354c22189ed1a8f1a61a16ab314582a035f`.
- The dump catalog and checksum passed.
- The first empty-cluster restore exposed the expected external prerequisite:
  PostgreSQL cluster roles are not included in a database-only logical dump.
  No production state was affected.
- A second network-isolated, tmpfs-backed PostgreSQL restore pre-created the
  production `wepuu_*` NOLOGIN role names and completed with
  `--exit-on-error`. The restored database contained exactly migrations 001
  through 013, the original Codex client active, and no lifecycle client.
- The disposable restore container was removed. The backup and checksum remain
  root-owned under the project backup directory.

## Client write and verification

The digest-pinned image ran once with a read-only filesystem, no Linux
capabilities, no-new-privileges, only the internal project network, and only
the existing database URL passed into the container. The CLI returned a newly
created fixed client. Read-only database verification then matched:

- Client ID: `wepuu-e2e-lifecycle`.
- Registration mode: `pre-registered`.
- Redirect URI: `http://127.0.0.1/callback`.
- Metadata digest:
  `1947b4f5919683158d31e14754f289a4333ad1a7a149f907fafc150bf391fab5`.
- Status: `active`.

The metadata digest binds a public client, `token_endpoint_auth_method=none`
and PKCE S256. The existing `wepuu-e2e-codex` row was unchanged and active.
The schema migration ledger remained at 001 through 013.

The connection credential is the existing PostgreSQL owner credential. The
repository transaction wrapper immediately uses `SET LOCAL ROLE wepuu_auth`;
that effective role is non-superuser. The owner credential remains a broader
residual risk accepted only for this fixed-image, hard-coded, one-shot path.

## Restart and protocol checks

Only `wpauto-authorization-1` was restarted. Its configured image and image ID
remained the accepted `adb448c6...` digest; the candidate image was not
deployed. The service returned healthy without applying a migration.

Post-restart checks passed:

- project health monitor;
- issuer and OAuth endpoints under `https://auth.wpauto.cc`;
- Discovery advertising only PKCE S256;
- public-only RSA/RS256 JWKS with a non-empty `kid` and no private members;
- strict authorization requests recognized both `wepuu-e2e-lifecycle` and
  `wepuu-e2e-codex` without exchanging a code or token;
- both database client rows remained active;
- migration ledger remained 001 through 013.

## Remaining gate

This record does not close P3-A:

```text
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```

G1 Refresh Replay and G2 explicit revocation, including outbox delivery and
Connector denial before access-token expiry, remain destructive production
tests requiring separate authorization.
