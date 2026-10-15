# ADR-023: Content-free Site Proof claims diagnostics

Date: 2026-10-16 (Asia/Shanghai). Status: candidate; not deployed.

## Context

The single E1 production pairing failed with `proof.claims_invalid`, after
key/header/signature verification. Its original proof is not retained. WordPress
is locally active with consumed pending state, whereas the platform has no new
Site. This is not evidence of a signature failure or a confirmed clock fault.

## Decision and compatibility

Keep the existing verifier's order, acceptance predicates, HTTP response,
`verification_failed` persistence and security audit unchanged. Add an optional
readonly `detail` to the internal PairingDiagnosticError, projection and Control
diagnostic event. Existing three-argument constructors and non-claims events
remain compatible. Only fixed enums are emitted; no schema errors, original
causes, expected/actual values, proof, JWK/PEM, identifiers, or exception text.

JSON/schema precede expired/future/window checks, then kind, issuer, tenant,
resource, challenge, site/attempt, platform key and other existing bindings.
Report only the first failure. An unexpected exception is `unknown`. The sink
remains best-effort and cannot turn a rejected request into success. Existing
UTC time and opaque correlation ID remain the only non-enum diagnostic fields.
No new metric or public endpoint is added.

No database migration, Connector contract, TTL, clock tolerance, optional-field
policy or cryptographic implementation changes. In particular, existing handling
of unsolicited valid scope and nonpositive intervals is retained, not endorsed
or silently tightened here; the parity test locks diagnostic-only behavior.
Any proposed hardening requires separate review.

## Real signer provenance and limits

The operator-approved original 0.1.0 ZIP is a test-only fixture with its licenses,
locked by SHA-256. It is not installed or repackaged. CI loads its actual
Composer dependencies and signer, using fresh synthetic Ed25519 keys and fixed
times. PHP 8.2.28 Linux amd64 image is pinned to
`php@sha256:4bbc4316a5b4acd689fe791603d5340bed9184d6cb4303c070cf5630711e609a`.
The registry index observed was
`sha256:15fc7109b84b1faf03fb6cf7d86357eed53d3d0c8153a09dd5ecc1aac0a11e2a`.
The retained pinned WordPress PHP 8.1 image is also tested.

No WordPress boot, options or network are used. A minimal parse_url adapter only
covers synthetic URLs, not real REST/FPM/opcache/other-plugin behavior. Proofs
pass only through bounded child pipes in memory, never logs or CI artifacts.
Archive validation precedes extraction. Generated test directories and child
containers are cleaned up. OCI builds exclude the frozen archive and fixtures.

## Rollout and rollback

This PR authorizes no production build, release, deployment or new pairing.
A separately approved diagnostic hotfix must use the actual production Control
source baseline, retain migrations 001–013 + 015, exclude 014/P4-A, and change
only Control. Keep the previous fixed image for code rollback; no database
rollback or Connector state edits are required or permitted by this ADR.
Site local-state recovery and any new pairing require separate plans/authority.

## Data-flow review

Only authentication-proof validation classifications are added to the existing
internal control-plane sink. WordPress content and MCP arguments/results never
enter this code path. No production identity, key, proof or session is read by
the tests. Public errors and audit contracts do not gain claims details.
