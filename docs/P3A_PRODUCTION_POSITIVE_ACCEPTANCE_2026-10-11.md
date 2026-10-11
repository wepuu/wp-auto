# P3-A production positive acceptance — 2026-10-11

## Scope and status

This record covers immutable-image preparation, the separately authorized
project backup and bounded rollout, and the positive production OAuth/MCP
acceptance for the PR #33 OAuth Grant Bootstrap fix. Only the control and
authorization services were recreated. No production migration, Nginx, DNS,
Cloudflare, WordPress Connector or unrelated container was changed.

```text
P3A_CODE_CANDIDATE_CONFIRMED=True
P3A_IMMUTABLE_IMAGES_READY=True
P3A_VPS_READ_ONLY_PREFLIGHT_PASS=True
P3A_DEPLOYMENT_AUTHORIZED=True
P3A_DEPLOYMENT_COMPLETE=True
P3A_POSITIVE_OAUTH_MCP_PASS=True
REFRESH_REPLAY_SAFE_PREREQUISITES=False
GRANT_REVOCATION_SAFE_PREREQUISITES=False
P3_CORE_OAUTH_MCP_PASS=False
READY_FOR_CONTROLLED_USE=False
```

## Candidate provenance

- Release ref: `p3a-bb71226`.
- Exact source commit: `bb71226fd21cc3c26d1f7e53e76b328b45fb095b`.
- GitHub Actions publication run: `38125547578`; result `success`; its
  `headSha` exactly matched the candidate commit.
- Control image:
  `ghcr.io/wepuu/wp-auto-control@sha256:791159decdc75b85b00a9b0b474c427f652cdfe7d03bd80fb43e5a54138e4ed5`.
- Authorization image:
  `ghcr.io/wepuu/wp-auto-authorization@sha256:adb448c60e3ecd7d680afcdadcf0f0356bdc70e37d93d9f22b747f635db1c6b1`.
- Both published manifests are `linux/amd64`. The publication workflow's
  non-root image check passed.

The candidate contains migrations 001 through 013 only. It does not contain
the P4-A console Session migration 014, split-origin runtime variables or the
`app.wpauto.cc` vhost.

## Pre-deployment baseline

- `wpauto-control-1`, `wpauto-authorization-1`, `wpauto-postgres-1` and the
  isolated WordPress acceptance containers were healthy. Unrelated `tikdd`
  containers were also healthy and were not touched.
- Before rollout, control used
  `sha256:3fd72d6c1f8c29aa154553585edfff35caad06e29e95950bda29b93f817cb483`
  and authorization used
  `sha256:9dcc84cd38d9f32268cedc290b40c9441cae111170043396ff39e6c2e34e44ff`.
- Compose used `WEPUU_CONTROL_PUBLIC_ORIGIN=https://auth.wpauto.cc` for both
  application services. `WEPUU_APP_PUBLIC_ORIGIN` was absent.
- Only the `auth.wpauto.cc` and `test.wpauto.cc` project vhosts were installed;
  `app.wpauto.cc` was absent and `nginx -t` passed.
- `public.wepuu_schema_migrations` contained exactly migrations 001 through
  013. Migration 014 was absent.
- Secret files were regular files with the expected protected ownership and
  modes. Their contents were neither read nor printed.
- JWKS contained one public-only RSA/RS256 member matching the active
  `local-pkcs8` signing-key metadata.
- OAuth metadata retained issuer `https://auth.wpauto.cc`, the expected
  endpoints and PKCE S256.
- Root filesystem use was 78%, below the runbook warning threshold.

## Acceptance prerequisites

The read-only data check found one active Better Auth-linked WePuu account
with an active home-owner membership and an active pairing for the exact
`test.wpauto.cc` MCP resource. The pre-registered `wepuu-e2e-codex` client was
active with the exact native loopback registration
`http://127.0.0.1/callback`. Older Grants belonged to a different, previously
used account/site relationship and remained revoked.

The production browser run created the new active Grant through the signed
Bootstrap, WordPress-local consent and platform consent flow. No SQL was used
to fabricate the account, pairing or Grant relationship.

## Backup and bounded rollout

The newest daily dump predated the Email OTP test account and active test-site
pairing. Immediately before rollout, the operator created the custom-format
backup `wpauto-p3a-20261011T085609Z.dump` under the project pre-deploy backup
directory. PostgreSQL accepted its archive directory, its SHA-256 check
passed, and the dump plus checksum were regular `root:root` mode-0600 files.

- Control was deployed first at its recorded candidate digest. It became
  healthy with restart count zero while authorization remained unchanged.
- Authorization was then deployed at its recorded candidate digest and became
  healthy with restart count zero.
- PostgreSQL remained healthy with exactly migrations 001 through 013.
- Project health, loopback/public readiness, OAuth metadata, JWKS, `nginx -t`
  and the backup checksum passed after rollout.
- The `app.wpauto.cc` vhost remained absent. All observed unrelated `tikdd`
  containers remained healthy and untouched.
- Root filesystem use after image pull was 79%, below the runbook warning
  threshold.

## Positive OAuth and direct MCP result

The operator completed the real browser flow from the isolated native-loopback
test client. The bounded access-only probe confirmed:

- Email OTP authentication resumed the original OAuth interaction;
- first-authorization Grant Bootstrap completed through WordPress-local and
  WePuu consent;
- Authorization Code exchange with PKCE S256 succeeded;
- the access token used RS256, the active public `kid`, and the exact issuer,
  audience, account, tenant, site, Grant, client and `mcp:read` bindings;
- the client connected directly to WordPress, initialized MCP, found the exact
  frozen 23-tool catalog and called the read-only `wp-auto-site-health` tool.

The resulting Grant is active and bound to the expected Email OTP account,
home tenant, `test.wpauto.cc` site and `wepuu-e2e-codex` client. No
authorization code, access token, refresh token, Cookie, OTP, email address,
WordPress response content or secret value is stored in this record.

## Open gates

Refresh Token Replay, explicit Grant/Token Revocation, outbox delivery and
Connector denial before access-token expiry have not been executed in this
P3-A run. The existing positive Grant must not be used for those destructive
checks. The isolation findings and required follow-up are recorded in
`P3A_TOKEN_LIFECYCLE_PREFLIGHT_2026-10-11.md`.

P3-A remains incomplete until both isolated lifecycle scenarios actually pass.
P3-B has not started, and this evidence does not authorize P4-A deployment,
public registration or Connector changes.
