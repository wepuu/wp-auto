import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyMinimal,verifyGeneric} from './contracts.mjs';
const hash='a'.repeat(64), processResult={completed:true,spawnFailed:false,exitCode:2,signal:null,timedOut:false,outputLimitExceeded:false};
const deps=[['@better-auth/core','TS2307'],['better-auth','TS2536'],['resend','TS2307'],['resend','TS2503'],['resend','TS2503']]
 .map(([packageName,code])=>({package:packageName,code,identity:'LOCK_VERIFIED',fileSha256:hash,packageJsonSha256:hash}));
const minimal={process:processResult,diagnosticComplete:true,outputLimitExceeded:false,diagnosticsTruncated:false,typecheckPass:false,dependencyIdentitiesComplete:true,
 dependencyRowsTruncated:false,diagnostics:deps.map(()=>({kind:'DEPENDENCY_DECLARATION',count:1})),dependencyDiagnostics:deps};
const generic={...minimal,diagnostics:[{file:'.tmp/r44/generic-negative.mts',code:'TS2536',count:1}],dependencyDiagnostics:[],config:{compilerOptions:{types:[]}}};
let checks=0;
verifyMinimal(minimal);checks++;verifyGeneric(generic);checks++;
for(const change of [
 v=>({...v,diagnosticComplete:false}),v=>({...v,typecheckPass:true}),v=>({...v,dependencyIdentitiesComplete:false}),
 v=>({...v,diagnosticsTruncated:true}),v=>({...v,dependencyRowsTruncated:true}),
 v=>({...v,diagnostics:v.diagnostics.slice(1)}),v=>({...v,dependencyDiagnostics:v.dependencyDiagnostics.slice(1)}),
 v=>({...v,dependencyDiagnostics:v.dependencyDiagnostics.map((d,i)=>i?d:{...d,package:'unknown'})}),
 v=>({...v,dependencyDiagnostics:v.dependencyDiagnostics.map((d,i)=>i?d:{...d,identity:'NOT_CONFIRMED'})}),
 v=>({...v,diagnostics:v.diagnostics.map((d,i)=>i?d:{...d,kind:'WORKSPACE_SOURCE'})}),
 v=>({...v,process:{...v.process,exitCode:0}}),v=>({...v,process:{...v.process,timedOut:true}}),
 v=>({...v,process:{...v.process,signal:'SIGKILL'}}),v=>({...v,process:{...v.process,spawnFailed:true}})
]) {assert.throws(()=>verifyMinimal(change(minimal)));checks++;}
for(const change of [
 v=>({...v,diagnostics:[]}),v=>({...v,diagnostics:[{...v.diagnostics[0],code:'TS2578'}]}),
 v=>({...v,diagnostics:[{...v.diagnostics[0],file:'.tmp/r44/generic-positive.mts'}]}),
 v=>({...v,config:{compilerOptions:{types:['bun']}}}),
 v=>({...v,dependencyDiagnostics:deps}),v=>({...v,process:{...v.process,exitCode:0}})
]) {assert.throws(()=>verifyGeneric(change(generic)));checks++;}
if(process.argv.length===4){
 const first=JSON.parse(await readFile(process.argv[2],'utf8')),second=JSON.parse(await readFile(process.argv[3],'utf8'));
 assert.equal(first.evidence.compilerInvocations,1);assert.equal(second.evidence.compilerInvocations,1);
 verifyMinimal(first.evidence.minimal);checks++;verifyGeneric(second.evidence.generic);checks++;
}
console.log(JSON.stringify({passed:true,checks,compilerInvocations:0,servicesStarted:false}));
