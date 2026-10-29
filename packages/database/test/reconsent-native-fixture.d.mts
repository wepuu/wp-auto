import type { SecretArtifactCodec } from '../src/index.js';
export interface NativeFixtureBinding { grantId: string; accountId: string; clientId: string; resource: string; sessionUid: string }
export function nativeFixturePayload(binding: NativeFixtureBinding): Readonly<NativeFixtureBinding & { kind: 'RefreshToken'; scope: 'mcp:read offline_access' }>;
export function fixtureParent(codec: Pick<SecretArtifactCodec, 'candidates'>, model: 'AuthorizationCode' | 'RefreshToken', rawId: string): { model: 'AuthorizationCode' | 'RefreshToken'; keys: string[] };
