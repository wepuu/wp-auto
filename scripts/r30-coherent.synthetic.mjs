// Only pure helpers, temporary dummy fixtures and synthetic Node output.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {baseline,verifyBaseline,selectedPaths} from '../test/persistent-authorization/r30/inputs.mjs';
import {lockIdentities,packagePath,metadataMatches,tokenAt,observeDetailed} from '../test/persistent-authorization/r30/dependencies.mjs';
let checks=0;const check=f=>{f();checks++;};
const reject=async(fn,code)=>{await assert.rejects(fn,{code});checks++;};
const sentinel='SENSITIVE_SENTINEL_CREDENTIAL_VALUE';
const paths=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json',
 'packages/unit/package.json','packages/unit/tsconfig.json','packages/unit/src/index.ts','packages/unit/test/new.test.ts','packages/unit/test/tsconfig.json',
 'apps/unit/package.json','apps/unit/src/index.ts'];
check(()=>assert.equal(selectedPaths([...paths,'docs/ignore.md','packages/unit/dist/index.js']).length,paths.length));
check(()=>assert.throws(()=>selectedPaths(paths.slice(1)),{code:'MISSING_ROOT_CONFIG'}));
check(()=>assert.throws(()=>selectedPaths([...paths,paths[0]]),{code:'UNSAFE_MANIFEST'}));
check(()=>assert.throws(()=>selectedPaths([...paths,'packages/unit/src/../secret.ts']),{code:'UNSAFE_MANIFEST'}));
const root=await mkdtemp(path.join(tmpdir(),'wepuu-r30-synthetic-'));let n=0;
async function fixture(){const dir=path.join(root,String(++n));for(const p of paths){await mkdir(path.dirname(path.join(dir,p)),{recursive:true});await writeFile(path.join(dir,p),p.endsWith('.json')?'{}':'// dummy synthetic');}return {dir,expected:await baseline(dir,paths)};}
const good=await fixture(),verified=await verifyBaseline(good.dir,good.expected);
check(()=>assert(verified.passed));check(()=>assert.equal(verified.fileCount,paths.length));check(()=>assert.equal(verified.projectCount,2));check(()=>assert.equal(verified.directoryCount,3));
check(()=>assert.match(verified.manifestSha256,/^[a-f0-9]{64}$/u));
const extra=await fixture();await writeFile(path.join(extra.dir,'packages/unit/test/stale.test.ts'),sentinel);await reject(()=>verifyBaseline(extra.dir,extra.expected),'EXTRA_OR_MISSING_SOURCE');
const drift=await fixture();await writeFile(path.join(drift.dir,'packages/unit/src/index.ts'),sentinel);await reject(()=>verifyBaseline(drift.dir,drift.expected),'BASELINE_HASH_MISMATCH');
const other=await fixture();await mkdir(path.join(other.dir,'packages/unknown'));await reject(()=>verifyBaseline(other.dir,other.expected),'PROJECT_SET_MISMATCH');
const unknownDir=await fixture();await mkdir(path.join(unknownDir.dir,'apps/unit/test'));await reject(()=>verifyBaseline(unknownDir.dir,unknownDir.expected),'UNEXPECTED_SOURCE_DIRECTORY');
const linked=await fixture();await symlink(path.join(good.dir,'packages/unit/src'),path.join(linked.dir,'packages/unit/test/alias'),process.platform==='win32'?'junction':'dir');await reject(()=>verifyBaseline(linked.dir,linked.expected),'UNSAFE_INPUT');
const lock=lockIdentities("packages:\n  '@scope/pkg@1.2.3':\n  foo@2.3.4:\n  'foo@2.3.4(peer@1.0.0)':\n  bar@1.0.0-beta.1:\n  evil@latest:\n  /outside/secret@1.2.3:\n");
check(()=>assert.deepEqual([...lock],['@scope/pkg@1.2.3','foo@2.3.4','bar@1.0.0-beta.1']));
check(()=>assert(metadataMatches({name:'foo'},{name:'foo',version:'2.3.4'},lock)));
for(const meta of [{name:'foo',version:'9.0.0'},{name:'other',version:'2.3.4'},{name:'foo',version:'latest'},null])check(()=>assert(!metadataMatches({name:'foo'},meta,lock)));
const info=packagePath('/workspace/node_modules/.pnpm/@scope+pkg@1.2.3/node_modules/@scope/pkg/dist/index.d.mts');
check(()=>assert.equal(info.name,'@scope/pkg'));check(()=>assert.equal(info.file,'dist/index.d.mts'));
check(()=>assert.equal(packagePath('/workspace/node_modules/foo/../secret'),null));check(()=>assert.equal(packagePath('/outside/secret'),null));
function fakeTs(node){const source={getStart:()=>0,end:100,getPositionOfLineAndCharacter:()=>1};return {ScriptTarget:{Latest:99},ScriptKind:{TS:3},createSourceFile:()=>source,
 forEachChild:(parent,visit)=>{if(parent===source)visit({...node,getStart:()=>0,end:10});},isIdentifier:n=>n.kind==='identifier',isStringLiteral:n=>n.kind==='string'};}
