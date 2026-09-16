# Future WordPress Connector Changes

This document is a change contract for a later, separately approved task. Phase 2.0.0 does not modify `D:\Codex\wp-auto-connector`.

Reference baseline: Phase 1.7.5, commit `1dd26511c792c0bcf82539f3ba674139a567facd`.

## Frozen behavior

The MCP server ID remains `wp-auto-direct`, the endpoint remains `/wp-json/wp-auto/mcp` unless a later migration ADR says otherwise, and the ordered tool catalog remains exactly:

1. `site-health`
2. `site-info`
3. `posts-search`
4. `post-get`
5. `pages-search`
6. `page-get`
7. `categories-list`
8. `tags-list`
9. `post-create-draft`
10. `page-create-draft`
11. `post-update`
12. `page-update`
13. `media-search`
14. `media-get`
15. `media-upload`
16. `media-update`
17. `media-set-featured`
18. `media-import-url`
19. `category-create`
20. `tag-create`
21. `taxonomy-assign`
22. `seo-get`
23. `seo-update`

OAuth work must not add, remove, rename, reorder, proxy, or change the input/output behavior of these tools. Existing WordPress capability/object checks, draft restrictions, optimistic concurrency, idempotency, audits, URL-import SSRF protections, and failure behavior remain authoritative.

## Authentication strategy change

The current transport permission check assumes Application Password support and an already authenticated WordPress user. Future implementation should introduce explicit authentication methods:

```text
request
  ├─ valid WordPress Core Application Password identity
  │    └─ existing transport policy
  └─ valid WePuu Bearer identity
       └─ exact token validation
          └─ active grant_id → local wp_user_id
             └─ install request-scoped current user
```

The unconditional `wp_is_application_passwords_supported()` requirement applies only to the Application Password path. It must not accidentally disable a separately configured Bearer path, and enabling OAuth must not disable or rewrite the Application Password path.

Bearer authentication must run early enough to establish the request-local WordPress user before the existing MCP permission and ability callbacks, but it must not persist a global user session, set a browser cookie, or create a WordPress Application Password.

## Proposed internal boundaries

Names are illustrative, not approved code:

- transport authenticator coordinator;
- Application Password authentication result adapter;
- Bearer parser and bounded token decoder;
- issuer/JWKS trust configuration;
- signature/claims validator;
- local grant repository and user resolver;
- scope-to-tool-category policy;
- pairing and consent controller;
- revocation-event verifier and local denylist;
- PRM publisher and Bearer challenge formatter.

Cryptographic verification must use a maintained JOSE library selected after dependency and license review. Do not write ASN.1, RSA/ECDSA, JWK, JWT, base64url, constant-time comparison, or OAuth primitives from scratch where a reviewed implementation exists.

## Local validation requirements

After token validation, the connector must confirm:

- paired integration is enabled and not suspended;
- exact issuer, resource, site ID, and allowed algorithm;
- active local grant mapped to one current user on this site;
- user still exists and is locally usable;
- token/grant/key are not locally revoked;
- tool belongs to an approved scope;
- existing transport baseline and tool-specific WordPress permissions pass.

Do not trust token roles/capabilities. Do not create a synthetic administrator. Do not fall back from a failed Bearer credential to an ambient cookie or Application Password identity.

## WordPress admin UX

- OAuth/platform integration is disabled by default.
- Settings are protected by `manage_options` and nonces.
- Before the first external request, explain the service, data sent, purpose, Terms URL, Privacy URL, and disconnect behavior.
- “Connect” is a deliberate button action, not activation-time or page-load behavior.
- Show exact connected host/resource, platform issuer, status, last control contact, grants visible to the local user/admin policy, and local revoke/disconnect controls.
- Do not claim a connection is healthy solely because the platform account is logged in.
- Application Password diagnostics and setup remain available independently.

## Storage boundaries

Allowed local storage:

- issuer/resource/site ID and connection status;
- pending pairing hash/expiry;
- opaque grant-to-user mapping and scope/status;
- JWKS public cache and metadata;
- bounded revocation/idempotency state.

Forbidden:

- platform password/session token beyond narrowly scoped protocol state;
- plaintext access/refresh tokens;
- replicated platform account email;
- remote capability snapshots;
- MCP request or content capture for platform use.

## Failure and rollback matrix

| Condition | Bearer behavior | Application Password behavior |
|---|---|---|
| OAuth disabled/not paired | unavailable, fail closed | unchanged |
| Platform unavailable | unexpired token may use safe cached JWKS; no refresh/pairing | unchanged |
| JWKS unknown/stale beyond safe window | reject | unchanged |
| Local grant revoked/user invalid | reject immediately | independent Core result |
| Scope insufficient | reject before tool execution | existing permission behavior |
| Plugin disconnect | delete/disable OAuth trust and mappings | unchanged |

## Separate implementation acceptance gate

- Full existing connector suite remains green.
- New tests cover both authentication paths and prohibit cross-fallback.
- Tool catalog hash/order and schemas are unchanged.
- Capability/object tests prove OAuth cannot elevate permissions.
- Exact issuer/audience/site/grant tests include adversarial canonicalization cases.
- Rotation, stale cache, revoke, user deletion/demotion, multisite, and platform-outage tests pass.
- Plugin Check and WordPress.org disclosure are clean.
- No network call occurs before opt-in.
- Connector changes receive independent approval, review, commit, and release handling.
