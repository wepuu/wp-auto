DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_session_reader') THEN
    CREATE ROLE wepuu_session_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER TABLE audit.security_events DROP CONSTRAINT IF EXISTS security_events_event_name_check;
ALTER TABLE audit.security_events ADD CONSTRAINT security_events_event_name_check CHECK (event_name IN (
  'account.authentication_denied', 'tenant.access_denied', 'oauth.authorization_denied',
  'oauth.code_replay_detected', 'oauth.refresh_replay_detected', 'oauth.token_issued',
  'key.signing_failed', 'key.rotation_observed', 'pairing.started', 'pairing.verified',
  'pairing.denied', 'grant.created', 'grant.revoked', 'site.disconnected'
));
ALTER TABLE audit.security_events DROP CONSTRAINT IF EXISTS security_events_reason_check;
ALTER TABLE audit.security_events ADD CONSTRAINT security_events_reason_check CHECK (reason IN (
  'none', 'identity_missing', 'membership_missing', 'tenant_context_missing', 'binding_mismatch',
  'replay', 'kms_unavailable', 'invalid_input', 'unsafe_event_rejected', 'ssrf_blocked',
  'proof_invalid', 'expired', 'idempotency_conflict', 'site_suspended', 'consent_denied'
));

CREATE TABLE IF NOT EXISTS platform.sites (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{8,128}$'),
  resource_uri text NOT NULL CHECK (resource_uri ~ '^https://'),
  display_hostname text NOT NULL CHECK (length(display_hostname) BETWEEN 1 AND 253),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'deleted')),
  protocol_version text NOT NULL CHECK (protocol_version = '1'),
  site_public_jwk jsonb,
  site_key_thumbprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  revoked_at timestamptz,
  deleted_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CHECK (status <> 'active' OR (site_public_jwk IS NOT NULL AND site_key_thumbprint IS NOT NULL)),
  CHECK (site_public_jwk IS NULL OR (
    site_public_jwk->>'kty' = 'OKP' AND site_public_jwk->>'crv' = 'Ed25519'
    AND NOT (site_public_jwk ?| ARRAY['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'])
  ))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_site_per_resource_idx
  ON platform.sites (resource_uri)
  WHERE status IN ('pending', 'active', 'suspended');

CREATE TABLE IF NOT EXISTS platform.pairing_attempts (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{8,128}$'),
  initiator_account_id text NOT NULL REFERENCES platform.accounts(id),
  proposed_resource text NOT NULL CHECK (proposed_resource ~ '^https://'),
  verifier_hash bytea NOT NULL CHECK (octet_length(verifier_hash) = 32),
  status text NOT NULL CHECK (status IN ('pending', 'verifying', 'active', 'expired', 'cancelled', 'failed')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  site_id text,
  failure_code text,
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES platform.sites(tenant_id, id),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS pairing_attempts_expiry_idx
  ON platform.pairing_attempts (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.grants (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{8,128}$'),
  site_id text NOT NULL,
  subject_id text NOT NULL CHECK (subject_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 8 AND 256 AND client_id ~ '^[A-Za-z0-9._~-]+$'),
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 16),
  consent_challenge_hash bytea NOT NULL CHECK (octet_length(consent_challenge_hash) = 32),
  consent_expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  consent_version text NOT NULL CHECK (consent_version ~ '^[0-9]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason text,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES platform.sites(tenant_id, id),
  UNIQUE (tenant_id, site_id, subject_id, client_id)
);

CREATE TABLE IF NOT EXISTS platform.idempotency_records (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  operation text NOT NULL CHECK (operation IN ('pairing.complete', 'grant.complete', 'grant.revoke', 'site.disconnect')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_digest bytea NOT NULL CHECK (octet_length(request_digest) = 32),
  result_reference text NOT NULL CHECK (result_reference ~ '^[A-Za-z0-9_-]{8,128}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS platform.account_sessions (
  session_hash bytea PRIMARY KEY CHECK (octet_length(session_hash) = 32),
  account_id text NOT NULL REFERENCES platform.accounts(id),
  identity_issuer text NOT NULL,
  authenticated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > authenticated_at)
);

ALTER TABLE platform.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sites FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.pairing_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.pairing_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.grants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.idempotency_records FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform.has_tenant_role(target_tenant uuid, target_account text, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.tenant_memberships membership
    WHERE membership.tenant_id = target_tenant
      AND membership.account_id = target_account
      AND membership.status = 'active'
      AND membership.role = ANY(allowed_roles)
  )
$$;
REVOKE ALL ON FUNCTION platform.has_tenant_role(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.has_tenant_role(uuid, text, text[]) TO wepuu_control;

CREATE POLICY site_tenant_select ON platform.sites FOR SELECT TO wepuu_control
  USING (tenant_id = platform.current_tenant_id() AND platform.has_active_membership(tenant_id, platform.current_account_id()));
CREATE POLICY site_tenant_insert ON platform.sites FOR INSERT TO wepuu_control
  WITH CHECK (tenant_id = platform.current_tenant_id() AND platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator']));
CREATE POLICY site_tenant_update ON platform.sites FOR UPDATE TO wepuu_control
  USING (tenant_id = platform.current_tenant_id() AND platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator']))
  WITH CHECK (tenant_id = platform.current_tenant_id() AND platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator']));
CREATE POLICY pairing_tenant_access ON platform.pairing_attempts TO wepuu_control
  USING (tenant_id = platform.current_tenant_id() AND initiator_account_id = platform.current_account_id()
    AND platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator']))
  WITH CHECK (tenant_id = platform.current_tenant_id() AND initiator_account_id = platform.current_account_id()
    AND platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator']));
CREATE POLICY grant_tenant_access ON platform.grants TO wepuu_control
  USING (tenant_id = platform.current_tenant_id() AND (
    subject_id = platform.current_account_id()
    OR platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator'])
  ))
  WITH CHECK (tenant_id = platform.current_tenant_id() AND (
    subject_id = platform.current_account_id()
    OR platform.has_tenant_role(tenant_id, platform.current_account_id(), ARRAY['owner', 'administrator'])
  ));
CREATE POLICY idempotency_tenant_access ON platform.idempotency_records TO wepuu_control
  USING (tenant_id = platform.current_tenant_id() AND platform.has_active_membership(tenant_id, platform.current_account_id()))
  WITH CHECK (tenant_id = platform.current_tenant_id() AND platform.has_active_membership(tenant_id, platform.current_account_id()));

CREATE POLICY site_auth_read ON platform.sites FOR SELECT TO wepuu_auth USING (status = 'active');
CREATE POLICY grant_auth_read ON platform.grants FOR SELECT TO wepuu_auth USING (status = 'active');

GRANT SELECT, INSERT, UPDATE ON platform.sites, platform.pairing_attempts, platform.grants, platform.idempotency_records TO wepuu_control;
GRANT USAGE ON SCHEMA platform TO wepuu_auth;
GRANT SELECT ON platform.sites, platform.grants TO wepuu_auth;
GRANT USAGE ON SCHEMA platform TO wepuu_session_reader;
GRANT SELECT ON platform.account_sessions, platform.accounts TO wepuu_session_reader;
REVOKE ALL ON platform.sites, platform.pairing_attempts, platform.grants, platform.idempotency_records, platform.account_sessions FROM PUBLIC;
