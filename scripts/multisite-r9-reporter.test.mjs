import assert from 'node:assert/strict';
import test from 'node:test';
import reporter,{sqlEvidence} from './multisite-r9-database-reporter.mjs';
const target='R9 authoritative classification and restricted writer acceptance';
async function result(events){let s='';for await(const chunk of reporter(events))s+=chunk;process.exitCode=0;return JSON.parse(s);}
test('SQL evidence projects approved state, function and line, never raw context',()=>{
  const projected=sqlEvidence({cause:{code:'P0001',message:'SECRET_SENTINEL',where:'SQL SECRET_SENTINEL\nPL/pgSQL function oauth.artifact_register(text) line 14 at RAISE'}});
  assert.deepEqual(projected,[{sqlstate:'P0001',function:'artifact_register',line:14}]);
  assert.equal(sqlEvidence({code:'SECRET_SENTINEL'}).length,0);
});
test('constraints reporter requires actual target completion and preserves safe failure stage',async()=>{
  const diagnostic={type:'test:diagnostic',data:{message:JSON.stringify({version:9,stage:'migration017',secret:'SECRET_SENTINEL'})}};
  const failed=await result([diagnostic,{type:'test:fail',data:{name:target,details:{error:{code:'42501',message:'SECRET_SENTINEL'}}}}]);
  assert(!failed.passed);assert(failed.targetExecuted);assert.equal(failed.stages[0],'migration017');
  assert(!JSON.stringify(failed).includes('SECRET_SENTINEL'));
  assert(!(await result([])).passed);
  assert(!(await result([{type:'test:pass',data:{name:target,skip:true}}])).passed);
});
test('constraints success requires final complete stage and no extra failure',async()=>{
  const complete={type:'test:diagnostic',data:{message:'{"version":9,"stage":"complete"}'}};
  const pass={type:'test:pass',data:{name:target}};
  assert((await result([complete,pass])).passed);
  assert(!(await result([pass])).passed);
  assert(!(await result([complete,pass,{type:'test:fail',data:{name:'SECRET_SENTINEL'}}])).passed);
});
