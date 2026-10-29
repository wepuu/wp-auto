import assert from 'node:assert/strict';
import test from 'node:test';
import { R2_ARTIFACT, revalidationDockerArgs, revalidateExistingAuthorization, revalidationFailure } from './authorization-revalidation.mjs';

const fixture=()=>{
  const descriptor={mediaType:'application/vnd.oci.image.index.v1+json',digest:R2_ARTIFACT.imageId,size:856};
  const image={Id:R2_ARTIFACT.imageId,RepoTags:[R2_ARTIFACT.tag],Os:'linux',Architecture:'amd64',Descriptor:{...descriptor},
    Config:{User:'node',Entrypoint:['docker-entrypoint.sh'],Cmd:['node','apps/authorization-service/dist/main.js'],
      Labels:{'org.opencontainers.image.revision':R2_ARTIFACT.buildRevision}}};
  return {receipt:{revision:R2_ARTIFACT.buildRevision,source:{head:R2_ARTIFACT.buildRevision},tag:R2_ARTIFACT.tag,attempts:1},
    buildProcess:{code:0,signal:null,timedOut:false,spawnFailed:false},iid:R2_ARTIFACT.imageId,
    metadata:{'containerimage.digest':R2_ARTIFACT.imageId,'containerimage.descriptor':descriptor},
    images:[image],identityImages:[structuredClone(image)]};
};
test('read-only flow keeps the original build revision and probes exactly once',async()=>{
  let probes=0,finishes=0;const stages=[];
  const result=await revalidateExistingAuthorization({readEvidence:async()=>fixture(),probe:async id=>{
    assert.equal(id,R2_ARTIFACT.imageId);probes++;return {version:'v24.22.1',lts:'Krypton',uid:1000};
  },postflight:async()=>{finishes++;},onStage:s=>stages.push(s)});
  assert(result.passed);assert.equal(result.imageBuildRevision,R2_ARTIFACT.buildRevision);
  assert.equal(probes,1);assert.equal(finishes,1);assert.deepEqual(stages,['evidence','artifact','probe','postflight']);
});
test('missing evidence, wrong build receipt or invalid artifact never starts a probe',async()=>{
  for(const mutate of [x=>delete x.receipt,x=>x.receipt.revision='9'.repeat(40),x=>delete x.metadata,
    x=>x.buildProcess.code=1,x=>x.images=[],x=>x.identityImages[0].Id='sha256:'+'f'.repeat(64)]) {
    const f=fixture();mutate(f);let probes=0;
    await assert.rejects(()=>revalidateExistingAuthorization({readEvidence:async()=>f,
      probe:async()=>{probes++;throw Error('SECRET_SENTINEL');},postflight:async()=>assert.fail()}));
    assert.equal(probes,0);
  }
});
test('a missing input reader fails before probe and does not fall back to a build',async()=>{
  let probes=0;await assert.rejects(()=>revalidateExistingAuthorization({readEvidence:async()=>{throw {code:'R3_INPUT_MISSING'};},
    probe:async()=>{probes++;},postflight:async()=>assert.fail()}));assert.equal(probes,0);
});
test('runtime failure is not retried and does not run postflight',async()=>{
  let probes=0,finishes=0;await assert.rejects(()=>revalidateExistingAuthorization({readEvidence:async()=>fixture(),
    probe:async()=>{probes++;return {version:'v26.0.0',lts:false,uid:0};},postflight:async()=>{finishes++;}}));
  assert.equal(probes,1);assert.equal(finishes,0);
});
test('closed Docker command set denies build, pull, load, push, retag and exec',()=>{
  const opts={context:'desktop-linux',nonce:'1'.repeat(12)};
  for(const op of ['build','pull','load','push','retag','exec','unknown'])assert.throws(()=>revalidationDockerArgs(op,opts),{code:'R3_OPERATION_DENIED'});
  const args=revalidationDockerArgs('probe',opts);
  for(const flag of ['--pull=never','--read-only','--no-healthcheck','no-new-privileges'])assert(args.includes(flag));
  assert.equal(args[args.indexOf('--network')+1],'none');assert.equal(args[args.indexOf('--entrypoint')+1],'node');
  assert(!args.includes('--mount'));assert(!args.includes('--env'));assert(!args.includes('--publish'));
  assert(args.includes(R2_ARTIFACT.imageId));
});
test('postflight errors remain failures and public diagnostics exclude exception payloads',async()=>{
  await assert.rejects(()=>revalidateExistingAuthorization({readEvidence:async()=>fixture(),
    probe:async()=>({version:'v24.22.1',lts:'Krypton',uid:1000}),postflight:async()=>{throw {code:'R3_INPUT_CHANGED'};}}));
  assert.equal(revalidationFailure({code:'R3_INPUT_CHANGED',message:'SECRET_SENTINEL'}),'R3_INPUT_CHANGED');
  assert.equal(revalidationFailure({code:'SECRET_SENTINEL',message:'SECRET_SENTINEL'}),'BUILD_GATE_NOT_CONFIRMED');
});