check(()=>assert.deepEqual(tokenAt(fakeTs({kind:'identifier',text:'Bun'}),'',1,1),{publicToken:'Bun'}));
check(()=>assert.deepEqual(tokenAt(fakeTs({kind:'string',text:'node:crypto'}),'',1,1),{publicModule:'node:crypto'}));
check(()=>assert.deepEqual(tokenAt(fakeTs({kind:'string',text:'https://'+sentinel}),'',1,1),{}));
check(()=>assert.deepEqual(tokenAt(fakeTs({kind:'identifier',text:sentinel+'!'}),'',1,1),{}));
const installed=lockIdentities(await readFile('pnpm-lock.yaml','utf8'));
for(const key of ['typescript@5.9.3','better-auth@1.7.7','@types/node@24.13.5','pg@8.23.0'])check(()=>assert(installed.has(key)));
const synthetic=await observeDetailed({executable:process.execPath,args:['-e',`process.stdout.write(${JSON.stringify('node_modules/not-real/index.d.ts(2,3): error TS2304: '+sentinel+'\n')});process.exitCode=2`],cwd:process.cwd(),env:{},allowed:[],locked:lock,ts:fakeTs({}),options:{},timeoutMs:3000});
check(()=>assert.equal(synthetic.category,'TYPESCRIPT_DIAGNOSTICS'));check(()=>assert.equal(synthetic.typecheckPass,false));
check(()=>assert.equal(synthetic.dependencyIdentitiesComplete,false));check(()=>assert.equal(synthetic.dependencyDiagnostics[0].identity,'NOT_CONFIRMED'));check(()=>assert(!JSON.stringify(synthetic).includes(sentinel)));
const worker=await readFile('test/persistent-authorization/r30/worker.mjs','utf8');
for(const marker of ['verifyBaseline','DEPENDENCY_VERSION_MISMATCH',"options.skipLibCheck===false","typecheckAttempts:1","['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false']"] )check(()=>assert(worker.includes(marker)));
for(const marker of ['createProgram(','getPreEmitDiagnostics(','pnpm install','focused_tests','new Database(','skipLibCheck:true'])check(()=>assert(!worker.includes(marker)));
const dependency=await readFile('test/persistent-authorization/r30/dependencies.mjs','utf8');
for(const marker of ["file.startsWith('/workspace/node_modules/.pnpm/')",'metadataMatches(info,meta,locked)','s.size>1024*1024','ts.createSourceFile','ts.resolveModuleName'])check(()=>assert(dependency.includes(marker)));
check(()=>assert(!dependency.includes('import(file)')));
const runner=await readFile('scripts/run-r30-coherent.mjs','utf8');
for(const marker of ['b12ce07','--network','none','readonly','--pull=never','expected.directories.flatMap','inputsUnchanged'])check(()=>assert(runner.includes(marker)));
console.log(JSON.stringify({passed:true,checks,dockerInvoked:false,applicationTypecheckPerformed:false,syntheticChildOnly:true,fixturesRetained:true,productionAccessed:false}));
