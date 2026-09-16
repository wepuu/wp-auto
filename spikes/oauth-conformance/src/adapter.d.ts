export type ConformanceStatus = 'pass' | 'fail' | 'blocked';

export interface ProviderMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly version: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  metadata(): Promise<ProviderMetadata>;
  registerClient(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  issueAuthorizationCode(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  exchangeToken(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  refreshToken(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  revoke(input: Record<string, unknown>): Promise<void>;
  rotateKeys(): Promise<Record<string, unknown>>;
}

export interface ConformanceCase {
  id: string;
  candidate: string;
  client: string | null;
  clientVersion: string | null;
  expected: unknown;
  actual: unknown;
  status: ConformanceStatus;
  evidence: Array<Record<string, unknown>>;
}

export interface HttpsConformanceFixture {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly issuer: string;
  readonly resource: string;
  readonly caSha256: string | null;
  verifyHostsRestored(): Promise<boolean>;
  verifyTrustRestored(): Promise<boolean>;
}

export interface ClientInteropResult {
  client: string;
  clientVersion: string;
  registrationMode: 'pre-registered' | 'cimd' | 'dcr' | 'automatic-discovery';
  cases: ConformanceCase[];
  conclusion: 'supported' | 'unsupported' | 'blocked';
  evidence: Array<Record<string, unknown>>;
}
