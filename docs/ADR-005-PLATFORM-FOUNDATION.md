# ADR-005: Phase 2.0.2 platform foundation

- Status: accepted, implemented, and validated
- Date: 2026-09-16

## Context

Phase 2.0.2 must establish production-quality boundaries without implementing
site pairing, WordPress user grants, the connector Bearer path, or production
deployment. The platform must remain a control plane and must not gain any MCP
content route.

## Decision

Use a strict TypeScript workspace with two independently runnable services:

- the authorization service owns OAuth protocol endpoints and provider state;
- the control API owns platform accounts, tenants, memberships, and
  content-free security activity.

Both services use PostgreSQL 16 with separate roles and schemas. Tenant-owned
relations carry an explicit `tenant_id`, use forced row-level security, and are
accessed only inside a transaction with server-set tenant context. Global OAuth
client and signing-key metadata are explicitly classified and cannot be
silently treated as tenant-owned data.

Use `node-oidc-provider` 9.12.2 behind a provider-neutral boundary. Signing is
delegated through a `KeyCustody` port to an AWS KMS RSA signing adapter. Private
key bytes are forbidden from application configuration, PostgreSQL, logs,
backups, and production test fixtures. KMS, database, tenant-context, and
identity uncertainty fail closed.

Security audit records use a finite event and reason vocabulary plus an
allow-listed schema. Request/response bodies, Authorization and Cookie headers,
OAuth credentials, WordPress identity, and MCP content are rejected before a
sink receives them.

Local Docker Compose and CI may run PostgreSQL and test doubles. No production
deployment artifacts, cloud provisioning, connector changes, Redis, message
broker, or MCP proxy are part of this phase.

## Migration and compatibility

The first migrations create only foundation account, tenant, membership,
OAuth-client, provider-artifact, signing-key metadata, and security-audit
structures. Site pairing and grant business tables remain Phase 2.0.3 work.
The Phase 2.0.1 black-box suite remains an external compatibility harness;
production packages do not import spike implementation code.

## Failure behavior

- Missing tenant context denies tenant-owned reads and writes.
- KMS unavailable, sealed, unauthorized, or inconsistent stops signing.
- PostgreSQL uncertainty does not produce an authorization code or token.
- Missing authenticated account context denies control operations.
- Logging validation failure drops the unsafe event and emits only a bounded
  local diagnostic counter.

## Rollback

The foundation is not deployed in Phase 2.0.2. Local rollback stops the two
services and removes their isolated development database. No rollback may
introduce local production private keys, disable RLS, weaken OAuth validation,
or modify the independent Application Password path.

## Exit gate

Exit requires strict build and tests, migration replay, cross-tenant adversarial
coverage, KMS adapter contract and outage coverage, content-free audit canaries,
the retained OAuth conformance suite, SBOM/audit evidence, a Phase 2.0.2
validation record, and confirmation that the connector repository is unchanged.

All exit evidence passed by 2026-09-22. The live AWS KMS contract passed on
2026-09-21, and hosted CI run `35672159119` passed the complete non-secret
validation job for implementation commit `ab18b05` on 2026-09-22.
