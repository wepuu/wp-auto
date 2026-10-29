import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {getJson,sha,packageMetadata} from './public-inputs.mjs';
export const typeManifest=Object.freeze({name:'@wepuu/test-type-support',private:true,version:'0.0.0',type:'module',packageManager:'pnpm@11.19.0',
 devDependencies:{'@types/bun':'1.3.14','@types/react':'19.3.0','@types/node':'24.13.5'}});
export const typeWorkspace="packages: []\noverrides:\n  '@types/node': '24.13.5'\nstrictPeerDependencies: true\nminimumReleaseAgeExclude:\n  - '@types/node@24.13.5'\n";
export async function parser() {
 const root='/workspace/node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml';
 const metadata=JSON.parse(await readFile(root+'/package.json','utf8'));
 assert(metadata.name==='js-yaml'&&metadata.version==='4.3.2');
 return createRequire('/workspace/package.json')(root);
}
export async function runResolution(directory) {
 const home='/tmp/wepuu-r45-home';await mkdir(home,{recursive:true,mode:0o700});
 await writeFile(home+'/empty.npmrc','',{flag:'a',mode:0o600});
 const env={PATH:process.env.PATH,HOME:home,TMPDIR:'/tmp',CI:'true',npm_config_userconfig:home+'/empty.npmrc',npm_config_globalconfig:home+'/empty.npmrc',
   PNPM_HOME:home+'/pnpm',XDG_CONFIG_HOME:home+'/config',COREPACK_ENABLE_NETWORK:'0'};
 const args=['install','--lockfile-only','--ignore-scripts','--ignore-pnpmfile','--no-frozen-lockfile','--registry=https://registry.npmjs.org/',
   '--fetch-retries=0','--network-concurrency=1','--reporter=ndjson','--config.store-dir=/tmp/wepuu-r45-store'];
 const out={command:['pnpm',...args],cwd:directory,attempted:true,normal:false,rawOutputSuppressed:true};
 try {
  const r=await promisify(execFile)('pnpm',args,{cwd:directory,env,timeout:120000,maxBuffer:1048576});
  out.normal=true;out.exitCode=0;out.stdoutBytes=Buffer.byteLength(r.stdout);out.stderrBytes=Buffer.byteLength(r.stderr);
 }catch(e){
  out.exitCode=Number.isSafeInteger(e.code)?e.code:null;out.timedOut=e.killed===true;
  const text=(typeof e.stdout==='string'?e.stdout:'')+'\n'+(typeof e.stderr==='string'?e.stderr:'');
  out.stdoutBytes=Buffer.byteLength(e.stdout??'');out.stderrBytes=Buffer.byteLength(e.stderr??'');
  out.category=text.match(/ERR_PNPM_[A-Z0-9_]+/u)?.[0]??(out.timedOut?'TIMEOUT':'LOCK_RESOLUTION_FAILED');
 }
 return out;
}
export async function typeLock(prior, result) {
 const root='/tmp/wepuu-r45-type-support';await mkdir(root,{mode:0o700});
 const manifest=JSON.stringify(typeManifest,null,2)+'\n';
 await writeFile(root+'/package.json',manifest,{flag:'wx',mode:0o600});
 await writeFile(root+'/pnpm-workspace.yaml',typeWorkspace,{flag:'wx',mode:0o600});
 await writeFile(root+'/.npmrc','registry=https://registry.npmjs.org/\nstrict-ssl=true\nignore-scripts=true\n',{flag:'wx',mode:0o600});
 const bun=await getJson('https://registry.npmjs.org/bun-types/1.3.14');
 const bunMeta=packageMetadata(bun.value,'bun-types','1.3.14');
 // This guard must be met before scoping the existing Node24 pin into the isolated tool workspace.
 assert.equal(bunMeta.dependencies['@types/node'],'*','NODE_CONSTRAINT_REVIEW_REQUIRED');
 result.typeSupport={manifest:typeManifest,workspace:typeWorkspace,nodePinReason:'Existing Node24 type pin satisfies bun-types wildcard; no incompatible-range override.',
   bunMetadata:bunMeta,resolution:null};
 result.artifacts={'type-support-package.json':manifest,'type-support-pnpm-workspace.yaml':typeWorkspace};
 result.lockResolutionAttempts=1;
 const resolution=await runResolution(root);result.typeSupport.resolution=resolution;
 if(!resolution.normal)throw Object.assign(Error('TYPE_LOCK_NOT_CONFIRMED'),{safeCode:resolution.category});
 const bytes=await readFile(root+'/pnpm-lock.yaml');
 await reviewTypeBytes(bytes,prior,result);
 let installed=[];try {installed=await readdir(root+'/node_modules');}catch(e){assert.equal(e.code,'ENOENT');}
 assert.equal(installed.length,0,'NODE_MODULES_CREATED');
 result.typeSupport.nodeModulesAbsent=true;
}
export async function reviewTypeBytes(bytes,prior,result) {
 result.artifacts['type-support-pnpm-lock.yaml']=bytes.toString('utf8');
 const yaml=await parser();
 const value=yaml.load(bytes.toString('utf8'),{schema:yaml.JSON_SCHEMA,json:false});
 const allowed=new Set(['@types/bun','@types/react','@types/node','bun-types','csstype','undici-types']);
 const packages=[];
 for(const [key,entry] of Object.entries(value.packages??{})){
  const match=key.match(/^((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)$/u);
  assert(match&&allowed.has(match[1]),'UNEXPECTED_TYPE_CLOSURE');
  if(match[1]==='@types/node')assert.equal(match[2],'24.13.5','NODE_TYPE_DRIFT');
  const response=await getJson('https://registry.npmjs.org/'+encodeURIComponent(match[1])+'/'+match[2]);
  const metadata=packageMetadata(response.value,match[1],match[2]);
  assert.equal(entry.resolution.integrity,metadata.dist.integrity,'LOCK_REGISTRY_INTEGRITY_MISMATCH');
  if(['@types/bun','@types/react'].includes(metadata.name))assert.equal(metadata.dist.integrity,prior.packages.find(p=>p.name===metadata.name).dist.integrity);
  packages.push({...metadata,snapshot:value.snapshots?.[key]??null});
 }
 assert.equal(packages.length,6,'TYPE_CLOSURE_COUNT_REVIEW_REQUIRED');
 result.typeSupport.lock={sha256:sha(bytes),bytes:bytes.length,lockfileVersion:value.lockfileVersion,importers:value.importers,packages};
 result.typeSupport.packageScriptsNotExecuted=true;
}
