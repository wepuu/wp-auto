import { readFile } from 'node:fs/promises';

/**
 * Provider-neutral contract used by every candidate adapter.
 *
 * The spike deliberately keeps this as a small runtime shape instead of
 * leaking provider SDK objects into tests. Candidate-specific setup and
 * cleanup live behind the adapter boundary.
 */
export class ProviderAdapter {
  constructor(name, version) {
    this.name = name;
    this.version = version;
  }

  async start() {
    throw new Error('adapter_not_implemented:start');
  }

  async stop() {
    throw new Error('adapter_not_implemented:stop');
  }

  /** Release all provider-side resources created by the conformance run. */
  async cleanup() {
    return this.stop();
  }

  async metadata() {
    throw new Error('adapter_not_implemented:metadata');
  }

  async registerClient() {
    throw new Error('adapter_not_implemented:registerClient');
  }

  async issueAuthorizationCode() {
    throw new Error('adapter_not_implemented:issueAuthorizationCode');
  }

  async exchangeToken() {
    throw new Error('adapter_not_implemented:exchangeToken');
  }

  async refreshToken() {
    throw new Error('adapter_not_implemented:refreshToken');
  }

  async revoke() {
    throw new Error('adapter_not_implemented:revoke');
  }

  async rotateKeys() {
    throw new Error('adapter_not_implemented:rotateKeys');
  }
}

export const TEST_PROFILE = Object.freeze({
  authorizationCodeTtl: 90,
  accessTokenTtl: 300,
  clockSkew: 60,
  refreshInactivityTtl: 30 * 24 * 60 * 60,
  refreshAbsoluteTtl: 90 * 24 * 60 * 60,
  jwksOverlapTtl: 20 * 60,
  refreshReuseLeeway: 0,
  algorithm: 'RS256',
  accessTokenType: 'at+jwt'
});

export function makeConformanceCase({ id, candidate, client, clientVersion, expected, actual, status, evidence = [] }) {
  if (!id || !candidate || !status) throw new Error('invalid_conformance_case');
  if (!['pass', 'fail', 'blocked'].includes(status)) throw new Error('invalid_conformance_status');
  return Object.freeze({
    id,
    candidate,
    client: client ?? null,
    clientVersion: clientVersion ?? null,
    expected: expected ?? null,
    actual: actual ?? null,
    status,
    evidence: evidence.map((entry) => redactTrace(entry))
  });
}

export function makeClientInteropResult({ client, clientVersion, registrationMode, cases = [], conclusion, evidence = [] }) {
  if (!client || !clientVersion) throw new Error('invalid_client_interop_identity');
  if (!['pre-registered', 'cimd', 'dcr', 'automatic-discovery'].includes(registrationMode)) throw new Error('invalid_registration_mode');
  if (!['supported', 'unsupported', 'blocked'].includes(conclusion)) throw new Error('invalid_client_interop_conclusion');
  return Object.freeze({
    client,
    clientVersion,
    registrationMode,
    cases: Object.freeze([...cases]),
    conclusion,
    evidence: Object.freeze(evidence.map((entry) => redactTrace(entry)))
  });
}

const SECRET_KEYS = /^(authorization|cookie|set-cookie|token|access_token|refresh_token|code|code_verifier|code_challenge|client_secret|password|email|body|content|tool|media|query)$/i;
const SECRET_QUERY_KEYS = new Set(['access_token', 'refresh_token', 'code', 'code_verifier', 'code_challenge', 'client_secret']);

export function redactTrace(entry) {
  if (Array.isArray(entry)) return entry.map((value) => redactTrace(value));
  if (!entry || typeof entry !== 'object') return entry;
  const output = {};
  for (const [key, value] of Object.entries(entry)) {
    if (SECRET_KEYS.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    if (key === 'url' && typeof value === 'string') {
      try {
        const url = new URL(value);
        for (const queryKey of SECRET_QUERY_KEYS) {
          if (url.searchParams.has(queryKey)) url.searchParams.set(queryKey, '[REDACTED]');
        }
        output[key] = url.toString();
      } catch {
        output[key] = '[REDACTED_URL]';
      }
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = redactTrace(value);
      continue;
    }
    output[key] = typeof value === 'string' && value.length > 256 ? `${value.slice(0, 256)}…` : value;
  }
  return output;
}

export function assertTraceIsContentFree(entry) {
  const text = JSON.stringify(entry).toLowerCase();
  for (const forbidden of ['post_content', 'tool_arguments', 'tool_results', 'media_url', 'password', 'email', 'cookie', 'access_token', 'refresh_token']) {
    if (text.includes(forbidden)) throw new Error('trace_contains_forbidden_field');
  }
  return true;
}

export async function readJsonSecret(path) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_secret_document');
  return value;
}
