import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmod, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculateJwkThumbprint } from 'jose';
import { LocalPkcs8KeyCustody } from './index.js';

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} is required`);
  return resolve(value);
}

async function generate(): Promise<void> {
  const privateKeyFile = option('private-key-file');
  const passphraseFile = option('passphrase-file');
  const passphrase = randomBytes(48).toString('base64url');
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  const pem = pair.privateKey.export({
    format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase
  });
  await writeFile(privateKeyFile, pem, { flag: 'wx', mode: 0o600 });
  try {
    await writeFile(passphraseFile, passphrase, { flag: 'wx', mode: 0o600 });
    await Promise.all([chmod(privateKeyFile, 0o600), chmod(passphraseFile, 0o600)]);
  } catch (error) {
    await Promise.all([privateKeyFile, passphraseFile].map(async (path) => unlink(path).catch(() => undefined)));
    throw new Error('passphrase_file_write_failed', { cause: error });
  }
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  const kid = await calculateJwkThumbprint(publicJwk, 'sha256');
  process.stdout.write(`${JSON.stringify({ kid, publicJwk: { ...publicJwk, kid, alg: 'RS256', use: 'sig' } })}\n`);
}

async function inspect(): Promise<void> {
  const custody = await LocalPkcs8KeyCustody.load({
    privateKeyFile: option('private-key-file'), passphraseFile: option('passphrase-file')
  });
  const descriptor = await custody.describeSigningKey();
  process.stdout.write(`${JSON.stringify({ kid: descriptor.kid, publicJwk: descriptor.publicJwk })}\n`);
}

const command = process.argv[2];
if (command === 'generate') await generate();
else if (command === 'inspect') await inspect();
else throw new Error('usage: keys:[generate|inspect] --private-key-file PATH --passphrase-file PATH');
