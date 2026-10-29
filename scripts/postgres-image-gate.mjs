// Preparation is explicit; the matrix only inspects and runs with --pull=never.
// No Docker call, credential access or process execution at module import.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const postgresFailureCodes = Object.freeze([
  'POSTGRES_PIN_PROVENANCE_NOT_CONFIRMED', 'POSTGRES_IMAGE_NOT_FOUND',
  'POSTGRES_INSPECT_TIMEOUT', 'POSTGRES_INSPECT_FAILED',
  'POSTGRES_PULL_TIMEOUT', 'POSTGRES_PULL_FAILED',
  'POSTGRES_METADATA_INVALID', 'POSTGRES_IDENTITY_MISMATCH'
]);
const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const fail = (code, diagnostic) => {
  throw Object.assign(Error('postgres_image_gate_denied'), { code, postgresDiagnostic: diagnostic });
};
const normalizedReference = value => typeof value === 'string'
  ? value.replace(/^(?:docker\.io\/)?(?:library\/)?postgres@/u, 'docker.io/library/postgres@') : undefined;

export function postgresPlan(spec) {
  const configDigest = spec?.schemaVersion === 2 ? spec.expectedConfigDigest : spec?.expectedImageId;
  if (![1, 2].includes(spec?.schemaVersion) || spec.provenanceConfirmed !== true
    || spec.provenanceStatus !== 'VERIFIED_REPOSITORY_AND_IMAGE_ID'
    || spec.repository !== 'docker.io/library/postgres' || !digest(spec.repositoryDigest)
    || !digest(configDigest) || spec.repositoryDigest === configDigest
    || (spec.schemaVersion === 2 && (!['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(spec.manifestMediaType)
      || !Array.isArray(spec.bindingEvidence) || spec.bindingEvidence.length !== 2
      || !spec.bindingEvidence.every(e => typeof e.path === 'string' && /^(?:docs|test)\/[A-Za-z0-9_./-]+$/u.test(e.path) && !e.path.split('/').includes('..') && /^[a-f0-9]{64}$/u.test(e.sha256))))
    || spec.platform !== 'linux/amd64' || spec.major !== '16' || spec.version !== '16.10'
    || spec.dataDirectory !== '/var/lib/postgresql/data'
    || !Array.isArray(spec.sources) || spec.sources.length === 0
    || !spec.sources.every(value => typeof value === 'string' && value.length > 0)) {
    fail('POSTGRES_PIN_PROVENANCE_NOT_CONFIRMED');
  }
  return Object.freeze({ reference: `${spec.repository}@${spec.repositoryDigest}`,
    expectedImageId: configDigest, configDigest, platform: spec.platform,
    major: spec.major, version: spec.version, dataDirectory: spec.dataDirectory });
}

export async function verifyConfigBinding(spec) {
  const plan = postgresPlan(spec);
  if (spec.schemaVersion !== 2) return false;
  let receipt;
  try {
    for (const entry of spec.bindingEvidence) {
      const bytes = await readFile(new URL('../' + entry.path, import.meta.url));
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error();
      if (entry.path === 'test/persistent-authorization/r101/result.json') receipt = JSON.parse(bytes);
    }
    if (!receipt?.passed || receipt.manifestConfigChainPass !== true || receipt.postgresMetadataPass !== true
      || receipt.platformManifestDigest !== spec.repositoryDigest || receipt.configDigest !== plan.configDigest
      || receipt.suggestedPin?.repository !== spec.repository || receipt.suggestedPin?.platform !== spec.platform
      || receipt.suggestedPin?.version !== spec.version || receipt.suggestedPin?.major !== spec.major
      || receipt.suggestedPin?.dataDirectory !== spec.dataDirectory
      || !['platform', 'major', 'version', 'dataDirectory'].every(k => receipt.configurationChecks?.[k] === true)) throw Error();
  } catch { fail('POSTGRES_PIN_PROVENANCE_NOT_CONFIRMED'); }
  return true;
}

export function safePostgresCommandDiagnostic(result, operation) {
  return { operation: ['pull', 'inspect', 'context'].includes(operation) ? operation : 'inspect',
    exitCode: Number.isSafeInteger(result?.exitCode) ? result.exitCode : null,
    signal: ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGINT'].includes(result?.signal) ? result.signal : null,
    elapsedMs: Number.isSafeInteger(result?.elapsedMs) && result.elapsedMs >= 0 ? result.elapsedMs : null,
    timedOut: result?.timedOut === true,
    outputLimitExceeded: result?.outputLimitExceeded === true,
    spawnCategory: ['ENOENT', 'EACCES', 'EPERM'].includes(result?.spawnCode) ? result.spawnCode : null };
}

async function command(execute, args, operation, plan) {
  let result;
  try { result = await execute(args, { timeoutMs: operation === 'pull' ? 120000 : 20000 }); }
  catch { fail(operation === 'pull' ? 'POSTGRES_PULL_FAILED' : 'POSTGRES_INSPECT_FAILED',
    safePostgresCommandDiagnostic(undefined, operation)); }
  const diagnostic = safePostgresCommandDiagnostic(result, operation);
  if (result?.timedOut === true) fail(operation === 'pull' ? 'POSTGRES_PULL_TIMEOUT' : 'POSTGRES_INSPECT_TIMEOUT', diagnostic);
  if (result?.ok !== true || result.exitCode !== 0 || result.outputLimitExceeded === true
    || typeof result.stdout !== 'string' || result.stdout.length > 1000000) {
    // Only this exact daemon response to this exact inspect is absence evidence.
    // Other Docker failures, CLI spawn failures and translated errors stay generic.
    const missing = operation === 'inspect' && result?.exitCode === 1
      && result.spawnCode == null && result.signal == null && result.outputLimitExceeded !== true
      && typeof result.stderr === 'string'
      && result.stderr.trim() === `Error response from daemon: No such image: ${plan.reference}`;
    fail(missing ? 'POSTGRES_IMAGE_NOT_FOUND'
      : operation === 'pull' ? 'POSTGRES_PULL_FAILED' : 'POSTGRES_INSPECT_FAILED', diagnostic);
  }
  return { stdout: result.stdout, diagnostic };
}

export async function inspectPostgresImage(spec, execute) {
  const plan = postgresPlan(spec);
  const configBindingEvidenceVerified = await verifyConfigBinding(spec);
  const { stdout, diagnostic } = await command(execute, ['image', 'inspect', plan.reference], 'inspect', plan);
  let values;
  try { values = JSON.parse(stdout); } catch { fail('POSTGRES_METADATA_INVALID', diagnostic); }
  if (!Array.isArray(values) || values.length !== 1 || values[0] == null
    || typeof values[0] !== 'object' || !Array.isArray(values[0].RepoDigests)
    || !Array.isArray(values[0].Config?.Env)) fail('POSTGRES_METADATA_INVALID', diagnostic);
  const image = values[0];
  const exactEnv = (key, expected) => {
    const entries = image.Config.Env.filter(value => typeof value === 'string' && value.startsWith(key + '='));
    return entries.length === 1 && entries[0] === key + '=' + expected;
  };
  const descriptor = image.Descriptor;
  const descriptorMatches = descriptor?.digest === spec.repositoryDigest && descriptor?.mediaType === spec.manifestMediaType;
  const configId = image.Id === plan.configDigest && (descriptor == null || (spec.schemaVersion === 2 && descriptorMatches));
  const manifestId = spec.schemaVersion === 2 && configBindingEvidenceVerified && image.Id === spec.repositoryDigest && descriptorMatches;
  if ((!configId && !manifestId) || image.Os !== 'linux' || image.Architecture !== 'amd64'
    || !image.RepoDigests.some(value => normalizedReference(value) === plan.reference)
    || !exactEnv('PG_MAJOR', plan.major)
    || !exactEnv('PG_VERSION', plan.version)
    || !exactEnv('PGDATA', plan.dataDirectory)) fail('POSTGRES_IDENTITY_MISMATCH', diagnostic);
  return { reference: plan.reference, imageId: image.Id, configDigest: plan.configDigest,
    identityMode: configId ? 'CONFIG_ID' : 'MANIFEST_DESCRIPTOR_ID', configBindingEvidenceVerified, platform: plan.platform,
    major: plan.major, version: plan.version, diagnostic };
}

export async function preparePostgresImage(spec, execute) {
  const plan = postgresPlan(spec); // Must precede even the first Docker command.
  await verifyConfigBinding(spec); // Reject invalid v2 provenance before pull.
  await command(execute, ['image', 'pull', '--platform', plan.platform, plan.reference], 'pull', plan);
  return inspectPostgresImage(spec, execute);
}

export function safePostgresFailure(error) {
  const code = postgresFailureCodes.includes(error?.code) ? error.code : 'POSTGRES_INSPECT_FAILED';
  const d = error?.postgresDiagnostic;
  return { category: code, ...(d ? { diagnostic: safePostgresCommandDiagnostic({ exitCode: d.exitCode,
    signal: d.signal, elapsedMs: d.elapsedMs, timedOut: d.timedOut,
    outputLimitExceeded: d.outputLimitExceeded, spawnCode: d.spawnCategory }, d.operation === 'pull' ? 'pull' : 'inspect') } : {}),
    rawErrorSuppressed: true };
}
