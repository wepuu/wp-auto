CREATE TABLE IF NOT EXISTS oauth.secret_artifacts (
  model text NOT NULL,
  lookup_version smallint NOT NULL CHECK (lookup_version BETWEEN 1 AND 32767),
  artifact_hash bytea NOT NULL CHECK (octet_length(artifact_hash) = 32),
  tenant_id uuid,
  partition_kind text NOT NULL CHECK (partition_kind IN ('global', 'tenant')),
  payload jsonb NOT NULL CHECK (NOT (payload ? 'jti')),
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, lookup_version, artifact_hash),
  CHECK (
    (partition_kind = 'global' AND tenant_id IS NULL) OR
    (partition_kind = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS secret_artifacts_expiry_idx
  ON oauth.secret_artifacts (expires_at);
CREATE INDEX IF NOT EXISTS secret_artifacts_grant_idx
  ON oauth.secret_artifacts ((payload->>'grantId'));
CREATE INDEX IF NOT EXISTS secret_artifacts_uid_idx
  ON oauth.secret_artifacts ((payload->>'uid'));
CREATE INDEX IF NOT EXISTS secret_artifacts_user_code_idx
  ON oauth.secret_artifacts ((payload->>'userCode'));

CREATE UNIQUE INDEX IF NOT EXISTS grants_global_id_idx ON platform.grants (id);

CREATE TABLE IF NOT EXISTS oauth.refresh_families (
  family_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  site_id text NOT NULL,
  grant_id text NOT NULL,
  client_id text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  current_generation integer NOT NULL DEFAULT 0 CHECK (current_generation >= 0),
  last_used_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, family_id)
);

CREATE INDEX IF NOT EXISTS refresh_families_grant_idx
  ON oauth.refresh_families (tenant_id, grant_id);

CREATE TABLE IF NOT EXISTS oauth.revocation_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  site_id text NOT NULL,
  resource_uri text NOT NULL,
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('grant', 'site', 'subject', 'token', 'key')),
  grant_id text,
  token_jti_hash bytea CHECK (token_jti_hash IS NULL OR octet_length(token_jti_hash) = 32),
  key_id text,
  reason text NOT NULL,
  not_before timestamptz NOT NULL DEFAULT now(),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, event_sequence)
);

