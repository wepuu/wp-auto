import { localDockerEndpoint } from './authorization-build-contract.mjs';
import { postgresFailureCodes } from './postgres-image-gate.mjs';

const deny = code => { throw Object.assign(Error('persistent_image_gate_denied'), { code }); };
const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
export const integrationSteps = Object.freeze(['offline', 'unit', 'database', 'legacy', 'startup', 'control', 'matrix', 'transition']);
export function integrationOptions(env) {
  const context = env.WEPUU_TEST_DOCKER_CONTEXT;
  if (typeof context !== 'string' || !/^[A-Za-z0-9_.-]+$/u.test(context)) deny('LOCAL_CONTEXT_REQUIRED');
  const images = { authorization: env.WEPUU_AUTHORIZATION_IMAGE, control: env.WEPUU_CONTROL_IMAGE, test: env.WEPUU_TEST_IMAGE };
  if (!Object.values(images).every(digest)) deny('IMMUTABLE_IMAGE_IDS_REQUIRED');
  const revisions = { authorization: env.WEPUU_AUTHORIZATION_REVISION, control: env.WEPUU_CONTROL_REVISION, test: env.WEPUU_TEST_REVISION };
  if (!Object.values(revisions).every(v => typeof v === 'string' && /^[a-f0-9]{40}$/u.test(v))) deny('IMAGE_REVISIONS_REQUIRED');
  if (!['', 'allow-isolated'].includes(env.WEPUU_TEST_LEGACY_CONSOLE ?? '')) deny('LEGACY_MODE_INVALID');
  return { context, images, revisions };
}
export function verifyIntegrationContext(values, name) {
  if (!Array.isArray(values) || values.length !== 1 || values[0]?.Name !== name
    || !localDockerEndpoint(values[0].Endpoints?.docker?.Host)) deny('LOCAL_CONTEXT_REQUIRED');
}
export function verifyIntegrationImage(values, id, role, revision) {
  const image = values?.length === 1 ? values[0] : undefined;
  if (!digest(id) || image?.Id !== id || image.Os !== 'linux' || image.Architecture !== 'amd64') deny('IMAGE_ID_OR_PLATFORM_MISMATCH');
  if (image.Config?.Labels?.['org.opencontainers.image.revision'] !== revision) deny('IMAGE_REVISION_MISMATCH');
  const entry = image.Config?.Entrypoint;
  if (entry != null && JSON.stringify(entry) !== '[]' && JSON.stringify(entry) !== '["docker-entrypoint.sh"]') deny('IMAGE_ENTRYPOINT_MISMATCH');
  const command = role === 'test' ? ['pnpm', 'check'] : ['node', `apps/${role === 'control' ? 'control-api' : 'authorization-service'}/dist/main.js`];
  if (!['authorization', 'control', 'test'].includes(role) || JSON.stringify(image.Config?.Cmd) !== JSON.stringify(command)) deny('IMAGE_CMD_MISMATCH');
  if (role !== 'test' && image.Config.User !== 'node') deny('IMAGE_USER_MISMATCH');
  return { id, role, revision, platform: 'linux/amd64', defaultUser: image.Config.User || 'root', directMain: role !== 'test' };
}
export function verifyDiskBudget(bytes, initial = false) {
  const minimum = (initial ? 5 : 2) * 1024 ** 3;
  if (!Number.isSafeInteger(bytes) || bytes < minimum) deny('DISK_BUDGET_NOT_MET');
  return { freeBytes: bytes, minimumBytes: minimum };
}
export function verifyCompiledIdentity(probes) {
  if (probes.length !== 3 || !probes.every(v => v?.version === 'v24.22.1' && v.lts === 'Krypton' && v.uid === 1000
    && /^[a-f0-9]{64}$/u.test(v.hash) && Number.isSafeInteger(v.files) && v.files > 0)
    || !probes.every(v => v.hash === probes[0].hash && v.files === probes[0].files)) deny('COMPILED_INPUT_MISMATCH');
  return { sha256: probes[0].hash, fileCount: probes[0].files, node: 'v24.22.1', lts: 'Krypton', uid: 1000 };
}
export function verifyOwnedStopped(metadata, nonce) {
  if (metadata?.Config?.Labels?.['wepuu.run'] !== nonce || metadata.State?.Running !== false) deny('OWNED_RESOURCE_NOT_STOPPED');
}
export function integrationFailure(error) {
  const codes = new Set(['LOCAL_CONTEXT_REQUIRED', 'IMMUTABLE_IMAGE_IDS_REQUIRED', 'IMAGE_REVISIONS_REQUIRED', 'LEGACY_MODE_INVALID',
    'IMAGE_ID_OR_PLATFORM_MISMATCH', 'IMAGE_REVISION_MISMATCH', 'IMAGE_ENTRYPOINT_MISMATCH', 'IMAGE_CMD_MISMATCH',
    'IMAGE_USER_MISMATCH', 'DISK_BUDGET_NOT_MET', 'COMPILED_INPUT_MISMATCH', 'OWNED_RESOURCE_NOT_STOPPED',
    'SOURCE_INPUT_CHANGED', 'SOURCE_NOT_CLEAN', 'SOURCE_REVISION_MISMATCH', 'POSTGRES_IMAGE_MISSING', ...postgresFailureCodes]);
  return codes.has(error?.code) ? error.code : error?.killed ? 'TIMEOUT' : 'IMAGE_TEST_STOPPED';
}

// No service main, network or credential access. Compare only application build outputs,
// package manifests, frozen dependency inputs and migration source, not later helper scripts.
export const compiledIdentityCode = String.raw`
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
 if(e.name==='node_modules')continue;const p=path.join(dir,e.name);
 if(e.isDirectory())walk(p);else if(e.isFile()&&(p.includes('/dist/')||p.includes('/migrations/')||e.name==='package.json'))files.push(p);
}}
walk('/workspace/apps');walk('/workspace/packages');
for(const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'])files.push('/workspace/'+name);
files.sort();const hash=crypto.createHash('sha256');for(const p of files){hash.update(p.slice('/workspace/'.length)+'\0');hash.update(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')+'\n');}
console.log(JSON.stringify({version:process.version,lts:process.release.lts,uid:process.getuid(),hash:hash.digest('hex'),files:files.length}));
`;
