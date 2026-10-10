import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';

const docker = process.env['DOCKER_BIN'] ?? 'docker';
const authorizationImage = process.env['WEPUU_AUTHORIZATION_IMAGE'] ?? 'wepuu-authorization:candidate';
const controlImage = process.env['WEPUU_CONTROL_IMAGE'] ?? 'wepuu-control:candidate';
const adminDatabaseUrl = process.env['WEPUU_OCI_POSTGRES_ADMIN_URL'];
const containerDatabaseBaseUrl = process.env['WEPUU_OCI_CONTAINER_DATABASE_URL'];
if (adminDatabaseUrl === undefined || containerDatabaseBaseUrl === undefined) {
  throw new Error('WEPUU_OCI_POSTGRES_ADMIN_URL and WEPUU_OCI_CONTAINER_DATABASE_URL are required');
}

const suffix = randomBytes(6).toString('hex');
const databaseName = `wepuu_oci_${suffix}`;
const volumeName = `wepuu-local-signing-${suffix}`;
const containerName = `wepuu-authorization-${suffix}`;
const slot = `candidate-${suffix}`;
const privateKeyPath = '/run/secrets/private.pem';
const passphrasePath = '/run/secrets/passphrase';
const keyringPath = '/run/secrets/keyring.json';
const accountAuthSecretsPath = '/run/secrets/account-auth-secrets.json';
const containerDatabaseUrl = new URL(containerDatabaseBaseUrl);
containerDatabaseUrl.pathname = `/${databaseName}`;

