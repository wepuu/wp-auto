import assert from 'node:assert/strict';
export const sourceRevision='f020e0065664ae2f98cc65f343bcf79b05f807fd';
export const sourceManifest='dde36cc57b4b1a7de3b433cb13e68d846e889d4a1555ea135aa9670d8c7cb641';
export const databaseSourceSha='8d59679bdc93517480e3fe634d13798bb7dfa5d896568e894b6f5279dcd08f35';
export const oldCompiledSha='260d561e07cc1bf4a970f9a05de8759b344e0fbea53d27aa73ab88f3c9d77691';
export const recipeSha='1c0958507b326c5d1a036f6e7988968c9042864b62752b2353cb493606172bc4';
const roles=['authorization','control','test'],digest=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
export function verifyPatchProbe(v){assert(v?.sourceSha256===databaseSourceSha&&v.compiledExactRtMapping===true,'COMPILED_PATCH_MISSING');return v;}
// Read-only probe: source hash plus the reviewed exact clause in compiled find().
export const patchProbeCode=String.raw`const fs=require('node:fs'),c=require('node:crypto');const s=fs.readFileSync('/workspace/packages/database/src/index.ts'),d=fs.readFileSync('/workspace/packages/database/dist/index.js','utf8');const f=d.slice(d.indexOf('async find(id)'),d.indexOf('async destroy(id)',d.indexOf('async find(id)')));console.log(JSON.stringify({sourceSha256:c.createHash('sha256').update(s).digest('hex'),compiledExactRtMapping:f.includes("this.#model === 'RefreshToken' && error instanceof Error")&&f.includes("error.code === 'P0001' && error.message === 'artifact_link_missing'")&&f.includes('throw new OAuthInvalidGrantError();')}));`;
export function verifyBuildReceipt(v,revision){
 assert(v?.passed===true&&v.inputsUnchanged===true&&v.evidenceSaved===true&&v.revision===revision&&/^[a-f0-9]{40}$/.test(revision),'BUILD_RECEIPT_NOT_CONFIRMED');
 assert(v.baseline?.manifestSha256===sourceManifest&&v.containerfileSha256===recipeSha,'BUILD_SOURCE_MISMATCH');
 assert(v.compiledIdentity?.node==='v24.22.1'&&v.compiledIdentity.lts==='Krypton'&&v.compiledIdentity.uid===1000&&v.compiledIdentity.fileCount===163&&/^[a-f0-9]{64}$/.test(v.compiledIdentity.sha256)&&v.compiledIdentity.sha256!==oldCompiledSha,'BUILD_COMPILED_MISMATCH');
 assert(v.artifacts?.length===3&&v.patchProbes?.length===3&&v.probes?.length===3&&roles.every(r=>v.artifacts.filter(a=>a.role===r).length===1&&v.patchProbes.filter(a=>a.role===r).length===1&&v.probes.filter(a=>a.role===r).length===1),'BUILD_ROLES_NOT_CONFIRMED');
 for(const role of roles){const a=v.artifacts.find(a=>a.role===role),p=v.probes.find(a=>a.role===role);assert(a.attempts===1&&a.process?.code===0&&a.process.signal==null&&a.process.timedOut===false&&a.process.spawnFailed===false&&a.process.lowDisk===false&&a.process.outputLimit===false&&a.artifactLinked===true&&a.revision===revision&&digest(a.imageId)&&a.imageId===v.images?.[role],'BUILD_ARTIFACT_NOT_CONFIRMED');
 assert(p.hash===v.compiledIdentity.sha256&&p.files===163&&p.version==='v24.22.1'&&p.lts==='Krypton'&&p.uid===1000,'BUILD_PROBE_NOT_CONFIRMED');verifyPatchProbe(v.patchProbes.find(p=>p.role===role));}
 assert(v.automaticRetryPerformed===false&&v.productionAccessed===false&&v.registryPushed===false&&v.databaseStarted===false,'BUILD_BOUNDARY_MISMATCH');
 return{images:Object.fromEntries(roles.map(r=>[r,v.images[r]])),revision,compiled:v.compiledIdentity};
}
