# P3-B1B exact Codex Desktop callback compatibility validation

Date: 2026-10-13

## Scope and status

This record covers the local implementation and validation of the narrowly
scoped metadata operation proposed after the first real Windows Codex Desktop
OAuth attempt failed closed with `invalid_redirect_uri`. It does not record a
production database change, Authorization Service restart, second Desktop
OAuth attempt, Grant change, service deployment, migration 014 or Connector
change.

The historical failure remains recorded in
`P3B1B_CODEX_DESKTOP_CALLBACK_MISMATCH_2026-10-13.md`. The callback-specific
identifier, dynamic port, authorization state and full authorization URL are
not recorded in this document, logs, test output or committed fixtures.

## Implemented boundary

The fixed-purpose database operation can add or remove one exact additional
redirect on the existing `wepuu-e2e-codex` client:

- the stable `http://127.0.0.1/callback` redirect remains registered;
- the additional redirect must have the exact shape
  `http://127.0.0.1/callback/<base64url-id>`;
- ports, query strings, fragments, userinfo, `localhost`, IPv6 and extra path
  levels are rejected;
- registration accepts only the known production baseline or the exact
  completed state;
- removal accepts the same two states and restores the original redirect list
  and original metadata digest;
- a transaction advisory lock and row lock make registration, repetition and
  rollback atomic and idempotent; and
- only redirect metadata and its SHA-256 digest are updated. Grants and OAuth
  artifacts are not read or modified by the operation.

The CLI exposes only `register-p3b1-codex-callback` and
`remove-p3b1-codex-callback` for this change. It takes the exact callback from
an absolute, regular, non-symlink file. In production the file must be under
`/run/secrets/` with no group or other permission bits. Output contains only a
change flag, fixed client ID, redirect count and digests; it never returns the
callback URI or identifier.

The Desktop preflight generator can consume the same one-line file and write
the exact callback to its isolated project configuration. It still does not
read or copy the user's global Codex configuration, credential store or
`auth.json`.

## Validation evidence

- TypeScript typecheck: passed.
- ESLint: passed.
- Focused callback/preflight/provider tests: passed.
- Isolated PostgreSQL 16 integration: passed. The callback operation adds no
  migration and changes no schema.
- Concurrent registration produced one change and one idempotent no-op.
- Exact removal restored the original redirect list and legacy metadata
  digest.
- An unexpected client status, digest or redirect set failed closed.
- The existing test Grant's ID, status, scopes, resource binding,
  `updated_at` and revocation reason remained unchanged through registration
  and removal.
- Provider tests accepted dynamic loopback ports only for the two exact
  registered paths and rejected other identifiers, paths, queries, hosts and
  schemes.

The complete repository gate finished with 116 passed, 18 existing
environment-gated tests skipped and 0 failed. The hosted CI result will be
recorded on the implementation pull request. The high-severity dependency
audit found no known vulnerabilities, the generated CycloneDX SBOM validated
with 286 components, and the OCI signing/runtime gate passed against the local
Authorization candidate. No test disables TLS verification or relaxes PKCE,
issuer, resource, redirect, Grant or scope validation.

## Production operation remains gated

Production still has only the stable redirect and continues to run the fixed
pre-P4-A Authorization image. A production update requires separate approval,
a verified database backup, the digest-pinned one-shot CLI image, an exact
post-write comparison, and a restart of the unchanged production
Authorization image. A second real Desktop OAuth attempt requires another
separate approval after that operation succeeds.

Current status remains:

```text
CODEX_DESKTOP_OAUTH_PASS=False
CODEX_DESKTOP_TOOL_COUNT=not_run
CODEX_DESKTOP_SITE_HEALTH_PASS=False
CODEX_DESKTOP_DIRECT_WORDPRESS_PASS=False
P3_CORE_OAUTH_MCP_PASS=True
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
