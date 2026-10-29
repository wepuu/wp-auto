import {lstat,readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const rootFiles=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json'];
const deny=code=>{throw Object.assign(Error('R30_INPUT_DENIED'),{code});};
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function selectedPaths(paths){
 const selected=paths.filter(f=>rootFiles.includes(f)||/^(apps|packages)\/[a-z0-9-]+\/(src|test)\//u.test(f)||/^(apps|packages)\/[a-z0-9-]+\/(package\.json|tsconfig[^/]*\.json)$/u.test(f)).sort();
 if(new Set(selected).size!==selected.length||selected.some(f=>f.split('/').includes('..')||f.includes('\\')||f.includes('\0')))deny('UNSAFE_MANIFEST');
 if(rootFiles.some(f=>!selected.includes(f)))deny('MISSING_ROOT_CONFIG');
 return selected;
}
export async function baseline(root,paths){
 const selected=selectedPaths(paths),files=[];
 const checked=new Set();
 for(const file of selected){let parent=root;for(const part of file.split('/').slice(0,-1)){parent=path.join(parent,part);if(!checked.has(parent)){const s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink())deny('UNSAFE_DIRECTORY');checked.add(parent);}}
  const s=await lstat(path.join(root,file));if(!s.isFile()||s.isSymbolicLink())deny('UNSAFE_INPUT');files.push({file,sha256:sha(await readFile(path.join(root,file)))});}
 const directories=[...new Set(selected.map(f=>f.match(/^((apps|packages)\/[a-z0-9-]+\/(src|test))\//u)?.[1]).filter(Boolean))].sort();
 const projects=[...new Set(selected.map(f=>f.match(/^((apps|packages)\/[a-z0-9-]+)\//u)?.[1]).filter(Boolean))].sort();
 return {version:1,files,directories,projects};
}
export async function verifyBaseline(root,value){
 if(value?.version!==1||!Array.isArray(value.files)||!Array.isArray(value.directories)||!Array.isArray(value.projects))deny('INVALID_BASELINE');
 const listed=selectedPaths(value.files.map(f=>f.file));
 if(JSON.stringify(listed)!==JSON.stringify(value.files.map(f=>f.file)))deny('INVALID_BASELINE');
 const expected=await baseline(root,listed);
 if(JSON.stringify(expected)!==JSON.stringify(value))deny('BASELINE_HASH_MISMATCH');
 async function walk(dir){const out=[];const s=await lstat(path.join(root,dir));if(!s.isDirectory()||s.isSymbolicLink())deny('UNSAFE_DIRECTORY');
  for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isSymbolicLink())deny('UNSAFE_INPUT');if(e.isDirectory())out.push(...await walk(file));else if(e.isFile())out.push(file);else deny('UNSAFE_INPUT');}return out.sort();}
 for(const dir of value.directories){const expectedFiles=listed.filter(f=>f.startsWith(dir+'/'));if(JSON.stringify(await walk(dir))!==JSON.stringify(expectedFiles))deny('EXTRA_OR_MISSING_SOURCE');}
 for(const kind of ['apps','packages']){
  const actual=(await readdir(path.join(root,kind),{withFileTypes:true})).filter(e=>e.isDirectory()||e.isSymbolicLink()).map(e=>kind+'/'+e.name).sort();
  if(JSON.stringify(actual)!==JSON.stringify(value.projects.filter(p=>p.startsWith(kind+'/'))))deny('PROJECT_SET_MISMATCH');
  for(const project of actual)for(const leaf of ['src','test']){const dir=project+'/'+leaf;let present=false;try{const s=await lstat(path.join(root,dir));if(!s.isDirectory()||s.isSymbolicLink())deny('UNSAFE_DIRECTORY');present=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(present!==value.directories.includes(dir))deny('UNEXPECTED_SOURCE_DIRECTORY');}
 }
 return {passed:true,fileCount:listed.length,directoryCount:value.directories.length,projectCount:value.projects.length,manifestSha256:sha(JSON.stringify(value))};
}
