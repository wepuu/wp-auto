CREATE TABLE IF NOT EXISTS platform.deletion_jobs (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]+$' AND length(id) BETWEEN 16 AND 128),
  scope_kind text NOT NULL CHECK (scope_kind IN ('account', 'tenant', 'site')),
  scope_id text NOT NULL CHECK (scope_id ~ '^[A-Za-z0-9_.:-]+$' AND length(scope_id) BETWEEN 8 AND 256),
  tenant_id uuid,
  requested_by text NOT NULL CHECK (requested_by ~ '^[A-Za-z0-9_-]+$' AND length(requested_by) BETWEEN 8 AND 128),
  status text NOT NULL CHECK (status IN ('pending', 'waiting', 'complete', 'failed')),
  safe_after timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_code text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK ((scope_kind = 'account' AND tenant_id IS NULL) OR (scope_kind IN ('tenant', 'site') AND tenant_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS deletion_jobs_scope_idx
  ON platform.deletion_jobs (scope_kind, scope_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS platform.deletion_tombstones (
  job_id text NOT NULL REFERENCES platform.deletion_jobs(id),
  object_kind text NOT NULL CHECK (object_kind IN ('account', 'tenant', 'membership', 'site', 'grant', 'session', 'refresh_family', 'oauth_artifact', 'pairing', 'idempotency', 'outbox')),
  object_id text NOT NULL CHECK (length(object_id) BETWEEN 8 AND 256),
  tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, object_kind, object_id)
);

CREATE INDEX IF NOT EXISTS deletion_tombstones_tenant_idx
  ON platform.deletion_tombstones (tenant_id, created_at);

ALTER TABLE platform.deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.deletion_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.deletion_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.deletion_tombstones FORCE ROW LEVEL SECURITY;

REVOKE ALL ON platform.deletion_jobs, platform.deletion_tombstones FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO wepuu_auth;

CREATE OR REPLACE FUNCTION platform.begin_deletion_job(
  target_job_id text,
  target_scope_kind text,
  target_scope_id text,
  target_tenant_id uuid,
  target_requested_by text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, oauth
AS $$
DECLARE
  existing text;
  row record;
BEGIN
  IF target_job_id !~ '^[A-Za-z0-9_-]+$' OR length(target_job_id) NOT BETWEEN 16 AND 128
     OR target_scope_id !~ '^[A-Za-z0-9_.:-]+$' OR length(target_scope_id) NOT BETWEEN 8 AND 256
     OR target_requested_by !~ '^[A-Za-z0-9_-]+$' OR length(target_requested_by) NOT BETWEEN 8 AND 128
     OR target_scope_kind NOT IN ('account', 'tenant', 'site') THEN
    RAISE EXCEPTION 'deletion_request_invalid' USING ERRCODE = '22023';
  END IF;
  IF target_scope_kind = 'account' AND target_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'deletion_scope_invalid' USING ERRCODE = '22023';
  END IF;
  IF target_scope_kind IN ('tenant', 'site') AND target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'deletion_scope_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing FROM platform.deletion_jobs WHERE id = target_job_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  IF target_scope_kind = 'account' THEN
    IF NOT EXISTS (SELECT 1 FROM platform.accounts WHERE id = target_scope_id) THEN
      RAISE EXCEPTION 'deletion_subject_missing' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM platform.tenant_memberships owned
      WHERE owned.account_id = target_scope_id
        AND owned.role = 'owner'
        AND owned.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM platform.tenant_memberships replacement
          WHERE replacement.tenant_id = owned.tenant_id
            AND replacement.account_id <> target_scope_id
            AND replacement.role = 'owner'
            AND replacement.status = 'active'
        )
    ) THEN
      RAISE EXCEPTION 'deletion_owner_transfer_required' USING ERRCODE = '42501';
    END IF;
  ELSIF target_scope_kind = 'tenant' THEN
    IF target_scope_id <> target_tenant_id::text
       OR NOT EXISTS (SELECT 1 FROM platform.tenants WHERE id = target_tenant_id) THEN
      RAISE EXCEPTION 'deletion_subject_missing' USING ERRCODE = 'P0002';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM platform.sites
    WHERE tenant_id = target_tenant_id AND id = target_scope_id
  ) THEN
    RAISE EXCEPTION 'deletion_subject_missing' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO platform.deletion_jobs (id, scope_kind, scope_id, tenant_id, requested_by, status)
  VALUES (target_job_id, target_scope_kind, target_scope_id, target_tenant_id, target_requested_by, 'pending');

  IF target_scope_kind = 'account' THEN
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    VALUES (target_job_id, 'account', target_scope_id, NULL)
    ON CONFLICT DO NOTHING;
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    SELECT target_job_id, 'membership', tenant_id::text || ':' || account_id, tenant_id
    FROM platform.tenant_memberships WHERE account_id = target_scope_id
    ON CONFLICT DO NOTHING;
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    SELECT target_job_id, 'grant', id, tenant_id
    FROM platform.grants WHERE subject_id = target_scope_id
    ON CONFLICT DO NOTHING;
  ELSIF target_scope_kind = 'tenant' THEN
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    VALUES (target_job_id, 'tenant', target_tenant_id::text, target_tenant_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    SELECT target_job_id, 'site', id, tenant_id FROM platform.sites WHERE tenant_id = target_tenant_id
    ON CONFLICT DO NOTHING;
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    SELECT target_job_id, 'grant', id, tenant_id FROM platform.grants WHERE tenant_id = target_tenant_id
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    VALUES (target_job_id, 'site', target_scope_id, target_tenant_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO platform.deletion_tombstones (job_id, object_kind, object_id, tenant_id)
    SELECT target_job_id, 'grant', id, tenant_id
    FROM platform.grants WHERE tenant_id = target_tenant_id AND site_id = target_scope_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN target_job_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.advance_deletion_job(target_job_id text, observed_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, oauth, audit
AS $$
DECLARE
  job platform.deletion_jobs%ROWTYPE;
  site_row record;
  grant_row record;
  next_sequence bigint;
  safe_time timestamptz;
  deleted_count integer := 0;
  revoked_count integer := 0;
  outbox_count integer := 0;
BEGIN
  SELECT * INTO job FROM platform.deletion_jobs WHERE id = target_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deletion_job_missing' USING ERRCODE = 'P0002'; END IF;
  IF job.status = 'complete' THEN
    RETURN jsonb_build_object('jobId', job.id, 'scopeKind', job.scope_kind, 'scopeId', job.scope_id,
      'status', job.status, 'safeAfter', job.safe_after, 'completedAt', job.completed_at, 'counts', job.counts);
  END IF;
  IF job.status = 'failed' THEN
    RETURN jsonb_build_object('jobId', job.id, 'scopeKind', job.scope_kind, 'scopeId', job.scope_id,
      'status', job.status, 'failureCode', job.failure_code, 'counts', job.counts);
  END IF;

  IF job.status = 'pending' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('deletion:' || job.scope_kind || ':' || job.scope_id, 202));
    IF job.scope_kind = 'account' THEN
      UPDATE platform.account_sessions SET revoked_at = COALESCE(revoked_at, observed_at)
      WHERE account_id = job.scope_id AND revoked_at IS NULL;
      GET DIAGNOSTICS revoked_count = ROW_COUNT;
      UPDATE platform.tenant_memberships SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at)
      WHERE account_id = job.scope_id AND status = 'active';
      UPDATE platform.accounts SET status = 'deleted', updated_at = observed_at WHERE id = job.scope_id;
      FOR grant_row IN SELECT tenant_id, site_id, id FROM platform.grants WHERE subject_id = job.scope_id AND status <> 'revoked' LOOP
        UPDATE platform.grants SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at),
          revocation_reason = 'account_deleted', updated_at = observed_at
        WHERE tenant_id = grant_row.tenant_id AND id = grant_row.id;
        SELECT resource_uri INTO site_row FROM platform.sites
        WHERE tenant_id = grant_row.tenant_id AND id = grant_row.site_id;
        IF site_row.resource_uri IS NOT NULL THEN
          PERFORM pg_advisory_xact_lock(hashtextextended(grant_row.tenant_id::text || ':' || grant_row.site_id, 204));
          SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence FROM oauth.revocation_outbox
          WHERE tenant_id = grant_row.tenant_id AND site_id = grant_row.site_id;
          INSERT INTO oauth.revocation_outbox (tenant_id, site_id, resource_uri, event_sequence, event_type, grant_id, reason)
          VALUES (grant_row.tenant_id, grant_row.site_id, site_row.resource_uri, next_sequence, 'grant', grant_row.id, 'account_deleted')
          ON CONFLICT DO NOTHING;
          outbox_count := outbox_count + 1;
        END IF;
      END LOOP;
    ELSE
      FOR site_row IN
        SELECT id, tenant_id, resource_uri FROM platform.sites
        WHERE tenant_id = job.tenant_id AND (job.scope_kind = 'tenant' OR id = job.scope_id)
          AND status <> 'deleted'
      LOOP
        UPDATE platform.sites SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at), updated_at = observed_at
        WHERE tenant_id = site_row.tenant_id AND id = site_row.id;
        PERFORM pg_advisory_xact_lock(hashtextextended(site_row.tenant_id::text || ':' || site_row.id, 204));
        SELECT COALESCE(MAX(event_sequence), 0) + 1 INTO next_sequence FROM oauth.revocation_outbox
        WHERE tenant_id = site_row.tenant_id AND site_id = site_row.id;
        INSERT INTO oauth.revocation_outbox (tenant_id, site_id, resource_uri, event_sequence, event_type, reason)
        VALUES (site_row.tenant_id, site_row.id, site_row.resource_uri, next_sequence, 'site', 'deletion_requested')
        ON CONFLICT DO NOTHING;
        outbox_count := outbox_count + 1;
        UPDATE platform.grants SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at),
          revocation_reason = 'deletion_requested', updated_at = observed_at
        WHERE tenant_id = site_row.tenant_id AND site_id = site_row.id AND status <> 'revoked';
      END LOOP;
      UPDATE oauth.refresh_families SET status = 'revoked', revoked_at = COALESCE(revoked_at, observed_at),
        revocation_reason = 'deletion_requested', updated_at = observed_at
      WHERE tenant_id = job.tenant_id AND status = 'active'
        AND (job.scope_kind = 'tenant' OR site_id = job.scope_id);
      IF job.scope_kind = 'tenant' THEN
        UPDATE platform.tenants SET status = 'deleted', deleted_at = COALESCE(deleted_at, observed_at), updated_at = observed_at
        WHERE id = job.tenant_id;
      END IF;
    END IF;
    safe_time := observed_at + interval '6 minutes';
    UPDATE platform.deletion_jobs SET status = 'waiting', safe_after = safe_time, counts = jsonb_build_object('revokedSessions', revoked_count, 'revocationEvents', outbox_count), requested_at = requested_at
    WHERE id = job.id;
    RETURN jsonb_build_object('jobId', job.id, 'scopeKind', job.scope_kind, 'scopeId', job.scope_id,
      'status', 'waiting', 'safeAfter', safe_time, 'counts', jsonb_build_object('revokedSessions', revoked_count, 'revocationEvents', outbox_count));
  END IF;

  IF job.safe_after IS NULL OR observed_at < job.safe_after THEN
    RETURN jsonb_build_object('jobId', job.id, 'scopeKind', job.scope_kind, 'scopeId', job.scope_id,
      'status', job.status, 'safeAfter', job.safe_after, 'counts', job.counts);
  END IF;

  IF job.scope_kind = 'account' THEN
    DELETE FROM oauth.secret_artifacts WHERE payload->>'grantId' IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM oauth.provider_artifacts WHERE payload->>'grantId' IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM oauth.refresh_families WHERE grant_id IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM oauth.revocation_outbox WHERE grant_id IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM platform.idempotency_records
    WHERE result_reference IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM platform.grants WHERE subject_id = job.scope_id;
    DELETE FROM platform.account_sessions WHERE account_id = job.scope_id;
    DELETE FROM platform.tenant_memberships WHERE account_id = job.scope_id;
    DELETE FROM platform.accounts WHERE id = job.scope_id;
  ELSE
    DELETE FROM oauth.secret_artifacts
    WHERE (job.scope_kind = 'tenant' AND tenant_id = job.tenant_id)
       OR payload->>'grantId' IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM oauth.provider_artifacts
    WHERE (job.scope_kind = 'tenant' AND tenant_id = job.tenant_id)
       OR payload->>'grantId' IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant');
    DELETE FROM oauth.refresh_families WHERE tenant_id = job.tenant_id AND (job.scope_kind = 'tenant' OR site_id = job.scope_id);
    DELETE FROM oauth.revocation_outbox WHERE tenant_id = job.tenant_id AND (job.scope_kind = 'tenant' OR site_id = job.scope_id);
    DELETE FROM platform.pairing_attempts WHERE tenant_id = job.tenant_id AND (job.scope_kind = 'tenant' OR site_id = job.scope_id);
    DELETE FROM platform.idempotency_records
    WHERE tenant_id = job.tenant_id
      AND (job.scope_kind = 'tenant'
        OR result_reference = job.scope_id
        OR result_reference IN (SELECT object_id FROM platform.deletion_tombstones WHERE job_id = job.id AND object_kind = 'grant'));
    DELETE FROM platform.grants WHERE tenant_id = job.tenant_id AND (job.scope_kind = 'tenant' OR site_id = job.scope_id);
    IF job.scope_kind = 'tenant' THEN
      DELETE FROM platform.sites WHERE tenant_id = job.tenant_id;
      DELETE FROM audit.security_events WHERE tenant_id = job.tenant_id;
      DELETE FROM platform.tenant_memberships WHERE tenant_id = job.tenant_id;
      DELETE FROM platform.tenants WHERE id = job.tenant_id;
    ELSE
      DELETE FROM platform.sites WHERE tenant_id = job.tenant_id AND id = job.scope_id;
    END IF;
  END IF;

  UPDATE platform.deletion_jobs SET status = 'complete', completed_at = observed_at,
    counts = jsonb_build_object('deleted', true, 'outboxPurged', true)
  WHERE id = job.id;
  RETURN jsonb_build_object('jobId', job.id, 'scopeKind', job.scope_kind, 'scopeId', job.scope_id,
    'status', 'complete', 'safeAfter', job.safe_after, 'completedAt', observed_at,
    'counts', jsonb_build_object('deleted', true, 'outboxPurged', true));
EXCEPTION WHEN OTHERS THEN
  UPDATE platform.deletion_jobs SET status = 'failed', failure_code = SQLSTATE WHERE id = target_job_id;
  RETURN jsonb_build_object('jobId', target_job_id, 'status', 'failed', 'failureCode', SQLSTATE);
END
$$;

REVOKE ALL ON FUNCTION platform.begin_deletion_job(text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.advance_deletion_job(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.begin_deletion_job(text, text, text, uuid, text) TO wepuu_auth;
GRANT EXECUTE ON FUNCTION platform.advance_deletion_job(text, timestamptz) TO wepuu_auth;
