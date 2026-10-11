CREATE TABLE platform.console_auth_transactions (
  request_id text PRIMARY KEY CHECK (request_id ~ '^console_[A-Za-z0-9_-]{32}$'),
  purpose text NOT NULL CHECK (purpose IN ('login', 'logout')),
  browser_secret_hash bytea NOT NULL CHECK (octet_length(browser_secret_hash) = 32),
  return_path text NOT NULL CHECK (
    length(return_path) BETWEEN 1 AND 2048
    AND return_path LIKE '/%'
    AND return_path NOT LIKE '//%'
    AND position(E'\\' in return_path) = 0
    AND position('#' in return_path) = 0
  ),
  auth_session_id text REFERENCES auth."session" ("id") ON DELETE CASCADE,
  account_id text REFERENCES platform.accounts (id) ON DELETE CASCADE,
  handoff_code_hash bytea CHECK (handoff_code_hash IS NULL OR octet_length(handoff_code_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK ((auth_session_id IS NULL) = (account_id IS NULL)),
  CHECK (purpose = 'login' OR handoff_code_hash IS NULL)
);

CREATE INDEX console_auth_transactions_expiry_idx
  ON platform.console_auth_transactions (expires_at);
CREATE INDEX console_auth_transactions_auth_session_idx
  ON platform.console_auth_transactions (auth_session_id)
  WHERE auth_session_id IS NOT NULL;

CREATE TABLE platform.console_sessions (
  session_hash bytea PRIMARY KEY CHECK (octet_length(session_hash) = 32),
  account_id text NOT NULL REFERENCES platform.accounts (id) ON DELETE CASCADE,
  auth_session_id text NOT NULL REFERENCES auth."session" ("id") ON DELETE CASCADE,
  authenticated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (authenticated_at <= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX console_sessions_account_idx ON platform.console_sessions (account_id);
CREATE INDEX console_sessions_auth_session_idx ON platform.console_sessions (auth_session_id);
CREATE INDEX console_sessions_expiry_idx ON platform.console_sessions (expires_at)
  WHERE revoked_at IS NULL;

REVOKE ALL ON platform.console_auth_transactions, platform.console_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.console_auth_transactions, platform.console_sessions
  TO wepuu_account_auth_writer;
GRANT SELECT ON platform.console_sessions TO wepuu_account_auth_reader;
