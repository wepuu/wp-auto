import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import test from 'node:test';
import {
  DescribeKeyCommand,
  GetPublicKeyCommand,
  KeySpec,
  KeyState,
  KeyUsageType,
  SignCommand,
  SigningAlgorithmSpec,
  type DescribeKeyCommandOutput,
  type GetPublicKeyCommandOutput,
  type SignCommandOutput
} from '@aws-sdk/client-kms';
import {
  AwsKmsKeyCustody,
  createAwsKmsConsentRequestSigner,
  JoseConsentRequestSigner,
  KeyCustodyUnavailableError,
  type KmsClientLike
} from '../src/index.js';

function fakeClient(enabled = true): KmsClientLike {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    async send(command: DescribeKeyCommand | GetPublicKeyCommand | SignCommand): Promise<DescribeKeyCommandOutput | GetPublicKeyCommandOutput | SignCommandOutput> {
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            Enabled: enabled,
            KeyState: enabled ? KeyState.Enabled : KeyState.Disabled,
            KeyUsage: KeyUsageType.SIGN_VERIFY,
            KeySpec: KeySpec.RSA_2048,
            SigningAlgorithms: [SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256]
          }
        };
      }
      if (command instanceof GetPublicKeyCommand) {
        return { PublicKey: pair.publicKey.export({ format: 'der', type: 'spki' }) };
      }
      if (command instanceof SignCommand) {
        return { Signature: sign('RSA-SHA256', command.input.Message ?? new Uint8Array(), pair.privateKey) };
      }
      throw new Error('unexpected_command');
    }
  } as KmsClientLike;
}

const config = { region: 'us-east-1', keyId: 'test-key-reference', kid: 'kms-key-0001' };

test('live AWS KMS contract signs without exporting private material', {
  skip: process.env['WEPUU_LIVE_KMS'] !== '1'
}, async () => {
  const region = process.env['AWS_REGION'];
  const keyId = process.env['WEPUU_KMS_KEY_ID'];
  const kid = process.env['WEPUU_KMS_KID'];
  assert.ok(region);
  assert.ok(keyId);
  assert.ok(kid);
  const custody = new AwsKmsKeyCustody({ region, keyId, kid });
  const descriptor = await custody.describeSigningKey();
  const input = Buffer.from('wepuu-live-kms-contract');
  const signature = await custody.sign(input);
  assert.equal(descriptor.publicJwk.d, undefined);
  assert.equal(verify('RSA-SHA256', input, descriptor.publicKey, signature), true);
});

test('live AWS KMS JOSE consent signs without exporting private material', {
  skip: process.env['WEPUU_LIVE_KMS'] !== '1'
}, async () => {
  const region = process.env['AWS_REGION'];
  const keyId = process.env['WEPUU_KMS_KEY_ID'];
  const kid = process.env['WEPUU_KMS_KID'];
  assert.ok(region && keyId && kid);
  const custody = new AwsKmsKeyCustody({ region, keyId, kid });
  const descriptor = await custody.describeSigningKey();
  const signer = createAwsKmsConsentRequestSigner({ region, keyId, kid });
  const issuedAt = Math.floor(Date.now() / 1_000);
  const token = await signer.sign({
    kind: 'consent_request', iss: 'https://auth.example.test',
    tenant_id: '11111111-1111-4111-8111-111111111111', iat: issuedAt, exp: issuedAt + 120
  });
  const verified = await jwtVerify(token, descriptor.publicKey, {
    algorithms: ['RS256'], issuer: 'https://auth.example.test'
  });
  assert.equal(verified.protectedHeader.kid, kid);
  assert.equal(verified.protectedHeader.typ, 'wepuu-consent-request+jwt');
  assert.equal(verified.payload['kind'], 'consent_request');
  assert.equal('d' in descriptor.publicJwk, false);
});

test('AWS KMS custody exposes only public material and produces RS256 signatures', async () => {
  const custody = new AwsKmsKeyCustody(config, fakeClient());
  const descriptor = await custody.describeSigningKey();
  const input = Buffer.from('protected.payload');
  const signature = await custody.sign(input);
  assert.equal(descriptor.algorithm, 'RS256');
  assert.equal(descriptor.publicJwk.d, undefined);
  assert.equal(verify('RSA-SHA256', input, descriptor.publicKey, signature), true);
});

test('AWS KMS custody fails closed for disabled or malformed keys', async () => {
  const custody = new AwsKmsKeyCustody(config, fakeClient(false));
  await assert.rejects(custody.describeSigningKey(), KeyCustodyUnavailableError);
  await assert.rejects(custody.sign(new Uint8Array()), KeyCustodyUnavailableError);
});

test('AWS KMS JOSE signer rejects unsafe OpenSSL STORE parameters before provider access', () => {
  assert.throws(
    () => createAwsKmsConsentRequestSigner({ ...config, keyId: 'key;region=attacker-region-1' }),
    KeyCustodyUnavailableError
  );
  assert.throws(
    () => createAwsKmsConsentRequestSigner({ ...config, region: 'us-east-1;debug=1' }),
    KeyCustodyUnavailableError
  );
  assert.throws(
    () => createAwsKmsConsentRequestSigner({ ...config, keyId: 'alias/rotatable-key' }),
    KeyCustodyUnavailableError
  );
});

test('JOSE consent signer fixes RS256 type and key identifier without exposing private material', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signer = new JoseConsentRequestSigner(pair.privateKey, 'kms-key-0001');
  const token = await signer.sign({
    kind: 'consent_request', iss: 'https://auth.example.test', tenant_id: '11111111-1111-4111-8111-111111111111',
    iat: 1_790_000_000, exp: 1_790_000_120
  });
  assert.deepEqual(decodeProtectedHeader(token), {
    alg: 'RS256', typ: 'wepuu-consent-request+jwt', kid: 'kms-key-0001'
  });
  const verified = await jwtVerify(token, pair.publicKey, {
    algorithms: ['RS256'], issuer: 'https://auth.example.test', clockTolerance: 0,
    currentDate: new Date(1_790_000_001_000)
  });
  assert.equal(verified.payload['kind'], 'consent_request');
  assert.equal(JSON.stringify(verified.protectedHeader).includes('private'), false);
});
