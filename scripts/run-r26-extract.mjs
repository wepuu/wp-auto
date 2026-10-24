// One evidence-reader container only. Importing this file never invokes Docker.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';
export const r24 = 'r24-20261024144904933';
export const volume = 'wepuu-' + r24 + '-evidence';
export const image = 'sha256:186da8a26977741ee8b1a2f1399448216a80986e0af9a87ebd661a0f4779379f';
const revision='c404ed52228ce5492a85674547998d2f5d31772e';
const sha=v=>createHash('sha256').update(v).digest('hex');
const deny=code=>{throw Object.assign(Error('R26_GATE_DENIED'),{code});};
export function verifyVolume(v) {
 if(v?.Name!==volume || v.Driver!=='local' || v.Labels?.['wepuu.run']!==r24 || v.Labels?.['wepuu.phase']!=='r24-ab')deny('VOLUME_OWNERSHIP_NOT_CONFIRMED');
 return {name:volume,ownershipVerified:true};
}
export function verifyImage(v) {
 if(v?.id!==image || v.os!=='linux' || v.arch!=='amd64' || v.revision!==revision)deny('IMAGE_IDENTITY_NOT_CONFIRMED');
 return {id:image,revision,os:'linux',arch:'amd64'};
}
export function verifyHistorical(rows) {
 const expected=['probe-authorization','probe-control','probe-test','seed','matrix','pg','export'].map(s=>'wepuu-'+r24+'-'+s);
 if(rows.length!==7 || new Set(rows.map(r=>r.name)).size!==7)deny('HISTORY_NOT_CONFIRMED');
 for(const r of rows) if(!expected.includes(r.name) || r.labels?.['wepuu.run']!==r24 || r.labels?.['wepuu.phase']!=='r24-ab'
  || r.running!==false || r.oomKilled!==false || r.exitCode!==(r.name.endsWith('-matrix')?1:0))deny('HISTORY_NOT_CONFIRMED');
 return rows.map(r=>({name:r.name,stopped:true,exitCode:r.exitCode,oomKilled:false}));
}
export function verifyUsers(rows,readerName) {
 for(const r of rows) if(r.name!==readerName && r.running && r.mounts?.some(m=>m.Name===volume))deny('EVIDENCE_WRITER_OR_READER_ACTIVE');
 return true;
}
export function readerArgs(name,run,script) {
 return ['create','--name',name,'--label','wepuu.phase=r26-extract','--label','wepuu.run='+run,
  '--pull=never','--network','none','--user','1000:1000','--read-only','--no-healthcheck','--cap-drop','ALL',
  '--security-opt','no-new-privileges','--log-driver','none','--memory','128m','--memory-swap','128m','--pids-limit','32','--cpus','0.5',
  '--mount',`type=volume,source=${volume},target=/evidence,readonly`,
  '--mount',`type=bind,source=${script},target=/extract.mjs,readonly`,
  '--entrypoint','node',image,'/extract.mjs'];
}
export function verifyExtraction(v) {
 const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
 if(v?.passed!==true || v.purpose!=='R24_EXISTING_REPORT_EXTRACTION_ONLY' || v.nodeVersion!=='v24.22.1' || v.uid!==1000
  || v.sourceDirectory!=='matrix-fd255ef5ec6d' || v.reportsAgree!==true || v.exactRuntimeCauseConfirmed!==false
  || v.protocolAcceptancePass!==false || v.serviceReproductionPerformed!==false || v.productionAccessed!==false
  || !Array.isArray(v.files) || v.files.length!==2 || v.files.some((f,i)=>f.name!==['integration.json','driver-result.json'][i]||!hash(f.sha256)||!Number.isInteger(f.bytes)||f.bytes<=0||f.bytes>1024*1024)
  || v.integration?.passed!==false || v.integration.stage!=='expired_code')deny('EXTRACTION_RESULT_NOT_CONFIRMED');
 return true;
}
const inspectFormat='{"name":{{json .Name}},"labels":{{json .Config.Labels}},"running":{{json .State.Running}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"mounts":{{json .Mounts}}}';
export async function main() {
 const root=process.cwd(),exec=promisify(execFile),env={...process.env};
 for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','BUILDX_BUILDER','BUILDKIT_HOST','NODE_OPTIONS'])delete env[k];
 const invoke=(exe,args,timeout=15000,maxBuffer=65536)=>exec(exe,args,{cwd:root,env,windowsHide:true,shell:false,timeout,maxBuffer});
 const d=(args,timeout,maxBuffer)=>invoke('C:\\Users\\liulo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',['--context','desktop-linux',...args],timeout,maxBuffer);
 const run='r26-'+new Date().toISOString().replace(/[^0-9]/gu,''),name='wepuu-'+run+'-extract';
 const script=path.resolve('test/persistent-authorization/r26/extract.mjs');
 const result={run,passed:false,startedUtc:new Date().toISOString(),stage:'local_inputs',attemptCount:0,
  productionAccessed:false,serviceReproductionPerformed:false,protocolAcceptancePass:false,rawOutputSuppressed:true};
 let directory,attempted=false;
 const started=performance.now();
 const inspect=async ids=>{
  if(!ids.length)return[];
  const out=await d(['inspect','--format',inspectFormat,...ids],15000,256*1024);
  return out.stdout.trim().split(/\r?\n/u).filter(Boolean).map(line=>{const r=JSON.parse(line);r.name=r.name.replace(/^\//u,'');return r;});
 };
 const all=async()=>{const ids=(await d(['ps','-aq'])).stdout.trim().split(/\s+/u).filter(Boolean);return inspect(ids);};
 try {
  const stat=await lstat(script);if(!stat.isFile()||stat.isSymbolicLink())deny('INPUT_UNSAFE');
  result.extractorSha256=sha(await readFile(script));
  result.sourceHead=(await invoke('git',['rev-parse','HEAD'])).stdout.trim();
  if((await invoke('git',['status','--porcelain'])).stdout!=='')deny('SOURCE_NOT_CLEAN');
  directory=await mkdtemp(path.join(tmpdir(),'wepuu-r26-extract-'));
  await invoke('icacls.exe',[directory,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  if(!(await checkWindowsEvidenceAcl(directory,[])).verified)deny('EVIDENCE_NOT_PRIVATE');
  result.stage='resource_identity';
  const context=JSON.parse((await d(['context','inspect','desktop-linux'])).stdout);
  if(context.length!==1||context[0].Name!=='desktop-linux'||context[0].Endpoints?.docker?.Host!=='npipe:////./pipe/dockerDesktopLinuxEngine')deny('DOCKER_CONTEXT_NOT_CONFIRMED');
  result.contextVerified=true;
  result.volume=verifyVolume(JSON.parse((await d(['volume','inspect',volume])).stdout)[0]);
  result.image=verifyImage(JSON.parse((await d(['image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image])).stdout));
  const before=await all();
  if(before.some(r=>r.name===name))deny('READER_NAME_CONFLICT');
  result.history=verifyHistorical(before.filter(r=>r.labels?.['wepuu.run']===r24));
  verifyUsers(before,name);result.noExistingActiveEvidenceUser=true;
  result.stage='create_reader';
  attempted=true;await d(readerArgs(name,run,script));
  result.stage='extract';result.attemptCount=1;
  const output=await d(['start','-a',name],30000,65536);
  let value;try{value=JSON.parse(output.stdout.trim());}catch{deny('EXTRACTION_JSON_INVALID');}
  verifyExtraction(value);result.extraction=value;
  result.stage='postcheck';
  verifyUsers(await all(),name);
  if(sha(await readFile(script))!==result.extractorSha256)deny('INPUT_CHANGED');
  result.passed=true;
 } catch(error) {
  const codes=['VOLUME_OWNERSHIP_NOT_CONFIRMED','IMAGE_IDENTITY_NOT_CONFIRMED','HISTORY_NOT_CONFIRMED','EVIDENCE_WRITER_OR_READER_ACTIVE',
   'EXTRACTION_RESULT_NOT_CONFIRMED','INPUT_UNSAFE','SOURCE_NOT_CLEAN','EVIDENCE_NOT_PRIVATE','DOCKER_CONTEXT_NOT_CONFIRMED',
   'READER_NAME_CONFLICT','EXTRACTION_JSON_INVALID','INPUT_CHANGED'];
  result.category=codes.includes(error?.code)?error.code:error?.killed?'TRANSPORT_TIMEOUT':'LOCAL_OR_EXTRACTION_FAILURE';
  // Recover only the fixed extractor failure category, never its raw stdout/stderr.
  try { const v=JSON.parse(error?.stdout); if(v?.passed===false && ['REPORT_INVALID','REPORT_CONTEXT_MISMATCH','REPORT_CONFLICT','UNSAFE_FILE','UNSAFE_DIRECTORY','REPORT_SIZE_DENIED','REPORT_CHANGED','REPORT_JSON_INVALID','REPORT_MISSING','REPORT_ACCESS_DENIED','EXTRACTION_NOT_CONFIRMED'].includes(v.category))result.extractorFailure=v.category; } catch{}
 } finally {
  if(attempted) {
   try {
    let c=(await inspect([name]))[0];
    if(c.name!==name || c.labels?.['wepuu.run']!==run || c.labels?.['wepuu.phase']!=='r26-extract')deny('CLEANUP_OWNERSHIP_DENIED');
    if(c.running){await d(['stop','--time','5',name],15000);c=(await inspect([name]))[0];}
    result.cleanup={name,stopped:c.running===false,exitCode:c.exitCode,oomKilled:c.oomKilled};
    if(c.running || c.oomKilled || c.exitCode!==0)result.passed=false;
   }catch{result.cleanup={name,confirmed:false};result.passed=false;}
  }
  result.finishedUtc=new Date().toISOString();result.elapsedMonotonicMs=Math.round(performance.now()-started);
  if(directory) {
   try { await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    if(!(await checkWindowsEvidenceAcl(directory,['result.json'])).verified)deny('EVIDENCE_NOT_PRIVATE');
    result.evidenceSaved=true;result.evidenceDirectory=directory;
   }catch{result.evidenceSaved=false;result.passed=false;}
  }
 }
 console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
