# Phase 2.0.5 Scoped Connector Integration Test Plan

## Scope

This phase connects the accepted Phase 2.0.4 JWT profile to the existing
WordPress MCP resource server. It does not deploy production infrastructure,
change the tool catalog, proxy MCP traffic, or begin Phase 2.0.6.

## Required gates

| Area | Required evidence |
|---|---|
| Discovery | Exact path-specific PRM, exact issuer/resource/scopes, content-free document, 401 Bearer `resource_metadata` challenge |
| Token | RS256 `at+jwt`; public `kid`; signature; exact issuer and single-string audience; integer times; 300-second maximum lifetime |
| Binding | Exact tenant/site/grant/client; active local grant; current local user; canonical ordered scope subset |
| JOSE attacks | Reject `none`, wrong `typ`, unknown/revoked `kid`, `crit`, `jku`, embedded `jwk`, `x5u`, malformed and oversized tokens |
| Scope | One frozen scope for each ordered tool; deny before the original callback; never bypass existing WordPress checks |
| Dual auth | Application Password path unchanged; valid Bearer does not require Application Password support; failed Bearer never cross-falls back |
| Lifecycle | Local grant/JTI/key/site/subject revoke, user deletion, disconnect, stale JWKS expiry and unknown-key refresh fail closed |
| Isolation | Wrong issuer/audience/tenant/site/grant/client/resource and cross-site tokens are rejected |
| Request state | Local user and OAuth context exist only for one dispatch and are restored on success and failure |
| Privacy | Token/body/content absent from WordPress options, control-plane database, traces, errors and evidence |
| Live path | Real HTTPS WordPress PRM, missing token, KMS Bearer read, insufficient scope, capability denial and direct MCP request |
| Regression | Platform check/audit/SBOM and connector test/lint/audit/package/Plugin Check pass |

## External acceptance

The live token must be issued by the accepted provider profile using each of
the two accepted AWS KMS RSA test keys during overlap. Codex must discover the
resource, complete OAuth through the platform and send the MCP request directly
to WordPress. A redacted trace must prove the control plane received no MCP
request body or result.

## Exit rule

All deterministic and live gates must pass. Temporary hosts, trust, containers,
credentials and test grants must be removed and verified. Any unresolved live
KMS, browser/client, Plugin Check, cleanup, or privacy gate keeps Phase 2.0.5
open. Production deployment and Phase 2.0.6 require separate approval.
