// Pure projections plus synthetic Node children; no Docker or application checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {diagnosticCollector,safeLocation,decide,observe} from '../test/persistent-authorization/r29/diagnostics.mjs';
const sentinel='SENSITIVE_SENTINEL_PASSWORD_TOKEN_CODE';
const allowed=['packages/database/test/authorization-consume-mapping.test.ts','packages/database/src/index.ts','packages/database/test/other.test.ts','packages/database/test/tsconfig.json','tsconfig.base.json'];
let checks=0;const check=f=>{f();checks++;};
function parse(channel,text,options={}){const c=diagnosticCollector({allowed,...options});c.push(channel,Buffer.from(text));return c.finish();}
for(const channel of ['stdout','stderr'])for(const prefix of ['', './', '/workspace/']){
 const v=parse(channel,prefix+allowed[0]+'(34,7): error TS2345: '+sentinel+'\n');
 check(()=>assert.equal(v.diagnostics[0].code,'TS2345'));check(()=>assert.equal(v.diagnostics[0].channel,channel));
 check(()=>assert.equal(v.diagnostics[0].kind,'NEW_MAPPING_TEST'));check(()=>assert(!JSON.stringify(v).includes(sentinel)));
}
for(const [line,kind]of [['error TS6059: '+sentinel,'GLOBAL'],['error TS18003: '+sentinel,'GLOBAL'],
 ['packages/database/test/tsconfig.json(2,3): error TS5023: '+sentinel,'CONFIGURATION'],
 ['packages/database/test/other.test.ts(4,2): error TS2339: '+sentinel,'OTHER_DATABASE_TEST'],
 ['/workspace/node_modules/.pnpm/private-secret/index.d.ts(1,2): error TS2344: '+sentinel,'DEPENDENCY_DECLARATION'],
 ['/private/'+sentinel+'.ts(2,3): error TS2345: '+sentinel,'UNKNOWN'],
 ['prefix | /workspace/'+allowed[1]+'(9,3): error TS2339: '+sentinel,'DATABASE_SOURCE']]){
 const v=parse('stderr',line+'\r\n');check(()=>assert.equal(v.diagnostics[0].kind,kind));check(()=>assert(!JSON.stringify(v).includes(sentinel)));
}
const ansi=parse('stdout','\x1b[31m'+allowed[1]+'(1,1): error TS2345: '+sentinel+'\x1b[0m\n');
check(()=>assert.equal(ansi.diagnostics[0].code,'TS2345'));
const split=diagnosticCollector({allowed});const bytes=Buffer.from(allowed[0]+'(2,8): error TS2322: 中文'+sentinel+'\n');
for(let i=0;i<bytes.length;i++)split.push('stderr',bytes.subarray(i,i+1));
const decoded=split.finish();check(()=>assert.equal(decoded.diagnostics[0].code,'TS2322'));check(()=>assert.equal(decoded.streams.stderr.bytes,bytes.length));check(()=>assert(!JSON.stringify(decoded).includes(sentinel)));
const duplicate=parse('stdout','error TS18003: one\nerror TS18003: two\n');check(()=>assert.equal(duplicate.diagnostics.length,1));check(()=>assert.equal(duplicate.diagnostics[0].count,2));
check(()=>assert.equal(parse('stdout','error TS0: bad\n').diagnostics.length,0));
check(()=>assert.equal(parse('stdout','error TS999999999999999999: bad\n').diagnostics.length,0));
check(()=>assert.equal(parse('stdout',allowed[0]+'(0,1): error TS2345: bad\n').diagnostics.length,0));
check(()=>assert.equal(safeLocation('../'+sentinel,allowed).kind,'UNKNOWN'));
const wrappers=parse('stderr','ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL '+sentinel+'\nERR_PNPM_SECRET_'+sentinel+'\n');
check(()=>assert.equal(wrappers.wrappers[0].code,'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL'));check(()=>assert.equal(wrappers.wrappers[1].code,'OTHER_PNPM_ERROR'));check(()=>assert(!JSON.stringify(wrappers).includes(sentinel)));
check(()=>assert(parse('stdout','123456789',{maxBytes:8}).outputLimitExceeded));
check(()=>assert(parse('stdout','123456789',{maxLine:8}).diagnosticsTruncated));
check(()=>assert(parse('stdout','error TS1: a\nerror TS2: b\n',{maxRows:1}).diagnosticsTruncated));
const normal={completed:true,spawnFailed:false,exitCode:2,signal:null,timedOut:false,outputLimitExceeded:false},empty=parse('stdout','');
check(()=>assert.equal(decide(normal,empty).category,'DIAGNOSTIC_INCOMPLETE'));
check(()=>assert.equal(decide(normal,decoded).category,'TYPESCRIPT_DIAGNOSTICS'));
check(()=>assert.equal(decide({...normal,exitCode:0},empty).typecheckPass,true));
check(()=>assert.equal(decide({...normal,exitCode:0},decoded).typecheckPass,false));
for(const [change,category]of [[{spawnFailed:true},'SPAWN_FAILED'],[{timedOut:true},'TIMEOUT'],[{outputLimitExceeded:true},'OUTPUT_LIMIT'],[{signal:'SIGTERM'},'SIGNAL_EXIT']]){
 const d=decide({...normal,...change},decoded);check(()=>assert.equal(d.category,category));check(()=>assert.equal(d.diagnosticComplete,false));
}
const output=await observe({executable:process.execPath,args:['-e',`process.stderr.write(${JSON.stringify('error TS18003: '+sentinel+'\n')});process.exitCode=2;`],env:{},allowed,timeoutMs:3000});
check(()=>assert.equal(output.category,'TYPESCRIPT_DIAGNOSTICS'));check(()=>assert.equal(output.process.exitCode,2));check(()=>assert(!JSON.stringify(output).includes(sentinel)));
const missing=await observe({executable:process.platform==='win32'?'Z:\\missing-r29-executable.exe':'/missing-r29-executable',args:[],env:{},timeoutMs:3000});
check(()=>assert.equal(missing.category,'SPAWN_FAILED'));check(()=>assert.equal(missing.process.spawnCategory,'ENOENT'));
const timeout=await observe({executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],env:{},timeoutMs:100});check(()=>assert.equal(timeout.category,'TIMEOUT'));
const limited=await observe({executable:process.execPath,args:['-e',"process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"],env:{},timeoutMs:3000,maxBytes:32});check(()=>assert.equal(limited.category,'OUTPUT_LIMIT'));
const worker=await readFile('test/persistent-authorization/r29/worker.mjs','utf8');
for(const marker of ["ts.version,'5.9.3'",'parseJsonConfigFileContent','rootFileCount','mappingTestIncluded',"['exec','tsc','--project','packages/database/test/tsconfig.json','--noEmit','--pretty','false']",'typecheckAttempts:1'])check(()=>assert(worker.includes(marker)));
for(const forbidden of ['createProgram(','getPreEmitDiagnostics(','pnpm install','focused_lint','focused_tests','new Database('])check(()=>assert(!worker.includes(forbidden)));
const runner=await readFile('scripts/run-r29-typecheck.mjs','utf8');
for(const marker of ['--network','none','readonly','--cap-drop','ALL','no-new-privileges','--pull=never','c83accd','R28_INPUT_CHANGED','inputsUnchanged'])check(()=>assert(runner.includes(marker)));
console.log(JSON.stringify({passed:true,checks,syntheticChildrenOnly:true,dockerInvoked:false,applicationTypecheckPerformed:false,productionAccessed:false}));
