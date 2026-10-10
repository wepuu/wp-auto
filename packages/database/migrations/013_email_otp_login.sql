-- Better Auth 1.7.7 CLI generated the auth.rateLimit definition below.
CREATE TABLE auth."rateLimit" (
  "id" text NOT NULL PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

CREATE TABLE platform.account_login_transactions (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  return_path text NOT NULL CHECK (
    length(return_path) BETWEEN 1 AND 2048
    AND return_path LIKE '/%'
    AND return_path NOT LIKE '//%'
    AND position(E'\\' in return_path) = 0
    AND position('#' in return_path) = 0
  ),
  csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
  email_binding bytea CHECK (email_binding IS NULL OR octet_length(email_binding) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX account_login_transactions_expiry_idx
  ON platform.account_login_transactions (expires_at);
CREATE INDEX account_login_transactions_consumed_idx
  ON platform.account_login_transactions (consumed_at)
  WHERE consumed_at IS NOT NULL;

REVOKE ALL ON auth."rateLimit", platform.account_login_transactions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth."rateLimit" TO wepuu_account_auth_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.account_login_transactions
  TO wepuu_account_auth_writer;
