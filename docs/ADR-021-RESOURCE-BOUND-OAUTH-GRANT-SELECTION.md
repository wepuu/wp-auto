# ADR-021: Resource-bound OAuth Grant selection

- Status: local implementation candidate; not approved for production deployment
- Date: 2026-10-14 (Asia/Shanghai)
- Scope: preserve independent per-Site platform Grants under one OAuth Client

## Evidence and decision

oidc-provider 9.12.2's default `loadExistingGrant` prefers the resumed Consent
result and otherwise selects the last Grant stored in the browser Session for
the Client. WPAuto's business binding is narrower: account, Client, canonical
resource and exact MCP scope. The real Authorization HTTP/PostgreSQL regression
on unmodified runtime confirmed that A followed by B can select A's Provider
Grant even after B's independent business Consent becomes active. The existing
`consentGrantUpdatePlan` mismatch guard correctly rejects this state.

Install the official `loadExistingGrant` configuration hook in the production
Authorization configuration. Select through the existing authoritative
`PostgresAuthorizationGrantRepository.resolveExact`, not the Session pointer.
Validate the loaded Provider Grant's ID, account, Client, sole resource and
exact scope. An explicit resumed Consent Grant must also match that binding.
No hook writes a Grant, broadens scopes, or accepts another resource.

No business authorization or no persisted Provider Grant means normal formal
Consent is still required. Business authorization without a Provider artifact
is not treated as corrupt by itself. A missing Provider artifact in a submitted
Consent result, ambiguous lookup, corrupt binding or database error fails closed.
Provider Grants remain one-to-one with independent platform Grants and retain
their existing IDs. The application does not mutate Provider Session internals.

## Compatibility and failure behavior

No public OAuth endpoints, JWT claims/audiences, schema, migrations, Client
metadata, signing, PKCE, refresh/replay/revocation or Connector contracts change.
Generic Provider construction keeps the optional hook interface for existing
isolated callers; the actual Authorization Service always supplies the exact
resolver. Existing active business Grants and valid Provider artifacts can be
reused without changing business timestamps. Missing artifacts are established
through normal Consent, not SQL recovery.

Provider's native Session-bound Authorization Code check remains intact. When
an A Code is already issued and B subsequently becomes the same Session's
Client Grant, deferred exchange of that A Code fails `invalid_grant`; it must
never issue a B Token. Sequential immediate exchanges and interleaved pending
Consent flows are covered separately. This candidate does not disable
`expiresWithSession`, clear browser cookies, or request offline_access to evade
that rule. Logout/token lifetime behavior is not broadened.

Known internal failures produce an explicit allowlisted stage/category record,
with UTC time and fixed event only. Unknown failures are classified by bounded
operation stage. Causes, IDs, accounts, URLs, protocol secrets and exception
text are never serialized. External errors remain generic.

## Data boundary, rollout and rollback

The resolver reads business control metadata only. No WordPress content, MCP
parameters or tool results enter the platform. Test Consent proofs are local
synthetic control metadata; production credentials are not used.

This candidate requires real HTTP/PostgreSQL and existing lifecycle/OCI CI
regressions. It is not a deployment authorization. A future production hotfix
must start from the verified currently running Authorization source baseline,
retain migrations 001-013 and exclude P4-A/Control/Connector changes. Publish or
deploy nothing in this implementation round.

Rollback is restoration of the previous fixed Authorization image, without
schema/data rollback. It may restore the known cross-Site authorization denial;
it must not relax mismatch guards or manually repair/revoke existing Grants.
Any production rollout, reacceptance or Grant cleanup remains separately gated.

## Rejected shortcuts

- Removing the mismatch guard or sharing A's platform Grant with B.
- Per-Site Clients, forced logout, cookie clearing or scope expansion as a workaround.
- Editing node_modules, Session internals, migration 014 or a new Grant/Session table.
- Disabling Session-bound Code checks to make parallel callback tests pass.

The local mechanism proof does not retrospectively prove the exact historical
production exception; #57 retains that failure and its evidence gap.
