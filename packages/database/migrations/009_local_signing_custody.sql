ALTER TABLE oauth.signing_key_metadata
  DROP CONSTRAINT IF EXISTS signing_key_metadata_custody_provider_check;

ALTER TABLE oauth.signing_key_metadata
  ADD CONSTRAINT signing_key_metadata_custody_provider_check
  CHECK (custody_provider IN ('aws-kms', 'local-pkcs8'));

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
  IF current_kid = target_kid THEN RETURN false; END IF;
  PERFORM 1 FROM oauth.signing_key_metadata
  WHERE kid = target_kid AND status = 'published' AND custody_provider = 'local-pkcs8'
    AND publish_at <= observed_at - interval '20 minutes' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF current_kid IS NOT NULL THEN
    UPDATE oauth.signing_key_metadata SET status = 'retiring', retire_at = observed_at + interval '20 minutes'
    WHERE kid = current_kid AND status = 'active';
  END IF;
  UPDATE oauth.signing_key_metadata SET status = 'active', activate_at = observed_at
  WHERE kid = target_kid AND status = 'published';
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION oauth.activate_signing_key(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.activate_signing_key(text, timestamptz) TO wepuu_auth;
