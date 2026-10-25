import {readdir,readFile,lstat} from 'node:fs/promises';
import {projectDriver} from './report.mjs';
try {
 const dirs=(await readdir('/evidence')).filter(n=>/^matrix-[a-f0-9]{12}$/u.test(n));
 if(dirs.length!==1)throw Error();
 const p='/evidence/'+dirs[0]+'/driver-result.json',s=await lstat(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)throw Error();
 console.log(JSON.stringify({passed:true,evidence:projectDriver(JSON.parse(await readFile(p,'utf8')))}));
}catch{console.log(JSON.stringify({passed:false,category:'SAFE_EXPORT_NOT_CONFIRMED'}));process.exitCode=1;}
