DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wepuu_identity_writer') THEN
    CREATE ROLE wepuu_identity_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_external_identity_idx
  ON platform.accounts (identity_issuer, identity_subject_hash);

CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx
  ON platform.account_sessions (expires_at)
  WHERE revoked_at IS NULL;

GRANT USAGE ON SCHEMA platform TO wepuu_identity_writer;
GRANT SELECT, INSERT ON platform.accounts TO wepuu_identity_writer;
GRANT SELECT, INSERT, UPDATE ON platform.account_sessions TO wepuu_identity_writer;

REVOKE ALL ON platform.accounts, platform.account_sessions FROM PUBLIC;
