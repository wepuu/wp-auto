import { Pool } from 'pg';
import { epochTime } from './time.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oidc_artifacts (
  model text NOT NULL,
  jti text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (model, jti)
);
CREATE INDEX IF NOT EXISTS oidc_artifacts_grant_idx
  ON oidc_artifacts ((payload->>'grantId'));
CREATE INDEX IF NOT EXISTS oidc_artifacts_uid_idx
  ON oidc_artifacts ((payload->>'uid'));
CREATE INDEX IF NOT EXISTS oidc_artifacts_user_code_idx
  ON oidc_artifacts ((payload->>'userCode'));
`;

export class PostgresAdapter {
  constructor(model, pool) {
    this.model = model;
    this.pool = pool;
  }

  async upsert(id, payload, expiresIn) {
    const expiresAt = typeof expiresIn === 'number'
      ? new Date(Date.now() + (expiresIn * 1000))
      : null;
    await this.pool.query(
      `INSERT INTO oidc_artifacts (model, jti, payload, expires_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (model, jti)
       DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [this.model, id, JSON.stringify(payload), expiresAt]
    );
  }

  async find(id) {
    const { rows } = await this.pool.query(
      `SELECT payload FROM oidc_artifacts
       WHERE model = $1 AND jti = $2
         AND (expires_at IS NULL OR expires_at > now())`,
      [this.model, id]
    );
    return rows[0]?.payload;
  }

  async destroy(id) {
    await this.pool.query('DELETE FROM oidc_artifacts WHERE model = $1 AND jti = $2', [this.model, id]);
  }

  async consume(id) {
    await this.pool.query(
      `UPDATE oidc_artifacts
       SET payload = jsonb_set(payload, '{consumed}', to_jsonb($3::bigint), true)
       WHERE model = $1 AND jti = $2`,
      [this.model, id, epochTime()]
    );
  }

  async findByUid(uid) {
    return this.findSecondary('uid', uid);
  }

  async findByUserCode(userCode) {
    return this.findSecondary('userCode', userCode);
  }

  async findSecondary(field, value) {
    const { rows } = await this.pool.query(
      `SELECT payload FROM oidc_artifacts
       WHERE model = $1 AND payload->>$2 = $3
         AND (expires_at IS NULL OR expires_at > now())
       LIMIT 1`,
      [this.model, field, value]
    );
    return rows[0]?.payload;
  }

  async revokeByGrantId(grantId) {
    await this.pool.query(
      `DELETE FROM oidc_artifacts WHERE payload->>'grantId' = $1`,
      [grantId]
    );
  }
}

export function createPostgresAdapter(connectionString = process.env.CONFORMANCE_DATABASE_URL) {
  if (!connectionString) throw new Error('CONFORMANCE_DATABASE_URL is required for the persistent adapter');
  const pool = new Pool({ connectionString, max: 4, application_name: 'wepuu-oauth-conformance' });
  const factory = (model) => new PostgresAdapter(model, pool);
  factory.prepare = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // CREATE TABLE IF NOT EXISTS can still race in PostgreSQL system catalogs
      // when independent test workers initialize an empty database together.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [20260916, 201]);
      await client.query(SCHEMA);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  factory.close = () => pool.end();
  factory.pool = pool;
  return factory;
}
