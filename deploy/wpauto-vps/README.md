# wpauto.cc single-VPS deployment

This deployment is intentionally isolated from existing BaoTa sites and Docker
projects. It uses the `wpauto` Compose project, the `172.30.50.0/24` Docker
subnet, loopback ports 3000/3001 and `/opt/wpauto`. It does not modify an
existing Docker network or the BaoTa Nginx main configuration.

## Public origin

- Origin and OAuth issuer: `https://auth.wpauto.cc`
- Auth0 callback: `https://auth.wpauto.cc/v1/account/oidc/callback`
- Auth0 logout/origin: `https://auth.wpauto.cc`

The Nginx vhost routes only the established OAuth/JWKS paths to port 3001 and
routes the control shell to port 3000. `/internal/metrics` is not public.

## Host layout

```text
/opt/wpauto/compose.yaml
/opt/wpauto/config/runtime.env       root:root 0600
/opt/wpauto/secrets/signing_keyring.json
/opt/wpauto/secrets/signing_private_key.pem
/opt/wpauto/secrets/signing_passphrase
/opt/wpauto/legal/{terms,privacy,support,status}.html
/opt/wpauto/backups/
```

The three signing files are protected host files mounted read-only. They must
be owned by UID/GID 1000 and mode 0400; the deployment does not rely on
Compose file-secret ownership emulation.
The completed runtime environment file, generated keys, database dumps and
Auth0 client secret never enter Git or image layers.

## First-key bootstrap

1. Pull the two immutable `git-<sha>` images.
2. Start PostgreSQL only and run the database migration from one image.
3. Generate a new encrypted RSA-3072 PKCS#8 key and a separate passphrase in
   `/opt/wpauto/secrets`; do not import an AWS or old-computer key.
4. Write the public keyring slot, publish the public JWK, and wait a real 20
   minutes before activation. Do not backdate production metadata.
5. Activate the key, then start the control and authorization services.
6. Install the dedicated BaoTa Nginx vhost only after `nginx -t` succeeds.

## Required acceptance

- `/health/ready` succeeds on both loopback services.
- public discovery, JWKS and control readiness succeed through Cloudflare;
- JWKS contains RS256 public members only;
- Auth0 Authorization Code + PKCE S256 login completes with an exact callback;
- existing BaoTa sites and `tikdd` containers retain their previous status;
- a database backup can be restored into a disposable database;
- no private key, passphrase, Auth0 secret or WordPress content appears in
  logs, images, PostgreSQL metadata or public responses.
