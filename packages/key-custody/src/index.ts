import {
  DescribeKeyCommand,
  GetPublicKeyCommand,
  KeySpec,
  KeyState,
  KeyUsageType,
  KMSClient,
  MessageType,
  SignCommand,
  SigningAlgorithmSpec,
  type DescribeKeyCommandOutput,
  type GetPublicKeyCommandOutput,
  type SignCommandOutput
} from '@aws-sdk/client-kms';
import { createPublicKey, type JsonWebKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';

export const KeyCustodyConfigSchema = z.object({
  region: z.string().min(1).max(64),
  keyId: z.string().min(1).max(2048),
  kid: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u)
}).strict();
export type KeyCustodyConfig = z.infer<typeof KeyCustodyConfigSchema>;

export interface SigningKeyDescriptor {
  readonly kid: string;
  readonly algorithm: 'RS256';
  readonly publicKey: KeyObject;
  readonly publicJwk: Readonly<JsonWebKey & { kid: string; alg: 'RS256'; use: 'sig' }>;
}

export interface KeyCustody {
  describeSigningKey(): Promise<SigningKeyDescriptor>;
  sign(signingInput: Uint8Array): Promise<Uint8Array>;
}

export class KeyCustodyUnavailableError extends Error {
  constructor() {
    super('key_custody_unavailable');
    this.name = 'KeyCustodyUnavailableError';
  }
}

export interface KmsClientLike {
  send(command: DescribeKeyCommand): Promise<DescribeKeyCommandOutput>;
  send(command: GetPublicKeyCommand): Promise<GetPublicKeyCommandOutput>;
  send(command: SignCommand): Promise<SignCommandOutput>;
}

const expectedSigningAlgorithm = SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256;
const allowedKeySpecs: ReadonlySet<KeySpec> = new Set([KeySpec.RSA_2048, KeySpec.RSA_3072, KeySpec.RSA_4096]);

export class AwsKmsKeyCustody implements KeyCustody {
  readonly #config: KeyCustodyConfig;
  readonly #client: KmsClientLike;
  #descriptor: SigningKeyDescriptor | undefined;

  constructor(input: KeyCustodyConfig, client?: KmsClientLike) {
    this.#config = KeyCustodyConfigSchema.parse(input);
    this.#client = client ?? new KMSClient({ region: this.#config.region });
  }

  async describeSigningKey(): Promise<SigningKeyDescriptor> {
    if (this.#descriptor !== undefined) return this.#descriptor;
    try {
      const description = await this.#client.send(new DescribeKeyCommand({ KeyId: this.#config.keyId }));
      const metadata = description.KeyMetadata;
      if (
        metadata?.Enabled !== true ||
        metadata.KeyState !== KeyState.Enabled ||
        metadata.KeyUsage !== KeyUsageType.SIGN_VERIFY ||
        metadata.KeySpec === undefined ||
        !allowedKeySpecs.has(metadata.KeySpec) ||
        metadata.SigningAlgorithms?.includes(expectedSigningAlgorithm) !== true
      ) {
        throw new KeyCustodyUnavailableError();
      }

      const result = await this.#client.send(new GetPublicKeyCommand({ KeyId: this.#config.keyId }));
      if (!(result.PublicKey instanceof Uint8Array)) throw new KeyCustodyUnavailableError();
      const publicKey = createPublicKey({ key: Buffer.from(result.PublicKey), format: 'der', type: 'spki' });
      const publicJwk = {
        ...publicKey.export({ format: 'jwk' }),
        kid: this.#config.kid,
        alg: 'RS256',
        use: 'sig'
      } as const;
      this.#descriptor = Object.freeze({
        kid: this.#config.kid,
        algorithm: 'RS256',
        publicKey,
        publicJwk: Object.freeze(publicJwk)
      });
      return this.#descriptor;
    } catch {
      throw new KeyCustodyUnavailableError();
    }
  }

  async sign(signingInput: Uint8Array): Promise<Uint8Array> {
    if (signingInput.byteLength === 0 || signingInput.byteLength > 4096) {
      throw new KeyCustodyUnavailableError();
    }
    await this.describeSigningKey();
    try {
      const result = await this.#client.send(new SignCommand({
        KeyId: this.#config.keyId,
        Message: signingInput,
        MessageType: MessageType.RAW,
        SigningAlgorithm: expectedSigningAlgorithm
      }));
      if (!(result.Signature instanceof Uint8Array)) throw new KeyCustodyUnavailableError();
      return new Uint8Array(result.Signature);
    } catch {
      throw new KeyCustodyUnavailableError();
    }
  }
}

export function keyCustodyConfigFromEnvironment(environment: NodeJS.ProcessEnv): KeyCustodyConfig {
  return KeyCustodyConfigSchema.parse({
    region: environment['AWS_REGION'],
    keyId: environment['WEPUU_KMS_KEY_ID'],
    kid: environment['WEPUU_KMS_KID']
  });
}
