import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizationBuildArgs, localDockerEndpoint, verifyBuilder, verifyAuthorizationArtifact,
  verifyRuntimeProbe, publicBuildFailure, verifyBuildProcess, verifyUnusedTag } from './authorization-build-contract.mjs';

const revision = '1'.repeat(40), tag = 'wepuu-r4br2-authorization:111111111111-222222222222';
const config = 'sha256:' + 'a'.repeat(64), manifest = 'sha256:' + 'b'.repeat(64);
const fixture = () => ({ exitCode: 0, revision, tag, iid: manifest + '\n', metadata: {
  'containerimage.config.digest': config, 'containerimage.digest': manifest }, images: [{ Id: config, RepoTags: [tag],
    Os: 'linux', Architecture: 'amd64', Config: { User: 'node', Entrypoint: ['docker-entrypoint.sh'],
      Cmd: ['node','apps/authorization-service/dist/main.js'], Labels: { 'org.opencontainers.image.revision': revision } } }] });
const builder = () => ({ contextName: 'desktop-linux', builderName: 'desktop-linux',
  contexts: [{ Name:'desktop-linux', Endpoints:{ docker:{ Host:'npipe:////./pipe/dockerDesktopLinuxEngine' } } }],
  builders: [{ Name:'desktop-linux', Driver:'docker', Nodes:[{Name:'desktop-linux',Endpoint:'desktop-linux',Status:'running',Platforms:['linux/amd64']}] }] });
