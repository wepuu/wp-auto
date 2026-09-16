# OAuth conformance spike

This package is test-only. It contains no production HTTP service and must not be used as the WePuu control plane.

```powershell
docker compose up -d --wait postgres
$env:CONFORMANCE_DATABASE_URL = 'postgresql://postgres:conformance@127.0.0.1:55432/conformance'
npm.cmd test
npm.cmd run test:persistent
npm.cmd run check
npm.cmd run interop:php
npm.cmd run conformance:auth0
npm.cmd audit --audit-level=high
docker compose down
```

The persistent adapter stores only provider artifact payloads in the disposable test database. Protocol traces are content-free and must be passed through `npm.cmd run check:evidence` before being retained.

Auth0 credentials are process-only. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and
`CONFORMANCE_RESOURCE` in the current shell, then run
`npm.cmd run conformance:auth0`. The probe performs metadata, exact-resource,
issuer/state, redirect, and PKCE checks without creating a client. A DCR probe
is opt-in (`AUTH0_DCR_PROBE=1`) and requires `AUTH0_MGMT_TOKEN`; cleanup fails
closed if that token is absent. Never commit tenant secrets or raw browser
traces.

To remove a previously created probe client, set its opaque ID in
`AUTH0_CLEANUP_CLIENT_IDS` (comma-separated) together with the short-lived
Management API token and run `npm.cmd run cleanup:auth0`. The output contains
only the redacted Management API path and status. Immediately remove both
environment variables after a successful run.

## Temporary HTTPS client fixture

The real-client fixture is deliberately isolated and uses pinned images
`node:24.21.0-alpine` and `caddy:2.10.2-alpine`. Start Docker and copy the CA as
the normal interactive user; run the system install/remove scripts from an
Administrator PowerShell because only the two temporary hosts entries need
elevation:

```powershell
npm.cmd run fixture:https:install
npm.cmd run fixture:workbuddy:prepare
# Fully quit and restart WorkBuddy, then open .tmp/workbuddy-client.
npm.cmd run fixture:workbuddy:verify
npm.cmd run fixture:workbuddy:cleanup
npm.cmd run fixture:https:remove
docker compose --profile https-fixture down --volumes --remove-orphans
```

The install script imports only Caddy's ephemeral root into
`Cert:\CurrentUser\Root`, records its SHA-256 fingerprint, and fails if port
443 or either hostname is already in use. Elevated removal matches the
certificate by SHA-256, removes the marked hosts block, and verifies both trust
and hosts restoration; Docker teardown is deliberately separate so it runs
under the interactive user's Docker Desktop context. The isolated WorkBuddy helper records only
existence, byte length, and SHA-256 hashes for user configuration files; it
never records token contents.
