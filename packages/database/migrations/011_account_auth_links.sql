DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_account_auth_writer') THEN
    CREATE ROLE wepuu_account_auth_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_account_auth_reader') THEN
    CREATE ROLE wepuu_account_auth_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER TABLE platform.accounts ALTER COLUMN identity_issuer DROP NOT NULL;
ALTER TABLE platform.accounts ALTER COLUMN identity_subject_hash DROP NOT NULL;

CREATE TABLE platform.account_auth_links (
  auth_user_id text PRIMARY KEY REFERENCES auth."user" ("id") ON DELETE RESTRICT,
  account_id text NOT NULL UNIQUE REFERENCES platform.accounts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON platform.account_auth_links FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO wepuu_account_auth_writer, wepuu_account_auth_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO wepuu_account_auth_writer;
GRANT SELECT ON auth."user", auth."session" TO wepuu_account_auth_reader;
GRANT USAGE ON SCHEMA platform TO wepuu_account_auth_writer, wepuu_account_auth_reader;
GRANT SELECT ON platform.account_auth_links, platform.accounts, platform.account_home_tenants
  TO wepuu_account_auth_writer, wepuu_account_auth_reader;

CREATE OR REPLACE FUNCTION platform.ensure_account_auth_link(
  target_auth_user_id text,
  proposed_account_id text,
  proposed_tenant_id uuid
)
RETURNS TABLE (account_id text, home_tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, auth
AS $$
DECLARE
  linked_account_id text;
  linked_tenant_id uuid;
BEGIN
  IF target_auth_user_id IS NULL OR length(target_auth_user_id) < 1 OR length(target_auth_user_id) > 255 THEN
    RAISE EXCEPTION 'auth_user_id_invalid';
  END IF;
  IF proposed_account_id IS NULL OR proposed_account_id !~ '^account_[A-Za-z0-9_-]{16,120}$' THEN
    RAISE EXCEPTION 'proposed_account_id_invalid';
  END IF;
  IF proposed_tenant_id IS NULL THEN
    RAISE EXCEPTION 'proposed_tenant_id_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('account-auth:' || target_auth_user_id, 0));

  IF NOT EXISTS (SELECT 1 FROM auth."user" auth_user WHERE auth_user."id" = target_auth_user_id) THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  SELECT link.account_id, home.tenant_id
    INTO linked_account_id, linked_tenant_id
  FROM platform.account_auth_links link
  JOIN platform.account_home_tenants home ON home.account_id = link.account_id
  WHERE link.auth_user_id = target_auth_user_id;

  IF linked_account_id IS NULL THEN
    INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
      VALUES (proposed_account_id, 'active', NULL, NULL);
    INSERT INTO platform.tenants (id, status) VALUES (proposed_tenant_id, 'active');
    INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
      VALUES (proposed_tenant_id, proposed_account_id, 'owner', 'active');
    INSERT INTO platform.account_home_tenants (account_id, tenant_id)
      VALUES (proposed_account_id, proposed_tenant_id);
    INSERT INTO platform.account_auth_links (auth_user_id, account_id)
      VALUES (target_auth_user_id, proposed_account_id);
    linked_account_id := proposed_account_id;
    linked_tenant_id := proposed_tenant_id;
  END IF;

  RETURN QUERY SELECT linked_account_id, linked_tenant_id;
END
$$;

REVOKE ALL ON FUNCTION platform.ensure_account_auth_link(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.ensure_account_auth_link(text, text, uuid) TO wepuu_account_auth_writer;
