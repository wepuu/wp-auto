DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_account_workspace') THEN
    CREATE ROLE wepuu_account_workspace NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS platform.account_home_tenants (
  account_id text PRIMARY KEY REFERENCES platform.accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL UNIQUE REFERENCES platform.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON platform.account_home_tenants FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO wepuu_account_workspace;

CREATE OR REPLACE FUNCTION platform.ensure_personal_workspace(proposed_tenant_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  membership_role text,
  membership_status text,
  membership_created_at timestamptz,
  is_home boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE
  target_account_id text := nullif(current_setting('app.account_id', true), '');
  existing_home uuid;
BEGIN
  IF target_account_id IS NULL OR target_account_id !~ '^[A-Za-z0-9_-]{8,128}$' THEN
    RAISE EXCEPTION 'account_context_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM platform.accounts account_record
    WHERE account_record.id = target_account_id AND account_record.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_account_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('home:' || target_account_id, 0));

  SELECT home.tenant_id INTO existing_home
  FROM platform.account_home_tenants home
  WHERE home.account_id = target_account_id;

  IF existing_home IS NULL THEN
    INSERT INTO platform.tenants (id, status) VALUES (proposed_tenant_id, 'active');
    INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
      VALUES (proposed_tenant_id, target_account_id, 'owner', 'active');
    INSERT INTO platform.account_home_tenants (account_id, tenant_id)
      VALUES (target_account_id, proposed_tenant_id);
    existing_home := proposed_tenant_id;
  END IF;

  RETURN QUERY
    SELECT membership.tenant_id,
           membership.role,
           membership.status,
           membership.created_at,
           true
    FROM platform.tenant_memberships membership
    JOIN platform.tenants tenant_record ON tenant_record.id = membership.tenant_id
    WHERE membership.account_id = target_account_id
      AND membership.tenant_id = existing_home
      AND membership.status = 'active'
      AND tenant_record.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'home_workspace_inactive';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION platform.list_current_account_tenants()
RETURNS TABLE (
  tenant_id uuid,
  membership_role text,
  membership_status text,
  membership_created_at timestamptz,
  is_home boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  SELECT membership.tenant_id,
         membership.role,
         membership.status,
         membership.created_at,
         home.tenant_id IS NOT NULL
  FROM platform.tenant_memberships membership
  JOIN platform.tenants tenant_record ON tenant_record.id = membership.tenant_id
  LEFT JOIN platform.account_home_tenants home
    ON home.account_id = membership.account_id AND home.tenant_id = membership.tenant_id
  WHERE membership.account_id = nullif(current_setting('app.account_id', true), '')
    AND membership.status = 'active'
    AND tenant_record.status = 'active'
  ORDER BY (home.tenant_id IS NOT NULL) DESC, membership.created_at, membership.tenant_id
$$;

REVOKE ALL ON FUNCTION platform.ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.list_current_account_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.ensure_personal_workspace(uuid) TO wepuu_account_workspace;
GRANT EXECUTE ON FUNCTION platform.list_current_account_tenants() TO wepuu_account_workspace;