function execute(args, options = {}) {
  const result = spawnSync(docker, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...(options.environment ?? {}) }
  });
  if (result.error !== undefined) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`docker command failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function dockerRun(image, command, options = {}) {
  const args = ['run', '--rm'];
  if (options.readOnly === true) args.push('--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true');
  if (options.user !== undefined) args.push('--user', options.user);
  if (options.volume === true) args.push('--mount', `type=volume,source=${volumeName},target=/run/secrets`);
  if (options.hostGateway === true) args.push('--add-host', 'host.docker.internal:host-gateway');
  for (const name of Object.keys(options.environment ?? {})) args.push('--env', name);
  if (options.entrypoint !== undefined) args.push('--entrypoint', options.entrypoint);
  args.push(image, ...command);
  return execute(args, { environment: options.environment, allowFailure: options.allowFailure });
}

async function createDatabase() {
  const client = new pg.Client({ connectionString: adminDatabaseUrl, application_name: 'wepuu-local-signing-oci-setup' });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await client.end();
  }
}

async function queryCandidate(text, values = []) {
  const hostUrl = new URL(adminDatabaseUrl);
  hostUrl.pathname = `/${databaseName}`;
  const client = new pg.Client({ connectionString: hostUrl.toString(), application_name: 'wepuu-local-signing-oci-gate' });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  const client = new pg.Client({ connectionString: adminDatabaseUrl, application_name: 'wepuu-local-signing-oci-cleanup' });
  await client.connect();
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await client.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  } finally {
    await client.end();
  }
}

let databaseCreated = false;
try {
  execute(['image', 'inspect', authorizationImage]);
  execute(['image', 'inspect', controlImage]);
  await createDatabase();
  databaseCreated = true;
  execute(['volume', 'create', volumeName]);

  dockerRun(authorizationImage, ['-ec', 'chown 1000:1000 /run/secrets && chmod 0700 /run/secrets'], {
    user: '0:0', volume: true, entrypoint: 'sh'
  });
  dockerRun(authorizationImage, [
    'packages/key-custody/dist/cli.js', 'generate',
    '--private-key-file', privateKeyPath, '--passphrase-file', passphrasePath
  ], { volume: true, entrypoint: 'node' });
  const keyring = JSON.stringify({ keys: [{ slot, privateKeyFile: privateKeyPath, passphraseFile: passphrasePath }] });
  dockerRun(authorizationImage, [
    '-e', "require('node:fs').writeFileSync(process.argv[1], process.argv[2], {encoding:'utf8',mode:0o600})",
    keyringPath, keyring
  ], { volume: true, entrypoint: 'node' });
  const accountAuthSecrets = JSON.stringify({
    secrets: [{ version: 1, value: randomBytes(32).toString('base64url') }]
  });
  dockerRun(authorizationImage, [
    '-e', "require('node:fs').writeFileSync(process.argv[1], process.argv[2], {encoding:'utf8',mode:0o600})",
    accountAuthSecretsPath, accountAuthSecrets
  ], { volume: true, entrypoint: 'node' });
  dockerRun(authorizationImage, ['-ec', 'chown 1000:1000 /run/secrets/* && chmod 0600 /run/secrets/*'], {
    user: '0:0', volume: true, entrypoint: 'sh'
  });

  const inspection = dockerRun(authorizationImage, [
    'packages/key-custody/dist/cli.js', 'inspect',
    '--private-key-file', privateKeyPath, '--passphrase-file', passphrasePath
  ], { volume: true, entrypoint: 'node' });
  const descriptor = JSON.parse(inspection.stdout.trim());
  if (!/^[A-Za-z0-9_-]{43}$/u.test(descriptor.kid) || descriptor.publicJwk?.alg !== 'RS256') {
    throw new Error('generated key metadata is invalid');
  }

  const databaseEnvironment = { WEPUU_DATABASE_URL: containerDatabaseUrl.toString() };
  dockerRun(authorizationImage, ['packages/database/dist/cli.js', 'migrate'], {
    hostGateway: true, entrypoint: 'node', environment: databaseEnvironment
  });
  dockerRun(authorizationImage, ['packages/database/dist/signing-keys-cli.js', 'publish', '--slot', slot], {
    hostGateway: true, volume: true, entrypoint: 'node',
    environment: { ...databaseEnvironment, WEPUU_SIGNING_KEYRING_FILE: keyringPath }
  });
  await queryCandidate(
    "UPDATE oauth.signing_key_metadata SET publish_at = now() - interval '21 minutes' WHERE kid = $1",
    [descriptor.kid]
  );
  dockerRun(authorizationImage, ['packages/database/dist/signing-keys-cli.js', 'activate', '--kid', descriptor.kid], {
    hostGateway: true, entrypoint: 'node', environment: databaseEnvironment
  });

  const secretEnvironment = {
    WEPUU_DATABASE_URL: containerDatabaseUrl.toString(),
    WEPUU_ACCOUNT_AUTH_SECRETS_FILE: accountAuthSecretsPath,
    WEPUU_COOKIE_KEYS_JSON: JSON.stringify([randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')]),
    WEPUU_OAUTH_ARTIFACT_KEYS_JSON: JSON.stringify([randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')]),
    WEPUU_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString('base64url'),
    WEPUU_OPERATIONS_METRICS_TOKEN: randomBytes(32).toString('base64url'),
    WEPUU_TRUSTED_PROXY_CIDRS_JSON: JSON.stringify(['172.16.0.0/12'])
  };
  const publicEnvironment = {
    WEPUU_ISSUER: 'https://auth.wepuu.com', WEPUU_AUTH_HOST: '0.0.0.0', WEPUU_AUTH_PORT: '3001',
    WEPUU_DEPLOYMENT_MODE: 'production', WEPUU_SIGNING_KEYRING_FILE: keyringPath, WEPUU_SIGNING_KEY_SLOT: slot,
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://auth.wepuu.com', WEPUU_PRODUCT_NAME: 'WePuu',
    WEPUU_LEGAL_PROVIDER_NAME: 'WePuu OCI Test Operator', WEPUU_TERMS_URL: 'https://wepuu.com/terms',
    WEPUU_PRIVACY_URL: 'https://wepuu.com/privacy', WEPUU_SUPPORT_URL: 'https://wepuu.com/support',
    WEPUU_STATUS_URL: 'https://status.wepuu.com', WEPUU_DATA_REGION_LABEL: 'OCI Test Region',
    WEPUU_RELEASE_VERSION: '0.5.0-local', WEPUU_RELEASE_REVISION: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    WEPUU_IDENTITY_PROVIDER_LABEL: 'OCI Test OIDC', WEPUU_RETENTION_POLICY_VERSION: '2026-10-08',
    WEPUU_COMPATIBILITY_MATRIX_VERSION: '2026-10'
  };
  const runtimeEnvironment = { ...secretEnvironment, ...publicEnvironment };
  const runArgs = [
    'run', '-d', '--name', containerName, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--mount', `type=volume,source=${volumeName},target=/run/secrets,readonly`,
    '--add-host', 'host.docker.internal:host-gateway'
  ];
  for (const name of Object.keys(runtimeEnvironment)) runArgs.push('--env', name);
  runArgs.push(authorizationImage);
  execute(runArgs, { environment: runtimeEnvironment });

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = execute([
      'exec', containerName, 'node', '-e',
      "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ], { allowFailure: true });
    if (probe.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`authorization container did not become ready: ${execute(['logs', containerName]).stdout}`);

  const jwksResult = execute([
    'exec', containerName, 'node', '-e',
    "fetch('http://127.0.0.1:3001/jwks').then(r=>r.text()).then(console.log)"
  ]);
  const jwks = JSON.parse(jwksResult.stdout.trim());
  const privateMembers = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];
  if (jwks.keys?.length !== 1 || jwks.keys[0]?.kid !== descriptor.kid || jwks.keys[0]?.alg !== 'RS256'
      || privateMembers.some((member) => jwks.keys[0]?.[member] !== undefined)) {
    throw new Error('JWKS is not the expected public-only RS256 set');
  }
  const stored = await queryCandidate('SELECT custody_reference, public_jwk::text AS public_jwk FROM oauth.signing_key_metadata');
  if (stored.rows.length !== 1 || stored.rows[0].custody_reference !== slot
      || /PRIVATE KEY|passphrase|\/run\/secrets/iu.test(stored.rows[0].public_jwk)) {
    throw new Error('database signing metadata contains an unexpected secret or reference');
  }
  const logs = execute(['logs', containerName]).stdout;
  if (/BEGIN ENCRYPTED PRIVATE KEY|passphrase/iu.test(logs)) throw new Error('authorization logs contain signing secret material');

  execute(['rm', '-f', containerName]);
  dockerRun(authorizationImage, ['-ec', `chmod 0444 ${privateKeyPath}`], {
    user: '0:0', volume: true, entrypoint: 'sh'
  });
  const unsafe = dockerRun(authorizationImage, [
    '--input-type=module', '-e',
    "import { localPkcs8KeyCustodyFromEnvironment } from './packages/key-custody/dist/index.js'; await localPkcs8KeyCustodyFromEnvironment(process.env, process.env.WEPUU_SIGNING_KEY_SLOT);"
  ], {
    readOnly: true, volume: true, entrypoint: 'node', allowFailure: true,
    environment: { WEPUU_DEPLOYMENT_MODE: 'production', WEPUU_SIGNING_KEYRING_FILE: keyringPath, WEPUU_SIGNING_KEY_SLOT: slot }
  });
  if (unsafe.status === 0 || !/key_custody_unavailable/u.test(unsafe.stderr)) {
    throw new Error('overbroad private-key permissions did not fail closed');
  }

  for (const image of [authorizationImage, controlImage]) {
    const dependency = dockerRun(image, [
      '-e', "try{require.resolve('@aws-sdk/client-kms');process.exit(1)}catch{process.exit(0)}"
    ], { entrypoint: 'node', allowFailure: true });
    if (dependency.status !== 0) throw new Error(`${image} still resolves the AWS KMS SDK`);
    const history = execute(['history', '--no-trunc', image]).stdout;
    if (/BEGIN ENCRYPTED PRIVATE KEY/iu.test(history)) throw new Error(`${image} history contains a private key`);
  }

  process.stdout.write(`LOCAL_SIGNING_OCI_PASS=True\nLOCAL_SIGNING_KID=${descriptor.kid}\nJWKS_PRIVATE_MEMBERS=0\nAWS_KMS_RUNTIME_DEPENDENCY=absent\n`);
} finally {
  execute(['rm', '-f', containerName], { allowFailure: true });
  execute(['volume', 'rm', '-f', volumeName], { allowFailure: true });
  if (databaseCreated) await dropDatabase().catch(() => undefined);
}
