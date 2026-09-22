# ADR-003: OAuth engine selection gate

- Status: accepted for Phase 2.0.2 implementation; production release remains gated
- Date: 2026-09-16

## Decision

Use a mature Authorization Server behind an internal provider-neutral adapter.
Phase 2.0.2 selects pinned `node-oidc-provider` 9.12.2 as the authorization
engine behind that boundary. Auth0 was the managed comparison candidate, but tenant
`dev-o173hfg1cbmd0crj` is rejected for the frozen profile because it advertises
and accepts `plain` PKCE. The negative result is recorded in
[PHASE_2_0_1_EVIDENCE.json](PHASE_2_0_1_EVIDENCE.json). No audience or PKCE
compatibility shim may weaken the contract.

The provider's experimental `ExternalSigningKey` boundary is permitted only
behind the internal key-custody adapter. Its live AWS KMS contract passed on
2026-09-21. Rotation, JWKS, PHP interoperability, and independent security
qualification remain required before production release. Failure cannot fall
back to an in-process or file-based private key.

## Required interface boundary

The future platform owns tenant, site, resource, client, grant, subject, scope
ceiling, refresh-family, key-lifecycle, revocation, and redacted audit concepts.
Provider IDs, private tables, SDK objects, and private claims do not cross this
boundary.

## Hard selection gates

The selected candidate must demonstrate Authorization Code + PKCE S256, exact
redirects and issuer, RFC 8707 resource and single audience, PRM/AS metadata,
safe registration policy, rotating refresh with reuse detection, revocation,
overlapping JWKS keys, minimum opaque claims, tenant-safe errors, and a direct
client-to-WordPress data plane.

A candidate is rejected if it requires broad origin audiences, token passthrough,
mismatched resources, disabled issuer/PKCE/signature checks, WordPress content or
credentials in the control plane, or custom cryptography to bridge an API gap.

## Evaluation weights

| Criterion | Weight |
|---|---:|
| OAuth/MCP security contract | 35% |
| Exact resource/audience control | 20% |
| Codex/WorkBuddy interoperability | 15% |
| Data and tenant boundary | 10% |
| Operations and recovery | 10% |
| Supply chain/license/replacability | 5% |
| Cost and lock-in | 5% |

Hard-gate failure overrides the weighted score.

## Candidate evidence

`node-oidc-provider` passed the isolated provider-neutral suite, PostgreSQL
restart checks, bounded JWKS behavior, direct-resource simulation, and PHP JOSE
fixture. It still requires KMS-backed key custody, distributed state review, and
independent security review before production use.

Auth0 metadata, exact-resource rejection, issuer response, redirect rejection,
and DCR were observed. Its `plain` PKCE behavior is a hard failure, so Auth0 is
not a fallback for this profile unless a future tenant enforces S256-only and
passes the same suite.

The provisional weighted result is 95/100 for `node-oidc-provider`: 35/35
security contract, 20/20 resource/audience, 10/15 client interoperability,
10/10 data boundary, 10/10 operations/recovery, 5/5 supply chain, and 5/5
cost/lock-in. The missing five points are WorkBuddy 5.5.2 incompatibility;
Codex 0.154.0 completed the pre-registered native-client Authorization Code
path with S256 and a constrained dynamic loopback callback port. Auth0 is not
rescued by a weighted score;
its N04 hard-gate failure rejects it before scoring.

## Consequences

The platform can change providers without changing WordPress or client-facing
contracts. The cost is maintaining the adapter and rerunning the full suite for
every provider or version change.

## References

- [node-oidc-provider](https://github.com/panva/node-oidc-provider)
- [Auth0 Dynamic Client Registration](https://auth0.com/docs/get-started/applications/dynamic-client-registration)
- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
