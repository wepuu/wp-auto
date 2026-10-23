const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const deny = code => { throw Object.assign(new Error('build_contract_denied'), { code }); };
const requireGate = (value, code) => { if (!value) deny(code); };

export function localDockerEndpoint(value) {
  if (typeof value !== 'string') return false;
  if (/^npipe:\/{4}\.\/pipe\/[A-Za-z0-9_.-]+$/u.test(value)) return true;
  try { const u = new URL(value); return u.protocol === 'unix:' && u.hostname === '' && u.pathname.startsWith('/') && u.pathname.length > 1; }
  catch { return false; }
}

export function verifyBuilder({ contextName, builderName, contexts, builders }) {
  requireGate(Array.isArray(contexts) && Array.isArray(builders), 'BUILDER_RESULT_INVALID');
  const matchingContexts = contexts.filter(c => c?.Name === contextName);
  const matchingBuilders = builders.filter(b => b?.Name === builderName);
  requireGate(matchingContexts.length === 1 && matchingBuilders.length === 1, 'BUILDER_AMBIGUOUS');
  const context = matchingContexts[0], builder = matchingBuilders[0], endpoint = context.Endpoints?.docker?.Host;
  requireGate(localDockerEndpoint(endpoint), 'REMOTE_DOCKER_DENIED');
  requireGate(['docker', 'docker-container'].includes(builder.Driver), 'BUILDER_DRIVER_DENIED');
  requireGate(builder.Nodes?.length === 1, 'BUILDER_NODES_DENIED');
  const node = builder.Nodes[0];
  requireGate(node?.Endpoint === contextName || node?.Endpoint === endpoint, 'BUILDER_ENDPOINT_MISMATCH');
  requireGate(node.Status === 'running', 'BUILDER_NOT_RUNNING');
  requireGate(Array.isArray(node.Platforms) && node.Platforms.includes('linux/amd64'), 'BUILDER_PLATFORM_MISSING');
  return { contextName, builderName, driver: builder.Driver, nodeName: node.Name, nodeEndpoint: node.Endpoint, dockerEndpoint: endpoint };
}

export function authorizationBuildArgs({ context, builder, revision, tag, iidFile, metadataFile }) {
  requireGate(/^[a-f0-9]{40}$/u.test(revision), 'REVISION_INVALID');
  requireGate(/^wepuu-r4br2-authorization:[a-f0-9]{12}-[a-f0-9]{12}$/u.test(tag), 'BUILD_TAG_INVALID');
  requireGate([context, builder].every(v => typeof v === 'string' && /^[A-Za-z0-9_.-]+$/u.test(v)), 'BUILDER_NAME_INVALID');
  requireGate([iidFile, metadataFile].every(v => typeof v === 'string' && v.length > 0) && iidFile !== metadataFile, 'EVIDENCE_PATH_INVALID');
  return ['--context', context, 'buildx', 'build', '--builder', builder, '--platform', 'linux/amd64', '--load',
    '--iidfile', iidFile, '--metadata-file', metadataFile, '--label', `org.opencontainers.image.revision=${revision}`,
    '--file', 'deploy/Authorization.Containerfile', '--tag', tag, '--progress', 'plain', '.'];
}

export function verifyBuildProcess(value) {
  requireGate(value?.spawnFailed === false, 'BUILD_SPAWN_FAILED');
  requireGate(value.timedOut === false, 'BUILD_TIMEOUT');
  requireGate(value.code === 0 && value.signal == null, 'BUILD_EXIT_FAILED');
}

export function verifyUnusedTag(output) {
  requireGate(typeof output === 'string' && output.trim() === '', 'IMAGE_TAG_ALREADY_EXISTS');
}

