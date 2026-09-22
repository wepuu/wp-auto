# Roadmap

## Scope rule

Phase 2 is a control-plane product. MCP content and tool traffic are never
routed through WePuu Platform. Moving between phases requires explicit approval
and a validation record.

## Phase 2.0.0 - architecture freeze

Status: accepted on 2026-09-15; documentation freeze complete.

The product boundary, OAuth/MCP contract, site and user binding, threat model,
data model, API/error rules, connector change contract, and disclosure draft are
frozen. Application code, deployment, and connector changes were prohibited.

## Phase 2.0.1 - conformance spike

Status: accepted and closed on 2026-09-16. The local provider/HTTPS/PHP gates
and Codex 0.154.0 pre-registered OAuth path passed; Auth0 was rejected for the
frozen S256 profile; WorkBuddy 5.5.2 was recorded unsupported; Auth0 test
clients and fingerprinted fixture state were removed.

This phase compares `node-oidc-provider` 9.12.2 with a disposable Auth0 tenant
through one provider-neutral suite. It validates PRM/AS metadata, PKCE S256,
RFC 8707 resource and exact audience, issuer response, redirects, refresh
rotation, revocation, JWKS overlap, scope boundaries, PHP JOSE, and direct
client-to-WordPress data flow. All code remains under
`spikes/oauth-conformance/`; no deployment or connector change is allowed.

Exit gate: a signed decision record identifies the selected provider, supported
clients, known deviations, pinned versions, and rejected alternatives.

## Phase 2.0.2 - platform foundation

Status: approved and in progress on 2026-09-16. No production deployment or
WordPress connector change is authorized.

- TypeScript strict-mode workspace.
- Isolated authorization service and control API.
- PostgreSQL persistence with mandatory tenant scoping.
- Provider-neutral key-custody boundary with an AWS KMS asymmetric signing
  adapter; private key bytes never enter the application, database, or logs.
- Structured, content-free security audit pipeline.
- Local development and CI validation without production deployment.

## Phase 2.0.3 - pairing and user grants

- Explicit administrator-initiated site pairing.
- SSRF-resistant site verification.
- Per-user local WordPress consent and opaque grant binding.
- Disconnect, re-pair, domain-change, user-disable, and deletion behavior.

Connector work is a separate task and requires separate approval.

## Phase 2.0.4 - token lifecycle

- Short-lived JWT access tokens.
- Opaque rotating refresh families with reuse detection.
- JWKS cache and overlapping rotation.
- Signed revocation outbox and local denylist behavior.
- Rate limits, abuse controls, and recovery procedures.

## Phase 2.0.5 - scoped connector integration

- Add Bearer authentication alongside Application Passwords.
- Map `grant_id` to a current local WordPress user for each request.
- Enforce scope as a ceiling before existing local permission checks.
- Preserve the exact 23-tool catalog and input/output semantics.

## Phase 2.0.6 - security and resilience qualification

- Authentication, replay, confused-deputy, SSRF, tenant-isolation, key-compromise,
  and refresh-reuse tests.
- Platform, database, JWKS, webhook, DNS, and clock-skew failure exercises.
- Backup restoration and verified deletion exercises.
- Independent security review before public production use.

## Phase 2.0.7 - disclosure and release gate

- Final Terms of Service and Privacy Policy URLs.
- WordPress.org disclosure and admin consent copy.
- Data retention, residency, incident response, support, and recovery policy.
- Compatibility matrix for supported Codex and WorkBuddy versions.
- Staged opt-in release with Application Password rollback intact.

## Deferred and out of scope

- Hosted MCP gateway or proxy.
- WordPress content ingestion, indexing, transformation, analytics, or telemetry.
- Billing, paid-plan enforcement, remote workflows, or WordPress administration
  conclusions.
- DPoP, sender-constrained tokens, enterprise federation, or SCIM until separately
  justified.
