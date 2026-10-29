import assert from 'node:assert/strict';
import https from 'node:https';
import {createHash} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function publicUrl(text) {
 const u=new URL(text);
 assert(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash,'PUBLIC_URL_REQUIRED');
 assert((u.hostname==='registry.npmjs.org'&&!u.search)
   ||(u.hostname==='api.github.com'&&u.pathname.startsWith('/repos/better-auth/better-auth/')),'HOST_OR_PATH_DENIED');
 return u;
}
export async function getJson(url, limit=4194304) {
 const u=publicUrl(url);
 return new Promise((resolve,reject)=>{
  const req=https.get(u,{headers:{'user-agent':'wepuu-r45-public-metadata','accept':'application/json'},timeout:15000},res=>{
   const chunks=[];let bytes=0;
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){req.destroy(Object.assign(Error('OUTPUT_LIMIT'),{safeCode:'OUTPUT_LIMIT'}));return;}chunks.push(chunk);});
   res.on('end',()=>{const raw=Buffer.concat(chunks);if(res.statusCode!==200){reject(Object.assign(Error('PUBLIC_HTTP_STATUS'),{safeCode:'PUBLIC_HTTP_STATUS',httpStatus:res.statusCode,url:u.href}));return;}
    try{resolve({value:JSON.parse(raw.toString('utf8')),sha256:sha(raw),bytes});}catch{reject(Object.assign(Error('PUBLIC_JSON_INVALID'),{safeCode:'PUBLIC_JSON_INVALID'}));}});
  });
  req.on('timeout',()=>req.destroy(Object.assign(Error('PUBLIC_TIMEOUT'),{safeCode:'PUBLIC_TIMEOUT'})));
  req.on('error',e=>reject(Object.assign(Error('PUBLIC_FETCH_FAILED'),{safeCode:e.safeCode??'PUBLIC_FETCH_FAILED',transportCode:['ENOTFOUND','ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENETUNREACH'].includes(e.code)?e.code:'OTHER'})));
 });
}
export function packageMetadata(value,name,version) {
 assert(value.name===name&&value.version===version,'PACKAGE_ID_MISMATCH');
 assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value.dist?.integrity??''),'PACKAGE_INTEGRITY_REQUIRED');
 const tarball=publicUrl(value.dist.tarball);assert(tarball.hostname==='registry.npmjs.org'&&tarball.pathname.includes('/-/'),'TARBALL_URL_DENIED');
 for(const field of ['dependencies','optionalDependencies','peerDependencies'])for(const [key,range]of Object.entries(value[field]??{})){
  assert(/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u.test(key)&&typeof range==='string','PACKAGE_DEPENDENCY_INVALID');
  assert(!/(?:https?:|git:|git\+|file:|link:|workspace:)/u.test(range),'NON_REGISTRY_DEPENDENCY_DENIED');
 }
 return {name,version,dist:{integrity:value.dist.integrity,tarball:tarball.href},dependencies:value.dependencies??{},optionalDependencies:value.optionalDependencies??{},
  peerDependencies:value.peerDependencies??{},peerDependenciesMeta:value.peerDependenciesMeta??{},engines:value.engines??{},types:value.types??value.typings??null,
  typeScriptVersion:value.typeScriptVersion??null,typesVersions:value.typesVersions??{},
  scriptNames:Object.keys(value.scripts??{}).filter(k=>/^[A-Za-z0-9:_-]+$/u.test(k)),
  installLifecycleScripts:Object.keys(value.scripts??{}).filter(k=>['preinstall','install','postinstall','prepare'].includes(k))};
}
