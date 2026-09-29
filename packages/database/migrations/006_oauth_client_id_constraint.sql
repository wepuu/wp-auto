ALTER TABLE oauth.clients DROP CONSTRAINT IF EXISTS clients_client_id_check;
ALTER TABLE oauth.clients ADD CONSTRAINT clients_client_id_check CHECK (
  length(client_id) BETWEEN 8 AND 256
  AND client_id ~ '^[A-Za-z0-9._~-]+$'
);
