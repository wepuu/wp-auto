import {readdir,readFile,lstat} from 'node:fs/promises';
import {project} from './report.mjs';
const out={};async function read(p){const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)throw Error('UNSAFE_REPORT');return JSON.parse(await readFile(p,'utf8'));}
for(const name of await readdir('/evidence')){
 if(/^r22-boundary-[a-f0-9]{12}\.json$/.test(name))out[name]=project(await read('/evidence/'+name));
 if(!/^(matrix|transition)-[a-f0-9]{12}$/.test(name))continue;
 for(const f of ['driver-result.json','integration.json','transition.json'])if((await readdir('/evidence/'+name)).includes(f))out[name+'/'+f]=project(await read('/evidence/'+name+'/'+f));
}
console.log(JSON.stringify(out));
