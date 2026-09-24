# External account OIDC local acceptance

This procedure validates the Phase 2.0.3A account-login callback against the
configured Auth0 development application. It is a local acceptance fixture,
not production deployment configuration.

## Auth0 application

Use a Regular Web Application with these exact values:

- allowed callback URL:
  `https://platform.example.test/v1/account/oidc/callback`;
- allowed logout/origin value: `https://platform.example.test`;
- OIDC-conformant discovery and RS256 ID tokens;
- no wildcard callback, implicit flow, password grant, or MCP API audience.

The Auth0 client secret is entered only in the current PowerShell process. Do
not put it in chat, `.env`, shell history, fixture files, or Git.

## Start the isolated fixture

Run an Administrator PowerShell from the repository root. This starts the
isolated PostgreSQL, MariaDB, WordPress 6.9 and Caddy services, installs the
temporary CurrentUser CA, adds the three exact test domains to hosts, and activates the
connector in a disposable WordPress site:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-https.ps1 Install
```

Then use a normal PowerShell. The launcher prompts securely for the Auth0
client secret and the existing test-only AWS access key. Neither secret is
written to `.env`, Git, or the fixture state file. The control plane is built
and started in the pinned Linux Node 26.7 container because the AWS OpenSSL
provider is not published for Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-control.ps1
```

In Chrome, open:

`https://platform.example.test/v1/account/oidc/login?return_to=/v1/account/session`

If v2rayN automatic system proxy is enabled, add the exact domains
`platform.example.test`, `site.example.test`, and `site-moved.example.test` to
its existing system-proxy exceptions. The dotted test domains are not covered
by a generic "bypass local addresses" option even though Windows hosts resolves
them to `127.0.0.1`.

A successful callback returns `{"authenticated":true}`. Seed the one fixed
test tenant only after that callback created the pseudonymous local account:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-seed-tenant.ps1
```

Log in to `https://site.example.test/wp-admin/` with the disposable account
printed by the install script. Under Settings > WePuu Auto Connector, use:

- control-plane origin and authorization issuer:
  `https://platform.example.test`;
- tenant ID: `11111111-2222-4333-8444-555555555555`.

Acceptance requires pairing, grant approve, grant deny, consumed-request retry
denial, logout revocation, restart-time session resolution, and content/secret-
free logs and database inspection.

## Canonical resource migration

After the original site is paired and has one approved disposable grant, move
the WordPress origin without changing stored connector trust:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-https.ps1 MoveSite
```

Open `https://site-moved.example.test/wp-admin/`. The connector must show
`suspended`, retain the old resource only as the rejected trust boundary, and
deny the old proof, grant, and pending-consent paths. The administrator must
disconnect, enable, and connect again; the new resource must never be adopted
silently and existing grants must not revive.

## Mandatory cleanup

Run from an Administrator PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\account-oidc-https.ps1 Remove
```

Both `HOSTS_RESTORED=True` and `TRUST_RESTORED=True` are required. The test
HMAC key is deliberately disposable; a production identity HMAC key must be a
durable secret and cannot be rotated without an identity migration design.