export function verifyAuthorizationArtifact({ exitCode, revision, tag, iid, metadata, images, artifactRole = 'authorization' }) {
  requireGate(['authorization','test'].includes(artifactRole), 'IMAGE_CMD_MISMATCH');
  requireGate(exitCode === 0, 'BUILD_EXIT_FAILED');
  requireGate(Array.isArray(images) && images.length === 1, 'IMAGE_NOT_CONFIRMED');
  const image = images[0];
  requireGate(digest(image?.Id), 'IMAGE_ID_INVALID');
  requireGate(image.RepoTags?.includes(tag), 'IMAGE_TAG_MISMATCH');
  requireGate(image.Config?.Labels?.['org.opencontainers.image.revision'] === revision, 'IMAGE_REVISION_MISMATCH');
  requireGate(image.Os === 'linux' && image.Architecture === 'amd64', 'IMAGE_PLATFORM_MISMATCH');
  requireGate(artifactRole === 'test' ? ['', 'root', '0'].includes(image.Config?.User ?? '') : image.Config?.User === 'node', 'IMAGE_USER_MISMATCH');
  requireGate(JSON.stringify(image.Config.Cmd) === JSON.stringify(artifactRole === 'test' ? ['pnpm','check'] : ['node', 'apps/authorization-service/dist/main.js']), 'IMAGE_CMD_MISMATCH');
  requireGate(image.Config.Entrypoint == null || image.Config.Entrypoint.length === 0
    || JSON.stringify(image.Config.Entrypoint) === JSON.stringify(['docker-entrypoint.sh']), 'IMAGE_ENTRYPOINT_MISMATCH');
  requireGate(metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata), 'BUILD_METADATA_INVALID');
  const configDigest = metadata['containerimage.config.digest'], exportedDigest = metadata['containerimage.digest'];
  const hasConfig = Object.hasOwn(metadata, 'containerimage.config.digest');
  requireGate(digest(exportedDigest) && (!hasConfig || digest(configDigest)), 'BUILD_METADATA_DIGEST_MISSING');
  const kinds = {
    'application/vnd.oci.image.index.v1+json': 'OCI_INDEX',
    'application/vnd.oci.image.manifest.v1+json': 'OCI_MANIFEST',
    'application/vnd.docker.distribution.manifest.list.v2+json': 'DOCKER_MANIFEST_LIST',
    'application/vnd.docker.distribution.manifest.v2+json': 'DOCKER_MANIFEST'
  };
  const descriptor = metadata['containerimage.descriptor'];
  let exportedDigestKind = 'EXPORT_DIGEST_UNTYPED';
  if (descriptor !== undefined) {
    requireGate(descriptor !== null && typeof descriptor === 'object' && Object.hasOwn(kinds, descriptor.mediaType)
      && descriptor.digest === exportedDigest && Number.isSafeInteger(descriptor.size) && descriptor.size > 0, 'IMAGE_DESCRIPTOR_MISMATCH');
    exportedDigestKind = kinds[descriptor.mediaType];
  }
  let imageIdKind;
  if (hasConfig && configDigest === image.Id) imageIdKind = 'CONFIG_DIGEST';
  else {
    const loaded = image.Descriptor;
    requireGate(descriptor !== undefined && loaded !== null && typeof loaded === 'object'
      && descriptor.mediaType === loaded.mediaType && descriptor.digest === loaded.digest && descriptor.size === loaded.size
      && image.Id === exportedDigest, hasConfig ? 'IMAGE_CONFIG_DIGEST_MISMATCH' : 'IMAGE_DESCRIPTOR_MISMATCH');
    imageIdKind = exportedDigestKind;
  }
  const iidDigest = typeof iid === 'string' ? iid.trim() : undefined;
  requireGate(digest(iidDigest) && [configDigest, exportedDigest].includes(iidDigest), 'IMAGE_IID_UNRELATED');
  return { imageId: image.Id, imageIdKind, configDigest: hasConfig ? configDigest : 'NOT_PRESENT', exportedDigest,
    exportedDigestKind, iidDigest, iidKind: hasConfig && iidDigest === configDigest ? 'CONFIG_DIGEST' : exportedDigestKind, revision,
    platform: 'linux/amd64', user: artifactRole === 'test' ? image.Config.User || 'root' : 'node',
    directMain: artifactRole !== 'test', artifactLinked: true };
}

export const verifyTestArtifact = value => verifyAuthorizationArtifact({ ...value, artifactRole: 'test' });

export function verifyRuntimeProbe(value) {
  requireGate(value !== null && typeof value === 'object' && value.version === 'v24.22.1'
    && value.lts === 'Krypton' && Number.isSafeInteger(value.uid) && value.uid > 0, 'RUNTIME_PROBE_MISMATCH');
  return { version: value.version, lts: value.lts, uid: value.uid, serviceStarted: false, network: 'none' };
}

export function publicBuildFailure(error) {
  const allowed = new Set(['BUILDER_RESULT_INVALID','BUILDER_AMBIGUOUS','REMOTE_DOCKER_DENIED','BUILDER_DRIVER_DENIED',
    'BUILDER_NODES_DENIED','BUILDER_ENDPOINT_MISMATCH','BUILDER_NOT_RUNNING','BUILDER_PLATFORM_MISSING','REVISION_INVALID',
    'BUILD_TAG_INVALID','BUILDER_NAME_INVALID','EVIDENCE_PATH_INVALID','BUILD_EXIT_FAILED','IMAGE_NOT_CONFIRMED','IMAGE_ID_INVALID',
    'IMAGE_TAG_MISMATCH','IMAGE_REVISION_MISMATCH','IMAGE_PLATFORM_MISMATCH','IMAGE_USER_MISMATCH','IMAGE_CMD_MISMATCH',
    'IMAGE_ENTRYPOINT_MISMATCH','BUILD_METADATA_INVALID','BUILD_METADATA_DIGEST_MISSING','IMAGE_CONFIG_DIGEST_MISMATCH','IMAGE_DESCRIPTOR_MISMATCH',
    'IMAGE_IID_UNRELATED','RUNTIME_PROBE_MISMATCH','SOURCE_NOT_CLEAN','SOURCE_REVISION_MISMATCH','SOURCE_CHANGED',
    'BUILDER_CHANGED','IMAGE_TAG_ALREADY_EXISTS','BUILD_TIMEOUT','BUILD_SPAWN_FAILED','PROBE_CLEANUP_NOT_CONFIRMED']);
  return allowed.has(error?.code) ? error.code : error?.killed ? 'COMMAND_TIMEOUT'
    : error?.code === 'EACCES' || error?.code === 'EPERM' ? 'ACCESS_DENIED' : 'BUILD_GATE_NOT_CONFIRMED';
}
