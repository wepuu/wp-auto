import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectPostgresImage,preparePostgresImage,postgresPlan} from '../../../scripts/postgres-image-gate.mjs';
const spec=JSON.parse(await readFile(new URL('../postgres-pin.json',import.meta.url)));
let checks=0;
for(const mode of ['manifest','config','classic','missingDescriptor','wrongDescriptor','indexDescriptor','wrongId','repo','platform','version','duplicate','missingEvidence','hash','failedReceipt','unknownSchema']){
 const s=structuredClone(spec);
 if(mode==='classic'){s.schemaVersion=1;s.expectedImageId=s.expectedConfigDigest;}
 if(mode==='unknownSchema')s.schemaVersion=3;
 if(mode==='missingEvidence')s.bindingEvidence=[];
 if(mode==='hash')s.bindingEvidence[0].sha256='0'.repeat(64);
 if(mode==='failedReceipt')s.bindingEvidence[1].path='test/persistent-authorization/r100/result.json';
 const image={Id:mode==='config'||mode==='classic'?spec.expectedConfigDigest:mode==='wrongId'?'sha256:'+'f'.repeat(64):spec.repositoryDigest,Os:'linux',Architecture:mode==='platform'?'arm64':'amd64',RepoDigests:mode==='repo'?[]:[spec.repository+'@'+spec.repositoryDigest],Config:{Env:['PG_MAJOR=16','PG_VERSION='+(mode==='version'?'17':'16.10'),'PGDATA=/var/lib/postgresql/data',...(mode==='duplicate'?['PG_MAJOR=16']:[])]},Descriptor:{digest:mode==='wrongDescriptor'?spec.expectedConfigDigest:spec.repositoryDigest,mediaType:mode==='indexDescriptor'?'application/vnd.oci.image.index.v1+json':spec.manifestMediaType}};
 if(mode==='classic'||mode==='missingDescriptor')delete image.Descriptor;
 let calls=0,r,error;
 try{r=await inspectPostgresImage(s,async()=>{calls++;return {ok:true,exitCode:0,stdout:JSON.stringify([image])};});}catch(e){error=e;}
 assert.equal(!error,['manifest','config','classic'].includes(mode),mode);
 if(r){assert.equal(r.imageId,image.Id);assert.equal(r.configDigest,spec.expectedConfigDigest);assert.equal(r.identityMode,mode==='manifest'?'MANIFEST_DESCRIPTOR_ID':'CONFIG_ID');}
 if(['hash','failedReceipt','missingEvidence','unknownSchema'].includes(mode))assert.equal(calls,0);
 checks++;
}
const calls=[];await preparePostgresImage(spec,async args=>{calls.push(args);return {ok:true,exitCode:0,stdout:JSON.stringify([{Id:spec.expectedConfigDigest,Os:'linux',Architecture:'amd64',RepoDigests:[spec.repository+'@'+spec.repositoryDigest],Config:{Env:['PG_MAJOR=16','PG_VERSION=16.10','PGDATA=/var/lib/postgresql/data']}}])};});
assert.deepEqual(calls.map(a=>a.slice(0,2)),[['image','pull'],['image','inspect']]);checks++;
console.log(JSON.stringify({passed:true,checks,dockerCalls:0}));
