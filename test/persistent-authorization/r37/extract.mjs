import {readdir,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {recoverLegacy,projectReport} from './report.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const root=await lstat('/evidence');if(!root.isDirectory()||root.isSymbolicLink())throw Error();
 const dirs=(await readdir('/evidence')).filter(n=>/^matrix-[a-f0-9]{12}$/u.test(n));if(dirs.length!==1)throw Error();
 const dir='/evidence/'+dirs[0],meta=await lstat(dir);if(!meta.isDirectory()||meta.isSymbolicLink())throw Error();
 const files={};for(const name of ['integration.json','driver-result.json']){
  const p=dir+'/'+name,s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)throw Error();const bytes=await readFile(p);files[name]={sha256:sha(bytes),value:JSON.parse(bytes)};
 }
 const integration=files['integration.json'].value;
 console.log(JSON.stringify({passed:true,integration:recoverLegacy(integration),driver:projectReport(files['driver-result.json'].value),sourceHashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,v.sha256])),
  rawReportExported:false,databaseAccessed:false,protocolRequestsSent:0}));
}catch{console.log(JSON.stringify({passed:false,category:'R37_EXTRACTION_NOT_CONFIRMED',rawOutputSuppressed:true}));process.exitCode=1;}
