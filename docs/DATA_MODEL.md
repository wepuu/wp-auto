# Minimum Data Model

This is a logical model, not a migration specification. Names and field types may change only if the security properties remain intact.

## Data classification

| Class | Examples | Rule |
|---|---|---|
| Secret | authorization code, pairing verifier, refresh token | never store plaintext; hash immediately; never log |
| Key material | signing private key | KMS/HSM only; database stores reference, public metadata |
| Restricted identity | platform account email, MFA state | encrypt as appropriate; least privilege; explicit retention |
| Control metadata | tenant/site/grant/client IDs, canonical resource | tenant scoped; audit access; no content enrichment |
| Public protocol | issuer metadata, JWKS public keys | cacheable and intentionally public |
| Forbidden platform data | WP passwords/APs, content, SEO/media/email/tool payloads, WP user IDs/roles/caps | reject, redact, and treat receipt as incident |

## Platform entities

### tenants

- `id`
- `status`
- `created_at`, `updated_at`, `deleted_at`
- policy references such as region/retention, once approved

### accounts

- `id`
- exact login-provider issuer and an HMAC-SHA-256 digest of `issuer || NUL || sub`
- MFA/recovery status references
- lifecycle timestamps

The raw external `sub`, provider profile, email, access token, refresh token, and
ID token are not stored. The HMAC key is separate from cookie and signing keys.
This is platform identity only; it must not be conflated with WordPress identity.

### tenant_memberships

- `tenant_id`, `account_id`
- platform role and status
- created/revoked timestamps

All authorization derives tenant context server-side. Composite tenant foreign keys or equivalent RLS protections are required.

### sites

- `tenant_id`, `id` (`site_id`)
- exact canonical `resource_uri`
- normalized display hostname, optional user-supplied display label
- pairing/status/version fields
- connector protocol version and last control-plane contact time
- created, suspended, revoked, deleted timestamps

Do not crawl or import site title/content automatically. A resource URI is operational metadata and must have a documented retention period.

### pairing_attempts

- `tenant_id`, `id`, initiator account, proposed resource
- hash of verifier/state material
- expiry, consumed timestamp, attempt status
- bounded failure metadata and correlation ID

Attempts are short-lived and aggressively purged.

Phase 2.0.3 stores a SHA-256 verifier digest, never the verifier, and binds the
attempt to one initiator and correlation ID. Completed attempts reference a
site through a composite tenant/site foreign key.

### oauth_clients

- client identifier and registration mode: pre-registered, CIMD, or DCR
- validated redirect URIs and metadata digest
- status, approved capabilities, registration timestamps
- no client secret for public native clients

### grants

- `tenant_id`, `id` (`grant_id`), `site_id`, platform `subject_id`, client binding
- approved scope ceiling and status
- consent/version timestamps
- revocation reason code and timestamp

The platform record does not contain `wp_user_id`, WordPress email, username, role, or capability snapshot.

Pending grants store only a consent challenge digest and short expiry. Paired
sites store an Ed25519 public JWK and thumbprint; the site private key remains
WordPress-local. Platform account sessions store only a SHA-256 session-token
digest, upstream issuer, authentication/expiry timestamps, and revocation time.
They are read and written through separate least-privilege non-login database
roles. Plain session tokens and OIDC transaction state never enter PostgreSQL.

Migration `004_grant_reconsent.sql` replaces the original permanent
tenant/site/subject/client uniqueness constraint with a partial unique index
over `pending`, `active`, and `suspended` rows. This preserves one live grant
while allowing a new explicit consent after a prior row is revoked. Completion
idempotency records retain only a request digest and opaque result reference.
The raw grant challenge is deterministically recoverable for an identical
bounded retry only by the control process using the dedicated grant-idempotency
HMAC key; neither the key nor raw challenge is persisted.

### authorization_transactions and authorization_codes

- tenant/client/site/resource/grant bindings
- redirect URI and PKCE challenge/method
- approved scopes and expiries
- code hash, consumed timestamp, transaction state

Short TTL and partitioned purge are required. Plain codes are never persisted.

### refresh_token_families and refresh_tokens

- family: tenant, grant, client, resource, subject, scope ceiling, status, generation, absolute/inactivity expiry
- token: keyed/token hash, family, generation, issued/used/revoked timestamps

Rotation uses a serializable or otherwise proven atomic transition. Used token hashes remain only as long as needed for replay detection and incident analysis.

### signing_keys

- `kid`, algorithm, public JWK/thumbprint
- KMS/HSM key reference, never private key bytes
- publish, activate, retire, revoke, and delete timestamps
- lifecycle/status and rotation correlation ID

### revocation_events and outbox_events

- tenant/site/grant/family/key target identifiers
- monotonic sequence per site where practical
- reason code, created timestamp, delivery state, attempt count
- signed payload digest and idempotency key

Payloads contain no WordPress content or user identity.

### security_audit_events

- actor category and opaque actor ID
- tenant/site/client/grant identifiers where needed
- action, outcome, reason code, timestamp, correlation ID
- source risk metadata minimized and retained by approved policy

Request/response bodies, secrets, tokens, content, and raw authorization headers are prohibited.

## WordPress-local entities

Future connector storage should keep:

- paired issuer, exact resource, opaque site ID, protocol version, status;
- pending pairing attempt hash and expiry;
- `grant_id → wp_user_id` mapping, local scope ceiling, status, consent version;
- JWKS public cache with fetch/expiry metadata;
- temporary revoked `jti`/`kid` records;
- revocation event cursor/idempotency records.

These records are WordPress-local and protected using WordPress authorization and storage conventions. They must not be synchronized to the platform beyond opaque status and identifiers.

## Tenant-isolation constraints

- Tenant-owned tables carry `tenant_id` even when it appears derivable through another relationship.
- Unique constraints include tenant where global uniqueness is not required.
- Queries cannot accept a tenant ID from the request as proof of membership.
- Background jobs, caches, idempotency keys, object storage, logs, and outbox partitions include tenant context.
- Cross-tenant administration uses a separately audited support boundary, not a hidden query option.

## Retention and deletion

Exact durations are a Phase 2.0.7 policy decision. The implementation must nevertheless support:

- immediate invalidation plus asynchronous verified purge;
- short automatic expiry for pairing and authorization transactions;
- refresh replay markers retained only for the security window;
- deletion tombstones that do not contain original secrets/content;
- backup expiry and restoration procedures that reapply tombstones;
- export and deletion reports that never expose secret hashes as reusable identifiers.
