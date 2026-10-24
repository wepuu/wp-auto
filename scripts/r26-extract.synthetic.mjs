// Pure and temporary-file tests only. Never call main() or Docker.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { extract, projectIntegration, projectReports, sourceDirectory, maxBytes } from '../test/persistent-authorization/r26/extract.mjs';
import { r24, volume, image, verifyVolume, verifyImage, verifyHistorical, verifyUsers, readerArgs, verifyExtraction } from './run-r26-extract.mjs';
let checks=0;
const check=fn=>{fn();checks++;};
const rejection=async(fn,code)=>{await assert.rejects(fn,{code});checks++;};
const sentinel='SENSITIVE_SENTINEL_NOT_A_REAL_SECRET';
const source={passed:false,stage:'expired_code',category:'ASSERTION_FAILED',assertion:'DENIED_STATUS',authRequests:9,tokenRequests:6,
 protocolAssertionsPass:false,childEvidencePass:true,deadlineExceeded:false,
 checks:[{name:'duplicate_submission_no_second_receipt_or_Code',passed:true}],
 diagnostics:[{operation:'token',status:200,category:'NOT_OBSERVED',payload:sentinel},{operation:'token',status:500,category:'server_error',exception:sentinel}],
 cleanup:{childrenStopped:true,forcedOwnedChildTermination:false},cookie:sentinel};
const driver=v=>({passed:false,step:'matrix',stage:'compiled_service_matrix',category:'ASSERTION_FAILED',assertion:'SERVICE_MATRIX_FAILED',matrix:v,dsn:sentinel});
const safe=projectReports(source,driver(source));
check(()=>assert.equal(safe.integration.assertion,'DENIED_STATUS'));
check(()=>assert.equal(safe.integration.tokenDiagnostics[1].status,500));
check(()=>assert.equal(safe.integration.modeAttribution,'NOT_RECORDED'));
check(()=>assert.equal(safe.exactRuntimeCauseConfirmed,false));
check(()=>assert(!JSON.stringify(safe).includes(sentinel)));
check(()=>assert.equal(projectIntegration({...source,assertion:sentinel}).assertion,'NOT_CONFIRMED'));
check(()=>assert.equal(projectIntegration({...source,stage:sentinel}).stage,'NOT_CONFIRMED'));
check(()=>assert.equal(projectIntegration({...source,category:sentinel}).category,'NOT_CONFIRMED'));
for(const value of [null,[],{},'string'])check(()=>assert.throws(()=>projectIntegration(value),{code:'REPORT_INVALID'}));
for(const [field,value] of [['authRequests',21],['authRequests',NaN],['tokenRequests',31],['tokenRequests','6'],['mockDeliveriesObserved',Infinity]])
 check(()=>assert.equal(projectIntegration({...source,[field]:value})[field],undefined));
