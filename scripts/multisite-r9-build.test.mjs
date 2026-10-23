import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {verifyTestArtifact,verifyAuthorizationArtifact} from './authorization-build-contract.mjs';
const digest='sha256:'+'a'.repeat(64),revision='1'.repeat(40),tag='wepuu-r9-test:111111111111-222222222222';
const fixture=()=>({exitCode:0,revision,tag,iid:digest,metadata:{'containerimage.config.digest':digest,'containerimage.digest':digest},
  images:[{Id:digest,RepoTags:[tag],Os:'linux',Architecture:'amd64',Config:{User:'root',Cmd:['pnpm','check'],
    Labels:{'org.opencontainers.image.revision':revision},Entrypoint:['docker-entrypoint.sh']}}]});
test('test role uses exact test startup without weakening authorization-image rules',()=>{
  const f=fixture(),result=verifyTestArtifact(f);assert.equal(result.user,'root');assert.equal(result.directMain,false);
  assert.throws(()=>verifyAuthorizationArtifact(f));
  f.images[0].Config.Cmd=['sh','-c','migrate && start'];assert.throws(()=>verifyTestArtifact(f));
});
test('R9 build is offline, fixed-parent checked, single-attempt and does not run a migrator',async()=>{
  const container=await readFile(new URL('../deploy/R9Test.Containerfile',import.meta.url),'utf8');
  const script=await readFile(new URL('./build-r9-test-artifact.mjs',import.meta.url),'utf8');
  assert(container.includes('FROM wepuu-r4br1-test:248f9cc6616c'));assert(container.includes('RUN pnpm build'));
  assert(!container.includes('install'));assert(!container.includes('migrate'));
  assert(script.includes("'--network','none'"));assert(script.includes('Id,base'));
  assert(script.includes('verifyBuildProcess(processResult)'));assert(script.includes('automaticRetryPerformed:false'));
});