test('build explicitly loads one platform and writes independent evidence without push', () => {
  const args = authorizationBuildArgs({ context:'desktop-linux',builder:'desktop-linux',revision,tag,iidFile:'/private/image.iid',metadataFile:'/private/build.json' });
  assert(args.includes('--load')); assert(args.includes('--iidfile')); assert(args.includes('--metadata-file'));
  assert(!args.includes('--push')); assert(!args.includes('--no-cache'));
  assert.equal(args[args.indexOf('--platform')+1], 'linux/amd64');
});
test('exit zero with absent artifact is a failure', () => {
  const f=fixture(); f.images=[]; assert.throws(()=>verifyAuthorizationArtifact(f),{code:'IMAGE_NOT_CONFIRMED'});
});
test('exported IID is related to config ID without inventing its descriptor type', () => {
  const f=fixture(), result=verifyAuthorizationArtifact(f);
  assert.equal(result.iidKind,'EXPORT_DIGEST_UNTYPED'); assert.notEqual(result.imageId,result.exportedDigest);
  f.iid=config; assert.equal(verifyAuthorizationArtifact(f).iidKind,'CONFIG_DIGEST');
});
test('missing or malformed metadata and unrelated IID cannot pass', () => {
  for(const metadata of [undefined,null,{},[],{'containerimage.config.digest':config}]) {
    const f=fixture(); f.metadata=metadata; assert.throws(()=>verifyAuthorizationArtifact(f));
  }
  const f=fixture(); f.iid='sha256:'+'c'.repeat(64); assert.throws(()=>verifyAuthorizationArtifact(f),{code:'IMAGE_IID_UNRELATED'});
  f.iid=manifest; f.metadata['containerimage.config.digest']='sha256:'+'c'.repeat(64);
  assert.throws(()=>verifyAuthorizationArtifact(f),{code:'IMAGE_CONFIG_DIGEST_MISMATCH'});
});
test('old tag, old revision, platform, user and entrypoint mismatches are denied', () => {
  for(const mutate of [f=>f.images[0].RepoTags=[],f=>f.images[0].Config.Labels={},f=>f.images[0].Architecture='arm64',
    f=>f.images[0].Os='windows',f=>f.images[0].Config.User='root',f=>f.images[0].Config.Cmd=['sh','-c','migrate && start'],
    f=>f.images[0].Config.Entrypoint=['custom-start'],f=>f.exitCode=1]) {
    const f=fixture(); mutate(f); assert.throws(()=>verifyAuthorizationArtifact(f));
  }
});
test('only single running local matching builders are accepted', () => {
  assert.equal(verifyBuilder(builder()).driver,'docker');
  for(const mutate of [b=>b.contexts[0].Endpoints.docker.Host='tcp://remote:2376',b=>b.builders[0].Driver='remote',
    b=>b.builders[0].Nodes[0].Endpoint='other',b=>b.builders[0].Nodes[0].Status='inactive',
    b=>b.builders[0].Nodes.push({...b.builders[0].Nodes[0]}),b=>b.builders[0].Nodes[0].Platforms=['linux/arm64']]) {
    const b=builder(); mutate(b); assert.throws(()=>verifyBuilder(b));
  }
  assert(localDockerEndpoint('unix:///var/run/docker.sock'));
  assert(!localDockerEndpoint('unix://remote/var/run/docker.sock'));
  assert(!localDockerEndpoint('npipe:////remote/pipe/docker'));
});
test('runtime probe accepts only the fixed LTS non-root runtime', () => {
  assert.equal(verifyRuntimeProbe({version:'v24.22.1',lts:'Krypton',uid:1000}).serviceStarted,false);
  for(const value of [{version:'v26.0.0',lts:false,uid:1000},{version:'v24.22.1',lts:'Krypton',uid:0},null]) {
    assert.throws(()=>verifyRuntimeProbe(value));
  }
});
test('public failure never includes raw errors, secrets or metadata', () => {
  for(const e of [Object.assign(Error('SECRET_SENTINEL'),{code:'SECRET_SENTINEL'}),Error('SECRET_SENTINEL')]) {
    assert.equal(publicBuildFailure(e),'BUILD_GATE_NOT_CONFIRMED');
  }
  assert.equal(publicBuildFailure({code:'BUILD_TIMEOUT',message:'SECRET_SENTINEL'}),'BUILD_TIMEOUT');
});
test('timeout, spawn failure and nonzero exit cannot become successful builds', () => {
  verifyBuildProcess({code:0,signal:null,spawnFailed:false,timedOut:false});
  for(const value of [{code:0,signal:null,spawnFailed:false,timedOut:true},
    {code:1,signal:null,spawnFailed:false,timedOut:false},{code:null,signal:null,spawnFailed:true,timedOut:false},
    {code:0,signal:'SIGTERM',spawnFailed:false,timedOut:false}]) assert.throws(()=>verifyBuildProcess(value));
});
test('preexisting tags are refused rather than overwritten or treated as new outputs', () => {
  verifyUnusedTag(''); verifyUnusedTag('\n');
  assert.throws(()=>verifyUnusedTag('abc123\n'),{code:'IMAGE_TAG_ALREADY_EXISTS'});
});
const indexFixture = () => {
  const f=fixture(); delete f.metadata['containerimage.config.digest'];
  const descriptor={mediaType:'application/vnd.oci.image.index.v1+json',digest:manifest,size:856};
  f.metadata['containerimage.descriptor']={...descriptor};f.images[0].Descriptor={...descriptor};f.images[0].Id=manifest;
  return f;
};
test('modern local OCI index identity is matched by typed metadata and loaded descriptor', () => {
  const r=verifyAuthorizationArtifact(indexFixture());
  assert.equal(r.imageIdKind,'OCI_INDEX');assert.equal(r.configDigest,'NOT_PRESENT');assert.equal(r.iidKind,'OCI_INDEX');
});
test('an omitted config digest does not permit untyped equality to pass', () => {
  const f=indexFixture(); delete f.metadata['containerimage.descriptor'];
  assert.throws(()=>verifyAuthorizationArtifact(f),{code:'IMAGE_DESCRIPTOR_MISMATCH'});
});
test('unknown or mismatched index descriptors and unrelated IIDs are rejected', () => {
  for(const mutate of [f=>f.images[0].Descriptor.mediaType='application/unknown',f=>f.images[0].Descriptor.size++,
    f=>f.images[0].Descriptor.digest=config,f=>delete f.images[0].Descriptor,
    f=>f.metadata['containerimage.descriptor'].mediaType='application/unknown',
    f=>f.metadata['containerimage.descriptor'].digest=config,f=>f.iid=config]) {
    const f=indexFixture();mutate(f);assert.throws(()=>verifyAuthorizationArtifact(f));
  }
});
test('explicit invalid config metadata is not treated as omission', () => {
  for(const value of [null,'invalid',false]) {
    const f=indexFixture(); f.metadata['containerimage.config.digest']=value;
    assert.throws(()=>verifyAuthorizationArtifact(f),{code:'BUILD_METADATA_DIGEST_MISSING'});
  }
});
