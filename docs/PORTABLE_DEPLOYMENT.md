# Portable Deployment Foundation

Phase 2.0.7A provides a provider-neutral OCI runtime. This is a preparation
guide, not production-deployment authorization.

## Host contract

- OCI/Docker-compatible Linux host outside AWS.
- External PostgreSQL with encrypted transport and tested backups.
- TLS reverse proxy forwarding only from explicitly configured CIDRs.
- Outbound HTTPS to the external account OIDC provider, AWS STS, AWS KMS and
  paired WordPress control endpoints. MCP traffic does not use this host.
- Read-only containers, non-root users, dropped capabilities and a bounded
  `/tmp` tmpfs.

Build with `deploy/Control.Containerfile` and
`deploy/Authorization.Containerfile`. The example Compose file binds both
services to loopback so a separately managed TLS proxy remains the only public
listener.

## AWS KMS from a non-AWS server

Preferred: configure the hosting provider's workload OIDC issuer in AWS IAM,
restrict the role trust policy to the exact workload subject and audience, and
provide `AWS_ROLE_ARN` plus `AWS_WEB_IDENTITY_TOKEN_FILE`. The AWS SDK exchanges
that assertion for short-lived STS credentials.

Fallback: configure IAM Roles Anywhere with a dedicated trust anchor, profile
and least-privilege role, then expose its helper through the standard AWS
`credential_process` configuration. Certificate private material belongs in
the host secret facility, never the image or repository.

The role may use only `kms:DescribeKey`, `kms:GetPublicKey` and `kms:Sign` for
the explicitly approved key ARNs. Production mode refuses static
`AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` values.

## Deferred values

The production origin, DNS, certificate automation, provider-specific OIDC
claims, database vendor, legal identity, policy URLs, data region and recovery
objectives are intentionally deferred to Phase 2.0.7B. `staging` and
`production` startup reject placeholders until those values are supplied.
