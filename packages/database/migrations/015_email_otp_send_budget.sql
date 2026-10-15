-- Additive to 001-013; deliberately independent of console migration 014.
CREATE TABLE auth.otp_send_reservations (
  id uuid PRIMARY KEY,
  recipient_hmac bytea NOT NULL CHECK (octet_length(recipient_hmac) = 32),
  reserved_at timestamptz NOT NULL,
  attempted_at timestamptz,
  outcome text NOT NULL DEFAULT 'reserved'
    CHECK (outcome IN ('reserved', 'accepted', 'rejected', 'unknown')),
  CHECK (attempted_at IS NULL OR attempted_at >= reserved_at),
  CHECK (outcome = 'reserved' OR attempted_at IS NOT NULL)
);
CREATE INDEX otp_send_reservations_time_idx ON auth.otp_send_reservations (reserved_at);
CREATE INDEX otp_send_reservations_recipient_time_idx
  ON auth.otp_send_reservations (recipient_hmac, reserved_at);
REVOKE ALL ON auth.otp_send_reservations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.otp_send_reservations TO wepuu_account_auth_writer;
