ALTER TABLE platform.grants
  DROP CONSTRAINT IF EXISTS grants_tenant_id_site_id_subject_id_client_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS grants_one_live_consent_idx
  ON platform.grants (tenant_id, site_id, subject_id, client_id)
  WHERE status IN ('pending', 'active', 'suspended');

ALTER TABLE platform.idempotency_records
  DROP CONSTRAINT IF EXISTS idempotency_records_operation_check;

ALTER TABLE platform.idempotency_records
  ADD CONSTRAINT idempotency_records_operation_check
  CHECK (operation IN ('pairing.complete', 'grant.create', 'grant.complete', 'grant.revoke', 'site.disconnect'));
