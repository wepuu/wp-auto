# Phase 2.0.0 Validation

- Date: 2026-09-15
- Phase: documentation-only architecture freeze
- Result: PASS, with explicitly deferred prototype and product-policy gates

## Authorization and workspace evidence

The approved work was limited to creating architecture documentation in `D:\Codex\wp-platform`. No production code, dependency, database, infrastructure, deployment, Git initialization, remote, commit, push, or connector change was authorized or performed.

Initial state:

- platform directory empty;
- platform directory not a Git repository;
- reference connector clean on `main` at `1dd26511c792c0bcf82539f3ba674139a567facd`;
- reference connector read-only and outside the platform write scope.

## Required document set

- [x] `AGENTS.md`
- [x] `README.md`
- [x] `docs/ROADMAP.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/PHASE_2_0_AUTH_CONTRACT.md`
- [x] `docs/ADR-001-OAUTH-CONTROL-PLANE.md`
- [x] `docs/ADR-002-SITE-PAIRING-AND-USER-BINDING.md`
- [x] `docs/THREAT_MODEL.md`
- [x] `docs/DATA_MODEL.md`
- [x] `docs/API_CONTRACTS.md`
- [x] `docs/WORDPRESS_CONNECTOR_CHANGES.md`
- [x] `docs/WORDPRESS_ORG_SERVICE_DISCLOSURE.md`
- [x] `docs/PHASE_2_0_0_VALIDATION.md`

## Contract checklist

- [x] Control plane is separated from the direct MCP data plane.
- [x] Hosted gateway/proxy is excluded.
- [x] Platform content and WordPress credential collection are prohibited.
- [x] Administrator opt-in is required before external contact.
- [x] Application Password fallback remains independent.
- [x] The exact ordered 23-tool catalog is frozen.
- [x] OAuth scope is a ceiling and cannot bypass WordPress permissions.
- [x] Authorization Code + PKCE S256 is mandatory.
- [x] PRM, AS metadata, Bearer challenge, issuer binding, and RFC 8707 resource are specified.
- [x] Exact full-endpoint audience and no token passthrough are mandatory.
- [x] Short access token, refresh rotation/reuse detection, revocation, JWKS overlap, and fail-closed behavior are specified.
- [x] Minimal claims and forbidden claims/data are explicit.
- [x] Site pairing and local per-user binding are separated.
- [x] Multisite and domain-change behavior are explicit.
- [x] Tenant isolation, SSRF, replay, mix-up, confused deputy, logging, operator abuse, deletion, and outage threats are covered.
- [x] Future connector work is isolated behind a separate approval gate.
- [x] WordPress.org service disclosure includes placeholders that block release until resolved.

## Mechanical checks performed

- Required inventory: 13 of 13 files present, with no unexpected production artifact.
- Internal Markdown links: all local targets resolve.
- Tool catalog: exactly 23 expected names in the expected order.
- Scope boundary search: direct data plane, exact audience, Application Password fallback, forbidden-data language, and WorkBuddy prototype status are present.
- Formatting hygiene: no trailing whitespace detected.
- Prohibited artifacts: no `.git`, package/lockfile, Docker, database, migration, application-code, or deployment artifact detected.
- Reference connector after documentation work: `main...origin/main`, with empty working-tree and staged diffs.

## Source review

The architecture was checked against current official or project-primary sources:

- MCP stable Authorization specification dated 2025-11-25;
- OAuth 2.1 draft-15 and RFC 9700;
- RFC 9728, RFC 8414, RFC 8707, RFC 9207, and RFC 8252;
- current Codex manual MCP OAuth section and installed `codex-cli 0.154.0` help output;
- WorkBuddy's official general MCP OAuth documentation, treated as insufficient for exact conformance;
- official WordPress Application Password, REST authentication, plugin guideline, common issue, and privacy guidance;
- primary documentation for the candidate OAuth components.

## Compatibility status

| Client/component | Phase 2.0.0 conclusion |
|---|---|
| Codex | documented feature fit; exact server interoperability still must pass 2.0.1 |
| WorkBuddy | prototype verification required |
| `node-oidc-provider` | leading candidate; adapter/CIMD/audience conformance required |
| Auth0 | managed comparison candidate; exact dynamic audience behavior required |
| ZITADEL | not preferred under currently documented resource behavior |
| Keycloak | not preferred without proving required version/extension behavior |

## Deferred blocking decisions

These do not block the documentation freeze but block production implementation or release:

- exact access-token, refresh inactivity, refresh absolute, audit, and deletion-retention durations;
- final signing algorithm after PHP/client interoperability tests;
- platform login/MFA/account-recovery provider;
- data residency and subprocessors;
- legal provider name, Terms, Privacy, support, and status URLs;
- production cloud/region and disaster-recovery objectives;
- target Codex and WorkBuddy version matrix;
- whether CIMD, DCR, or pre-registration is enabled for each release channel.

## Rollback validation

The documented rollback boundary preserves:

- Application Password direct access;
- the 23-tool catalog and existing permission logic;
- fail-closed token checks;
- removal/disablement of optional OAuth trust without modifying WordPress content;
- additive/reversible future migrations.

No rollback may accept a token by skipping signature, algorithm, issuer, exact audience, time, site, grant, scope, local-user, or capability validation.

## Phase exit

Phase 2.0.0 is complete when the document inventory and automated text checks pass and a reviewer accepts the deferred gates above. Starting Phase 2.0.1 requires separate explicit approval. This validation record does not authorize implementation.
