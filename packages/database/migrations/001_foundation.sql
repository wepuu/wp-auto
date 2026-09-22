DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_control') THEN
    CREATE ROLE wepuu_control NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_auth') THEN
    CREATE ROLE wepuu_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_audit_writer') THEN
    CREATE ROLE wepuu_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS oauth;
CREATE SCHEMA IF NOT EXISTS audit;

REVOKE ALL ON SCHEMA platform, oauth, audit FROM PUBLIC;

CREATE TABLE IF NOT EXISTS platform.accounts (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{8,128}$'),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  identity_issuer text NOT NULL,
  identity_subject_hash text NOT NULL CHECK (length(identity_subject_hash) BETWEEN 32 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.tenants (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS platform.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  account_id text NOT NULL REFERENCES platform.accounts(id),
  role text NOT NULL CHECK (role IN ('owner', 'administrator', 'member')),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, account_id)
);

CREATE OR REPLACE FUNCTION platform.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION platform.current_account_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.account_id', true), '')
$$;

CREATE OR REPLACE FUNCTION platform.has_active_membership(target_tenant uuid, target_account text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.tenant_memberships membership
    WHERE membership.tenant_id = target_tenant
      AND membership.account_id = target_account
      AND membership.status = 'active'
  )
$$;

REVOKE ALL ON FUNCTION platform.has_active_membership(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.has_active_membership(uuid, text) TO wepuu_control;

CREATE TABLE IF NOT EXISTS oauth.clients (
  client_id text PRIMARY KEY CHECK (client_id ~ '^[A-Za-z0-9._~-]{8,256}$'),
  registration_mode text NOT NULL CHECK (registration_mode IN ('pre-registered', 'cimd', 'dcr')),
  redirect_uris jsonb NOT NULL CHECK (jsonb_typeof(redirect_uris) = 'array'),
  metadata_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth.provider_artifacts (
  model text NOT NULL,
  artifact_id text NOT NULL,
  tenant_id uuid,
  partition_kind text NOT NULL CHECK (partition_kind IN ('global', 'tenant')),
  payload jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, artifact_id),
  CHECK (
    (partition_kind = 'global' AND tenant_id IS NULL) OR
    (partition_kind = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_artifacts_expiry_idx ON oauth.provider_artifacts (expires_at);
CREATE INDEX IF NOT EXISTS provider_artifacts_tenant_idx ON oauth.provider_artifacts (tenant_id, model);
CREATE INDEX IF NOT EXISTS provider_artifacts_grant_idx ON oauth.provider_artifacts ((payload->>'grantId'));
CREATE INDEX IF NOT EXISTS provider_artifacts_uid_idx ON oauth.provider_artifacts ((payload->>'uid'));
CREATE INDEX IF NOT EXISTS provider_artifacts_user_code_idx ON oauth.provider_artifacts ((payload->>'userCode'));

CREATE TABLE IF NOT EXISTS oauth.signing_key_metadata (
  kid text PRIMARY KEY CHECK (kid ~ '^[A-Za-z0-9_-]{8,128}$'),
  algorithm text NOT NULL CHECK (algorithm = 'RS256'),
  custody_provider text NOT NULL CHECK (custody_provider = 'aws-kms'),
  custody_reference text NOT NULL,
  public_jwk jsonb NOT NULL CHECK (
    public_jwk->>'kty' = 'RSA'
    AND public_jwk->>'alg' = 'RS256'
    AND public_jwk->>'use' = 'sig'
    AND NOT (public_jwk ?| ARRAY['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'])
  ),
  status text NOT NULL CHECK (status IN ('published', 'active', 'retiring', 'revoked')),
  publish_at timestamptz NOT NULL,
  activate_at timestamptz,
  retire_at timestamptz,
  revoke_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  occurred_at timestamptz NOT NULL,
  event_name text NOT NULL CHECK (event_name IN (
    'account.authentication_denied',
    'tenant.access_denied',
    'oauth.authorization_denied',
    'oauth.code_replay_detected',
    'oauth.refresh_replay_detected',
    'oauth.token_issued',
    'key.signing_failed',
    'key.rotation_observed'
  )),
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  reason text NOT NULL CHECK (reason IN (
    'none',
    'identity_missing',
    'membership_missing',
    'tenant_context_missing',
    'binding_mismatch',
    'replay',
    'kms_unavailable',
    'invalid_input',
    'unsafe_event_rejected'
  )),
  correlation_id text NOT NULL CHECK (correlation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  actor_id text,
  site_id text,
  client_id text,
  grant_id text,
  service text NOT NULL CHECK (service IN ('authorization-service', 'control-api')),
  service_version text NOT NULL,
  duration_bucket text CHECK (duration_bucket IN ('lt10ms', 'lt100ms', 'lt1s', 'gte1s')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_tenant_time_idx
  ON audit.security_events (tenant_id, occurred_at DESC, id DESC);

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.security_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access ON platform.tenants;
CREATE POLICY tenant_access ON platform.tenants
  USING (
    id = platform.current_tenant_id()
    AND platform.has_active_membership(id, platform.current_account_id())
  );

DROP POLICY IF EXISTS membership_access ON platform.tenant_memberships;
CREATE POLICY membership_access ON platform.tenant_memberships
  USING (
    tenant_id = platform.current_tenant_id()
    AND account_id = platform.current_account_id()
    AND status = 'active'
  );

DROP POLICY IF EXISTS security_event_access ON audit.security_events;
CREATE POLICY security_event_access ON audit.security_events
  USING (
    tenant_id = platform.current_tenant_id()
    AND platform.has_active_membership(tenant_id, platform.current_account_id())
  );

DROP POLICY IF EXISTS security_event_insert ON audit.security_events;
CREATE POLICY security_event_insert ON audit.security_events
  FOR INSERT TO wepuu_audit_writer
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT USAGE ON SCHEMA platform, audit TO wepuu_control;
GRANT SELECT ON platform.tenants, platform.tenant_memberships, audit.security_events TO wepuu_control;
GRANT USAGE ON SCHEMA audit TO wepuu_audit_writer;
GRANT INSERT ON audit.security_events TO wepuu_audit_writer;
GRANT USAGE, SELECT ON SEQUENCE audit.security_events_id_seq TO wepuu_audit_writer;
GRANT USAGE ON SCHEMA oauth TO wepuu_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth.clients, oauth.provider_artifacts, oauth.signing_key_metadata TO wepuu_auth;

REVOKE ALL ON platform.accounts, platform.tenants, platform.tenant_memberships FROM PUBLIC;
REVOKE ALL ON oauth.clients, oauth.provider_artifacts, oauth.signing_key_metadata FROM PUBLIC;
REVOKE ALL ON audit.security_events FROM PUBLIC;
