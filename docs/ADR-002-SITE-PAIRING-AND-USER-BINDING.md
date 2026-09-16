# ADR-002: Site pairing and local WordPress user binding

- Status: accepted for Phase 2.0.0
- Date: 2026-09-15

## Context

A platform account is not a WordPress identity. An administrator's decision to connect a site also must not silently authorize every local user or every platform member. WordPress is the only authority that can establish a current local user and evaluate that user's capabilities.

## Decision

Separate site pairing from user authorization:

- Pairing is an explicit, `manage_options`-protected WordPress administrator action.
- Pairing binds one `site_id` to one exact canonical MCP endpoint.
- User authorization requires a separate local WordPress login and explicit consent.
- WordPress stores `grant_id → wp_user_id`; the platform stores only the opaque `grant_id`, site, subject, client, scope, and lifecycle state.
- The platform does not receive the WordPress username, user ID, email, roles, passwords, Application Passwords, or capability snapshot.

For WordPress Multisite, each blog/site receives a separate `site_id`, resource URI, pairing, and grant namespace. Network-wide wildcard audience is prohibited.

## Pairing protocol requirements

1. The administrator starts pairing from wp-admin; no automatic external request occurs before this action.
2. WordPress creates a high-entropy verifier and state, stores only a hash with a short expiry, and marks it single-use.
3. Browser navigation identifies the platform issuer and opaque attempt, not a WordPress credential.
4. The platform authenticates the platform account and records explicit consent to contact the site.
5. Site verification uses a bounded, SSRF-resistant protocol:
   - HTTPS in production;
   - normalized public hostname and allowed port;
   - resolution checks against private, loopback, link-local, reserved, and metadata ranges;
   - connection to a validated resolved address while preserving TLS hostname verification;
   - no redirects, or only same-origin redirects explicitly covered by a future protocol revision;
   - bounded size, time, and response schema.
6. WordPress returns proof bound to attempt, issuer, canonical resource, and expiry.
7. Both sides commit once; replay or partial completion is idempotently rejected or reconciled.

The exact proof format and platform authentication method are reserved for Phase 2.0.1/2.0.3. They must use a mature signing/MAC primitive and must not derive long-term trust from a browser bearer value alone.

## Local user consent

Consent must show:

- platform/service name;
- MCP client identity where available;
- exact paired site;
- requested scope categories;
- that MCP requests go directly to the site;
- how to revoke access locally and on the platform.

The local grant is inactive unless the mapped user exists, belongs to the site as required, is not deleted/spam-marked, and the grant is active. Tool execution always rechecks current capabilities; stored roles or capability snapshots are not authoritative.

## Lifecycle

- Local revoke: disable mapping immediately and notify the platform when available.
- Platform revoke: revoke refresh families and send a signed idempotent event to WordPress.
- User deletion or invalidation: mapping fails closed; refresh is rejected when state is synchronized.
- Capability demotion: takes effect on the next MCP tool call through existing checks.
- Domain, scheme, port, path, or canonical endpoint change: suspend and re-pair.
- Tenant transfer: requires explicit detach and new pairing; do not mutate tenant ownership in place.
- Plugin disabled/uninstalled: no Bearer path is available. Reinstall recovery must not automatically revive old grants without verified local state.

## Consequences

This design avoids a global administrator-to-user impersonation bridge and keeps WordPress identity data local. It adds a browser round trip to WordPress during consent and requires careful recovery UX when the user is not logged in locally.

## Rejected alternatives

- Administrator pairs the site and thereby authorizes all local users: rejected as excessive privilege.
- Platform account email automatically maps to matching WordPress email: rejected because email equality is not proof of account control and would leak identity data.
- Store WordPress user IDs or roles in access tokens: rejected because identifiers leak and authorization becomes stale.
- Silently update audience after domain change: rejected because it enables ownership-transfer and confused-deputy attacks.