CREATE INDEX IF NOT EXISTS revocation_outbox_pending_idx
  ON oauth.revocation_outbox (not_before, id)
  WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth.rate_limit_buckets (
  policy text NOT NULL,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  window_started_at timestamptz NOT NULL,
  counter integer NOT NULL CHECK (counter > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (policy, subject_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx
  ON oauth.rate_limit_buckets (expires_at);

CREATE OR REPLACE FUNCTION oauth.rotate_refresh_family(
  target_family uuid,
  expected_generation integer,
  observed_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth, platform
AS $$
DECLARE
  family oauth.refresh_families%ROWTYPE;
  resource text;
  next_sequence bigint;
BEGIN
  SELECT * INTO family FROM oauth.refresh_families
  WHERE family_id = target_family
  FOR UPDATE;

  IF NOT FOUND OR family.status <> 'active'
     OR family.last_used_at + interval '30 days' <= observed_at
     OR family.absolute_expires_at <= observed_at THEN
    RETURN 'denied';
  END IF;

  IF family.current_generation = expected_generation THEN
    UPDATE oauth.refresh_families
    SET current_generation = current_generation + 1,
        last_used_at = observed_at,
        updated_at = observed_at
    WHERE family_id = target_family;
    RETURN 'rotated';
  END IF;

  IF family.current_generation > expected_generation THEN
    UPDATE oauth.refresh_families
    SET status = 'revoked', revoked_at = observed_at,
        revocation_reason = 'refresh_replay', updated_at = observed_at
    WHERE family_id = target_family;

    UPDATE platform.grants
    SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at),
        revocation_reason = 'refresh_replay', updated_at = observed_at
    WHERE tenant_id = family.tenant_id AND id = family.grant_id
      AND status IN ('pending', 'active', 'suspended');

    SELECT resource_uri INTO resource FROM platform.sites
    WHERE tenant_id = family.tenant_id AND id = family.site_id;
    IF resource IS NULL THEN
      RAISE EXCEPTION 'refresh_family_site_missing';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(family.tenant_id::text || ':' || family.site_id, 204));
    SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence
    FROM oauth.revocation_outbox
    WHERE tenant_id = family.tenant_id AND site_id = family.site_id;

    INSERT INTO oauth.revocation_outbox
      (tenant_id, site_id, resource_uri, event_sequence, event_type, grant_id, reason)
    VALUES
      (family.tenant_id, family.site_id, resource, next_sequence, 'grant', family.grant_id, 'refresh_replay');
    RETURN 'replay';
  END IF;

  RETURN 'denied';
END
$$;

REVOKE ALL ON FUNCTION oauth.rotate_refresh_family(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.rotate_refresh_family(uuid, integer, timestamptz) TO wepuu_auth;

CREATE OR REPLACE FUNCTION oauth.revoke_refresh_grant(
  target_grant text,
  observed_at timestamptz,
  target_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth, platform
AS $$
DECLARE
  bound_grant platform.grants%ROWTYPE;
  resource text;
  next_sequence bigint;
  grant_changed boolean;
BEGIN
  SELECT * INTO bound_grant FROM platform.grants WHERE id = target_grant FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE platform.grants
  SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at),
      revocation_reason = COALESCE(revocation_reason, target_reason), updated_at = observed_at
  WHERE tenant_id = bound_grant.tenant_id AND id = bound_grant.id
    AND status IN ('pending', 'active', 'suspended');
  grant_changed := FOUND;

  UPDATE oauth.secret_artifacts SET expires_at = observed_at, updated_at = observed_at
  WHERE model = 'RefreshToken' AND payload->>'grantId' = target_grant;

  IF NOT grant_changed THEN RETURN true; END IF;

  SELECT resource_uri INTO resource FROM platform.sites
  WHERE tenant_id = bound_grant.tenant_id AND id = bound_grant.site_id;
  IF resource IS NULL THEN RAISE EXCEPTION 'refresh_grant_site_missing'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(bound_grant.tenant_id::text || ':' || bound_grant.site_id, 204));
  SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence
  FROM oauth.revocation_outbox
  WHERE tenant_id = bound_grant.tenant_id AND site_id = bound_grant.site_id;

  INSERT INTO oauth.revocation_outbox
    (tenant_id, site_id, resource_uri, event_sequence, event_type, grant_id, reason)
  VALUES
    (bound_grant.tenant_id, bound_grant.site_id, resource, next_sequence,
     'grant', bound_grant.id, target_reason)
  ON CONFLICT (tenant_id, site_id, event_sequence) DO NOTHING;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION oauth.revoke_refresh_grant(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.revoke_refresh_grant(text, timestamptz, text) TO wepuu_auth;

CREATE OR REPLACE FUNCTION oauth.revoke_grant_with_event(target_tenant uuid, target_grant text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth, platform
AS $$
DECLARE
  changed boolean;
  bound_site text;
  resource text;
  next_sequence bigint;
BEGIN
  IF target_tenant IS DISTINCT FROM platform.current_tenant_id()
     OR NOT platform.has_active_membership(target_tenant, platform.current_account_id()) THEN
    RETURN false;
  END IF;
  UPDATE platform.grants
  SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()),
      revocation_reason = 'platform_user_revoked', updated_at = now()
  WHERE tenant_id = target_tenant AND id = target_grant
    AND status IN ('pending', 'active', 'suspended')
    AND (subject_id = platform.current_account_id()
      OR platform.has_tenant_role(target_tenant, platform.current_account_id(), ARRAY['owner', 'administrator']))
  RETURNING site_id INTO bound_site;
  changed := FOUND;
  IF NOT changed THEN RETURN false; END IF;
  SELECT resource_uri INTO STRICT resource FROM platform.sites
  WHERE tenant_id = target_tenant AND id = bound_site;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_tenant::text || ':' || bound_site, 204));
  SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence FROM oauth.revocation_outbox
  WHERE tenant_id = target_tenant AND site_id = bound_site;
  INSERT INTO oauth.revocation_outbox
    (tenant_id, site_id, resource_uri, event_sequence, event_type, grant_id, reason)
  VALUES (target_tenant, bound_site, resource, next_sequence, 'grant', target_grant, 'platform_user_revoked');
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION oauth.disconnect_site_with_event(target_tenant uuid, target_site text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth, platform
AS $$
DECLARE
  resource text;
  next_sequence bigint;
BEGIN
  IF target_tenant IS DISTINCT FROM platform.current_tenant_id()
     OR NOT platform.has_tenant_role(
       target_tenant, platform.current_account_id(), ARRAY['owner', 'administrator']
     ) THEN
    RETURN false;
  END IF;
  UPDATE platform.sites
  SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()), updated_at = now()
  WHERE tenant_id = target_tenant AND id = target_site
    AND status IN ('active', 'pending', 'suspended')
  RETURNING resource_uri INTO resource;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE platform.grants
  SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()),
      revocation_reason = 'site_disconnected', updated_at = now()
  WHERE tenant_id = target_tenant AND site_id = target_site
    AND status IN ('pending', 'active', 'suspended');
  PERFORM pg_advisory_xact_lock(hashtextextended(target_tenant::text || ':' || target_site, 204));
  SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence FROM oauth.revocation_outbox
  WHERE tenant_id = target_tenant AND site_id = target_site;
  INSERT INTO oauth.revocation_outbox
    (tenant_id, site_id, resource_uri, event_sequence, event_type, reason)
  VALUES (target_tenant, target_site, resource, next_sequence, 'site', 'site_disconnected');
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION oauth.revoke_grant_with_event(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.disconnect_site_with_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.revoke_grant_with_event(uuid, text) TO wepuu_control;
GRANT EXECUTE ON FUNCTION oauth.disconnect_site_with_event(uuid, text) TO wepuu_control;
GRANT USAGE ON SCHEMA oauth TO wepuu_control;

CREATE OR REPLACE FUNCTION oauth.activate_signing_key(target_kid text, observed_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth
AS $$
DECLARE
  current_kid text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('oauth.signing_key_rotation', 204));
  SELECT kid INTO current_kid FROM oauth.signing_key_metadata
  WHERE status = 'active' FOR UPDATE;
  IF current_kid IS NULL OR current_kid = target_kid THEN RETURN false; END IF;
  PERFORM 1 FROM oauth.signing_key_metadata
  WHERE kid = target_kid AND status = 'published'
    AND publish_at <= observed_at - interval '20 minutes' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE oauth.signing_key_metadata SET status = 'retiring', retire_at = observed_at + interval '20 minutes'
  WHERE kid = current_kid AND status = 'active';
  UPDATE oauth.signing_key_metadata SET status = 'active', activate_at = observed_at
  WHERE kid = target_kid AND status = 'published';
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION oauth.revoke_signing_key(target_kid text, observed_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth, platform
AS $$
DECLARE
  site record;
  next_sequence bigint;
BEGIN
  UPDATE oauth.signing_key_metadata
  SET status = 'revoked', revoke_at = observed_at
  WHERE kid = target_kid AND status IN ('published', 'active', 'retiring');
  IF NOT FOUND THEN RETURN false; END IF;
  FOR site IN SELECT tenant_id, id, resource_uri FROM platform.sites WHERE status = 'active' LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(site.tenant_id::text || ':' || site.id, 204));
    SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence FROM oauth.revocation_outbox
    WHERE tenant_id = site.tenant_id AND site_id = site.id;
    INSERT INTO oauth.revocation_outbox
      (tenant_id, site_id, resource_uri, event_sequence, event_type, key_id, reason)
    VALUES (site.tenant_id, site.id, site.resource_uri, next_sequence, 'key', target_kid, 'key_revoked');
  END LOOP;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION oauth.activate_signing_key(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.revoke_signing_key(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.activate_signing_key(text, timestamptz) TO wepuu_auth;
GRANT EXECUTE ON FUNCTION oauth.revoke_signing_key(text, timestamptz) TO wepuu_auth;

CREATE OR REPLACE FUNCTION oauth.consume_rate_limit(
  target_policy text,
  target_subject_hash bytea,
  target_limit integer,
  target_window_seconds integer,
  observed_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, oauth
AS $$
DECLARE
  window_start timestamptz;
  new_counter integer;
BEGIN
  IF target_policy !~ '^[a-z][a-z0-9_.-]{2,63}$'
     OR octet_length(target_subject_hash) <> 32
     OR target_limit < 1 OR target_limit > 10000
     OR target_window_seconds < 1 OR target_window_seconds > 3600 THEN
    RETURN false;
  END IF;
  window_start := to_timestamp(
    floor(extract(epoch FROM observed_at) / target_window_seconds) * target_window_seconds
  );
  INSERT INTO oauth.rate_limit_buckets
    (policy, subject_hash, window_started_at, counter, expires_at)
  VALUES
    (target_policy, target_subject_hash, window_start, 1,
     window_start + make_interval(secs => target_window_seconds * 2))
  ON CONFLICT (policy, subject_hash, window_started_at)
  DO UPDATE SET counter = oauth.rate_limit_buckets.counter + 1
  WHERE oauth.rate_limit_buckets.counter < target_limit
  RETURNING counter INTO new_counter;
  RETURN new_counter IS NOT NULL AND new_counter <= target_limit;
END
$$;

REVOKE ALL ON FUNCTION oauth.consume_rate_limit(text, bytea, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.consume_rate_limit(text, bytea, integer, integer, timestamptz) TO wepuu_auth;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  oauth.secret_artifacts,
  oauth.refresh_families,
  oauth.revocation_outbox,
  oauth.rate_limit_buckets
TO wepuu_auth;
GRANT USAGE, SELECT ON SEQUENCE oauth.revocation_outbox_id_seq TO wepuu_auth;
GRANT SELECT ON platform.accounts TO wepuu_auth;

REVOKE ALL ON
  oauth.secret_artifacts,
  oauth.refresh_families,
  oauth.revocation_outbox,
  oauth.rate_limit_buckets
FROM PUBLIC;
