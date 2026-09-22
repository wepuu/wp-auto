# Phase 2.0.2 Platform Foundation Validation

- Status: implementation and live AWS KMS contract complete; phase exit pending hosted CI evidence
- Date: 2026-09-17
- Branch: `codex/phase-2-0-2`

## Implemented boundary

The workspace now contains two independently runnable TypeScript services and
five internal packages. The authorization service owns `node-oidc-provider`,
its PostgreSQL adapter, and the KMS signing boundary. The control API owns
tenant reads and security activity. It has no MCP endpoint and no request-body
logging path.

Production key selection has exactly one implementation: AWS KMS asymmetric
RSA `SIGN_VERIFY`. Startup describes and validates the key before listening.
Disabled, unauthorized, malformed, or unavailable KMS state fails closed. The
only in-process RSA key is inside tests and cannot be selected through runtime
configuration.

PostgreSQL separates `platform`, `oauth`, and `audit` schemas and uses
non-login `wepuu_control`, `wepuu_auth`, and `wepuu_audit_writer` roles. Tenant
and account context is set locally inside each transaction. Tenant,
membership, and audit relations force RLS. The OAuth service role cannot read
control-plane tenant tables, and the control role cannot read provider state.

## Evidence

| Gate | Result | Evidence |
|---|---|---|
| Strict lint and TypeScript build | pass | ESLint and `tsc -b` exit 0 |
| Foundation unit/adversarial tests | pass | 9 pass; live KMS test intentionally skipped without credentials |
| Migration replay | pass | migration runner executed twice with checksum enforcement |
| Tenant isolation | pass | own tenant allowed; cross-tenant and wrong-account reads empty; control role denied OAuth schema |
| Durable audit isolation | pass | allow-listed event inserted through audit-only role; other tenant sees zero rows |
| Provider persistence | pass | a second database connection recovered the stored OIDC grant artifact |
| KMS adapter | pass, including live AWS | DescribeKey/GetPublicKey/Sign completed against the disposable RSA key; public-only JWK and local RS256 verification passed in 1.433 seconds; disabled-key and malformed-input fail-closed tests also pass |
| Content-free audit | pass | strict schema rejects token, Cookie, body, WordPress ID, and tool-argument canaries |
| Retained OAuth conformance | pass | 37 pass, one opt-in Auth0 smoke skipped; PostgreSQL restart path included |
| Contract/evidence integrity | pass | 23 frozen tools, four boundary markers, 37 redacted evidence cases |
| Dependency audit | pass | 0 info/low/moderate/high/critical across 282 dependencies after Fastify upgrade |
| SBOM | pass | `PHASE_2_0_2_SBOM.json`, CycloneDX 1.6, 282 components |
| Connector repository | pass | `D:\Codex\wp-auto-connector` remained clean on `main` |
| Deployment/push | pass | none performed |

The local PostgreSQL fixture used `postgres:16.10-alpine` on loopback port
55433 with an ephemeral tmpfs data directory. It is test-only and contains no
customer data.

## Open exit evidence

The live AWS KMS exit gate passed on 2026-09-21 using a narrowly scoped IAM
user and a disposable asymmetric RSA `SIGN_VERIFY` key. The test recorded no
credential, account, key ARN, public-key bytes, signature, or token material.

Phase 2.0.2 must remain open until the hosted CI item below is recorded:

1. Run `.github/workflows/phase-2-foundation.yml` in hosted CI. Repository rules
   prohibit pushing from this implementation session, so only the equivalent
   local gates have run.

These are evidence gaps, not authorization to deploy. Even after Phase 2.0.2
closes, production release remains gated on KMS rotation/JWKS overlap/PHP
interoperability with the experimental `ExternalSigningKey` integration and an
independent security review.

## Cleanup

The local test container is removed after validation. No AWS resources,
production issuer, production database, WordPress connector change, local
private-key fallback, deployment manifest, or pushed commit was created.
