# Portable Deployment Foundation

Phase 2.0.7A provides a provider-neutral OCI runtime. This is a preparation
guide, not production-deployment authorization.

## Host contract

- OCI/Docker-compatible Linux host outside AWS.
- External PostgreSQL with encrypted transport and tested backups.
- TLS reverse proxy forwarding only from explicitly configured CIDRs.
- Outbound HTTPS to the external account OIDC provider and
  paired WordPress control endpoints. MCP traffic does not use this host.
- Read-only containers, non-root users, dropped capabilities and a bounded
  `/tmp` tmpfs.

Build with `deploy/Control.Containerfile` and
`deploy/Authorization.Containerfile`. The example Compose file binds both
services to loopback so a separately managed TLS proxy remains the only public
listener.

## Local signing custody

Run `pnpm keys:generate -- --private-key-file PATH --passphrase-file PATH` on a
trusted operator host. It creates an encrypted RSA-3072 PKCS#8 key and a
separate random passphrase, refuses overwrite, applies mode `0600`, and prints
only the RFC 7638 `kid` and public JWK.

Create a non-secret keyring JSON such as:

```json
{"keys":[{"slot":"primary","privateKeyFile":"/run/secrets/signing_private_key","passphraseFile":"/run/secrets/signing_passphrase"}]}
```

Mount all three files read-only and owned by the container UID at mode `0400`.
Set `WEPUU_SIGNING_KEYRING_FILE=/run/secrets/signing_keyring` and
`WEPUU_SIGNING_KEY_SLOT=primary`. Compose secrets are host file mounts; protect
the source files and keep two encrypted offline copies with passphrases stored
separately.

Publish with `pnpm keys:publish -- --slot primary`, wait at least 20 minutes,
then run `pnpm keys:activate -- --kid KID`. After the retiring deadline, run
`pnpm keys:retire -- --kid OLD_KID` and remove that old private-key Secret.
These database commands require `WEPUU_DATABASE_URL`. Public modes also require
an independent `WEPUU_OPERATIONS_METRICS_TOKEN` of at least 32 characters. The
token protects only `/internal/metrics`; it is not an OAuth credential.

Liveness is available at `/livez`. Readiness at `/readyz` fails closed when the
database check is uncertain. The product-shell readiness page reports category
status only and is not a substitute for these probes.

## Deferred values

The production origin, DNS, certificate automation, provider-specific OIDC
claims, database vendor, legal identity, policy URLs, data region and recovery
objectives are intentionally deferred to Phase 2.0.7B2. `staging` and
`production` startup reject placeholders until those values are supplied.
