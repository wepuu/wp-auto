import { readFile } from 'node:fs/promises';
import { postgresPlan, preparePostgresImage, safePostgresFailure, safePostgresCommandDiagnostic } from './postgres-image-gate.mjs';
import { postgresDockerExecutor } from './postgres-docker-executor.mjs';
import { verifyIntegrationContext } from './persistent-image-contract.mjs';

// Fixed local context: no DOCKER_BIN/DOCKER_HOST override and no registry login.
const env = { ...process.env };
for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
  'BUILDX_BUILDER', 'BUILDKIT_HOST']) delete env[name];
let stage = 'postgres_pin';
try {
  let spec;
  try { spec = JSON.parse(await readFile(new URL('../test/persistent-authorization/postgres-pin.json', import.meta.url), 'utf8')); }
  catch { throw Object.assign(Error('postgres_metadata_invalid'), { code: 'POSTGRES_METADATA_INVALID' }); }
  postgresPlan(spec);
  stage = 'preparation_context';
  const execute = postgresDockerExecutor('docker', ['--context', 'default'], env);
  const context = await execute(['context', 'inspect', 'default'], { timeoutMs: 20000 });
  try {
    if (!context.ok || context.timedOut || context.outputLimitExceeded) throw Error('invalid_context');
    verifyIntegrationContext(JSON.parse(context.stdout), 'default');
  } catch { throw Object.assign(Error('local_context_required'), { code: 'LOCAL_CONTEXT_REQUIRED',
    contextDiagnostic: safePostgresCommandDiagnostic(context, 'context') }); }
  stage = 'postgres_prepare';
  const image = await preparePostgresImage(spec, execute);
  console.log(JSON.stringify({ passed: true, image, productionAccessed: false, automaticRetryPerformed: false }));
} catch (error) {
  const failure = error?.code === 'LOCAL_CONTEXT_REQUIRED'
    ? { category: 'LOCAL_CONTEXT_REQUIRED', diagnostic: error.contextDiagnostic, rawErrorSuppressed: true } : safePostgresFailure(error);
  console.log(JSON.stringify({ passed: false, failedStage: stage, ...failure,
    productionAccessed: false, automaticRetryPerformed: false }));
  process.exitCode = 1;
}
