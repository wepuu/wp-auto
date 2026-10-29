import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {verifyUnits,verifyDatabaseManifest,candidateDatabase,retainedDatabase,legacyDatabase,pureMapping,nativeDatabase,legacyCompatibility} from './profiles.mjs';
import {verifyProgramRoots,expectedTests} from '../../../scripts/database-test-typecheck-core.mjs';
import {offlineSkipFiles} from '../r10/profiles.mjs';
import path from 'node:path';
let checks=0;const ok=fn=>{fn();checks++;},bad=fn=>{assert.throws(fn);checks++;};
const actual=[];
for(const kind of ['packages','apps'])for(const p of await readdir(kind)){
 const leaf=kind==='packages'?'test':'src',base=kind+'/'+p+'/'+leaf;
 let files;try{files=await readdir(base);}catch{continue;}
 actual.push(...files.filter(f=>f.endsWith('.test.ts')).map(f=>base+'/'+f));
}
actual.push(...(await readdir('scripts')).filter(f=>f.endsWith('.test.mjs')).map(f=>'scripts/'+f));
const frozen=JSON.parse(await readFile(new URL('./unit-manifest.json',import.meta.url))),old=JSON.parse(await readFile(new URL('../r43/unit-manifest.json',import.meta.url)));
ok(()=>verifyUnits(actual,frozen,old));
for(const value of [actual.slice(1),[...actual,actual[0]],actual.map((v,i)=>i?v:'unknown.test.mjs')])bad(()=>verifyUnits(value,frozen,old));
const db=(await readdir('packages/database/test')).filter(f=>f.endsWith('.test.ts'));
ok(()=>verifyDatabaseManifest(db));ok(()=>assert.deepEqual([...db].sort(),expectedTests));
bad(()=>verifyDatabaseManifest(db.slice(1)));bad(()=>verifyDatabaseManifest([...db,db[0]]));
ok(()=>assert.equal(Object.keys(candidateDatabase).length,13));ok(()=>assert.equal(Object.keys(retainedDatabase).length,2));ok(()=>assert.equal(Object.keys(legacyDatabase).length,1));
ok(()=>assert.equal(Object.values(pureMapping).reduce((a,b)=>a+b),43));
ok(()=>assert(Object.keys(pureMapping).every(f=>!offlineSkipFiles.includes(f))));
ok(()=>assert.deepEqual(nativeDatabase,{'scripts/multisite-r9-database.test.mjs':1}));
ok(()=>assert.deepEqual(legacyCompatibility,{'packages/account-auth/test/account-auth-postgres.test.ts':1,'apps/control-api/src/server.test.ts':24}));
for(const file of ['deploy/Control.Containerfile','deploy/Authorization.Containerfile']){
 const source=await readFile(file,'utf8');
 ok(()=>assert(source.indexOf('COPY patches ./patches')<source.indexOf('RUN pnpm install --frozen-lockfile')));
 ok(()=>assert(source.includes('node:24.22.1-alpine@sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420')));
 ok(()=>assert(source.includes('USER node')&&!source.includes('migrate')));
}
const authorization=await readFile('deploy/Authorization.Containerfile','utf8');
ok(()=>assert(authorization.indexOf('pnpm --dir test/persistent-authorization/type-support install --frozen-lockfile')>authorization.indexOf('FROM build AS test')));
ok(()=>assert(authorization.includes('&& node scripts/typecheck-database-tests.mjs')));
const ci=await readFile('.github/workflows/phase-2-foundation.yml','utf8');
for(const field of ['WEPUU_CANDIDATE_REVISION: $'+'{{ github.event.pull_request.head.sha || github.sha }}','ref: $'+'{{ env.WEPUU_CANDIDATE_REVISION }}','node-version: 24.22.1','pnpm@11.19.0','working-directory: test/persistent-authorization/type-support','node scripts/typecheck-database-tests.mjs','WEPUU_TEST_LEGACY_CONSOLE: \'allow-isolated\''])ok(()=>assert(ci.includes(field)));
ok(()=>assert(ci.indexOf('- name: Complete strict database test typecheck')>ci.indexOf('- name: Strict checks')));
ok(()=>assert.equal((ci.match(/image.revision="\$WEPUU_CANDIDATE_REVISION"/gu)??[]).length,3));
ok(()=>assert(!ci.includes('docker push')&&!ci.includes('pull_request_target')));
const runner=await readFile('scripts/test-persistent-images.mjs','utf8');
ok(()=>assert(runner.includes("'/harness/r68/unit.mjs'")));
const database=await readFile('test/persistent-authorization/database-tests.mjs','utf8');
ok(()=>assert(database.includes("from './r68/profiles.mjs'")));
ok(()=>assert(database.includes('[legacyDatabase,legacyCompatibility]')&&database.includes('[candidateDatabase,retainedDatabase,nativeDatabase]')));
ok(()=>assert(database.includes("CANDIDATE_014_FORBIDDEN")&&database.includes("LEGACY_014_REQUIRED")));
ok(()=>assert(database.includes('expectedTopLevel: { [basename(file)]: count }')));
const unit=await readFile('test/persistent-authorization/r68/unit.mjs','utf8');
ok(()=>assert(unit.includes('expectedTopLevel:pureMapping')&&unit.includes("stage='pure_mapping_counts'")));
const programRoots=['/workspace/packages/x/src/index.ts','/workspace/node_modules/typescript/lib/lib.d.ts'];
ok(()=>verifyProgramRoots('/workspace',programRoots,path.posix));
bad(()=>verifyProgramRoots('/tmp/current',programRoots,path.posix));bad(()=>verifyProgramRoots('/workspace',['/workspace-other/x.ts'],path.posix));
const migrations=await readFile('packages/database/src/index.ts','utf8');
ok(()=>assert(migrations.includes("'015', '016', '017'")));
const typed=JSON.parse(await readFile('packages/database/test/tsconfig.json','utf8'));
ok(()=>assert.deepEqual(typed.compilerOptions.types,['node','bun','react']));
const base=JSON.parse(await readFile('tsconfig.base.json','utf8'));ok(()=>assert.equal(base.compilerOptions.skipLibCheck,false));
console.log(JSON.stringify({passed:true,checks,unitFiles:actual.length,databaseDirectoryFiles:db.length,pureMappingTopLevelTests:43,legacyCompatibilityFiles:2,nativeDatabaseFiles:1,servicesStarted:false,productionAccessed:false}));