for(const field of ['protocolAssertionsPass','childEvidencePass','deadlineExceeded'])check(()=>assert.equal(projectIntegration({...source,[field]:'true'})[field],undefined));
check(()=>assert.throws(()=>projectIntegration({...source,checks:Array(38).fill({})}),{code:'REPORT_INVALID'}));
check(()=>assert.throws(()=>projectIntegration({...source,diagnostics:Array(6).fill({})}),{code:'REPORT_INVALID'}));
check(()=>assert(!JSON.stringify(projectIntegration({...source,diagnostics:[{operation:sentinel,status:200,category:sentinel}]})).includes(sentinel)));
check(()=>assert.equal(projectIntegration({...source,checks:[{name:sentinel,passed:true}]}).completedKnownCheckCount,0));
for(const mutate of [d=>d.passed=true,d=>d.step='transition',d=>d.stage='setup',d=>delete d.matrix]) {
 const d=driver(source);mutate(d);check(()=>assert.throws(()=>projectReports(source,d),{code:'REPORT_CONTEXT_MISMATCH'}));
}
check(()=>assert.throws(()=>projectReports(source,driver({...source,assertion:'DENIED_ERROR'})),{code:'REPORT_CONFLICT'}));
check(()=>assert.equal(projectReports({...source,assertion:undefined},driver({...source,assertion:undefined})).earliestAssertionConfirmed,false));
const root=await mkdtemp(path.join(tmpdir(),'wepuu-r26-synthetic-'));
let seq=0;
async function fixture(integration=source,d=driver(integration)) {
 const r=path.join(root,String(++seq));await mkdir(path.join(r,sourceDirectory),{recursive:true});
 await writeFile(path.join(r,sourceDirectory,'integration.json'),JSON.stringify(integration));
 await writeFile(path.join(r,sourceDirectory,'driver-result.json'),JSON.stringify(d));return r;
}
const dir=await fixture(),good=await extract(dir);
check(()=>assert(good.passed&&good.reportsAgree&&!good.protocolAcceptancePass));
check(()=>assert.equal(good.files.length,2));
for(const f of good.files)check(()=>assert(/^[a-f0-9]{64}$/u.test(f.sha256)&&f.bytes>0));
check(()=>assert(!JSON.stringify(good).includes(sentinel)));
const missing=path.join(root,'missing');await mkdir(path.join(missing,sourceDirectory),{recursive:true});
await rejection(()=>extract(missing),'REPORT_MISSING');
for(const [text,code] of [['','REPORT_SIZE_DENIED'],['{','REPORT_JSON_INVALID'],['[]','REPORT_INVALID'],['x'.repeat(maxBytes+1),'REPORT_SIZE_DENIED']]) {
 const r=await fixture();await writeFile(path.join(r,sourceDirectory,'integration.json'),text);await rejection(()=>extract(r),code);
}
const folder=path.join(root,'folder');await mkdir(path.join(folder,sourceDirectory,'integration.json'),{recursive:true});
await rejection(()=>extract(folder),'UNSAFE_FILE');
// Windows directory junctions require no symlink privilege; POSIX uses a directory symlink.
const junction=path.join(root,'junction');await mkdir(junction);
await symlink(path.join(dir,sourceDirectory),path.join(junction,sourceDirectory),process.platform==='win32'?'junction':'dir');
await rejection(()=>extract(junction),'UNSAFE_DIRECTORY');
const labels={'wepuu.run':r24,'wepuu.phase':'r24-ab'};
const v={Name:volume,Driver:'local',Labels:labels};
check(()=>assert(verifyVolume(v).ownershipVerified));
for(const bad of [{...v,Name:'other'},{...v,Driver:'other'},{...v,Labels:{}},{...v,Labels:{...labels,'wepuu.run':'other'}}])
 check(()=>assert.throws(()=>verifyVolume(bad),{code:'VOLUME_OWNERSHIP_NOT_CONFIRMED'}));
const im={id:image,os:'linux',arch:'amd64',revision:'c404ed52228ce5492a85674547998d2f5d31772e'};
check(()=>assert.equal(verifyImage(im).id,image));
for(const key of Object.keys(im))check(()=>assert.throws(()=>verifyImage({...im,[key]:'wrong'}),{code:'IMAGE_IDENTITY_NOT_CONFIRMED'}));
const rows=['probe-authorization','probe-control','probe-test','seed','matrix','pg','export'].map(s=>({name:'wepuu-'+r24+'-'+s,labels,running:false,oomKilled:false,exitCode:s==='matrix'?1:0}));
check(()=>assert.equal(verifyHistorical(rows).length,7));
for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r[0]={...r[0],running:true},r=>r[0]={...r[0],oomKilled:true},r=>r[4]={...r[4],exitCode:0},r=>r[0]={...r[0],labels:{}}]){
 const bad=structuredClone(rows);mutate(bad);check(()=>assert.throws(()=>verifyHistorical(bad),{code:'HISTORY_NOT_CONFIRMED'}));
}
check(()=>assert(verifyUsers([{name:'other',running:true,mounts:[{Name:'other-volume'}]}],'reader')));
check(()=>assert.throws(()=>verifyUsers([{name:'other',running:true,mounts:[{Name:volume,RW:false}]}],'reader'),{code:'EVIDENCE_WRITER_OR_READER_ACTIVE'}));
const args=readerArgs('reader','run','script');
for(const item of ['none','1000:1000','--read-only','--no-healthcheck','ALL','no-new-privileges','128m','32','0.5','--pull=never'])check(()=>assert(args.includes(item)));
check(()=>assert.equal(args.filter(x=>String(x).startsWith('type=')).length,2));
check(()=>assert(args.filter(x=>String(x).startsWith('type=')).every(x=>x.endsWith(',readonly'))));
check(()=>assert(!args.some(x=>['--privileged','--publish','-p','--env-file','--network=host','--rm'].includes(x))));
const linux={...good,nodeVersion:'v24.22.1',uid:1000};
check(()=>assert(verifyExtraction(linux)));
for(const change of [{passed:false},{uid:0},{nodeVersion:'v26.11.1'},{reportsAgree:false},{exactRuntimeCauseConfirmed:true},{protocolAcceptancePass:true},{files:[]}])
 check(()=>assert.throws(()=>verifyExtraction({...linux,...change}),{code:'EXTRACTION_RESULT_NOT_CONFIRMED'}));
console.log(JSON.stringify({passed:true,checks,dockerInvoked:false,servicesStarted:false,productionAccessed:false,syntheticFixturesRetained:true}));
