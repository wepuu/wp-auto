import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {instrument} from './multisite-r7-instrument.mjs';
import {callbackSummary,providerSummary,safeDiagnostic} from './multisite-r7-diagnostics.mjs';
import {collect} from './multisite-r7-reporter.mjs';
import {targetName} from './multisite-safe-reporter.mjs';
import {EventEmitter} from 'node:events';
const context={version:7,operation:12,resource:'A',scope:'READ_ONLY_OFFLINE'};
test('callback projection distinguishes success, denial, unknown, missing and duplicate without secrets',()=>{
  const base='http://127.0.0.1/callback?state=SECRET_SENTINEL&iss=SECRET_SENTINEL';
  assert.equal(callbackSummary(new URL(base+'&code=SECRET_SENTINEL')).codePresent,true);
  assert.equal(callbackSummary(new URL(base+'&error=invalid_grant')).errorCategory,'invalid_grant');
  assert.equal(callbackSummary(new URL(base+'&error=SECRET_SENTINEL')).errorCategory,'UNCLASSIFIED');
  assert.equal(callbackSummary(new URL(base)).errorCategory,'NOT_OBSERVED');
  assert(callbackSummary(new URL(base+'&code=a&code=b')).duplicateCriticalParameters);
  assert(callbackSummary(new URL(base+'&error=a&error=b')).duplicateCriticalParameters);
  assert(!JSON.stringify(callbackSummary(new URL(base+'&error=SECRET_SENTINEL'))).includes('SECRET_SENTINEL'));
});
test('provider and diagnostic projections retain fixed fields only',()=>{
  const projection=providerSummary({event:'oauth.grant_failed',stage:'interaction',category:'unknown',cause:'SECRET_SENTINEL'});
  assert.equal(projection.providerCategory,'unknown');
  assert.equal(providerSummary({event:'SECRET_SENTINEL'}),undefined);
  const safe=safeDiagnostic({...context,...projection,secret:'SECRET_SENTINEL'});
  assert(!JSON.stringify(safe).includes('SECRET_SENTINEL'));
  for(const bad of [{operation:NaN},{operation:101},{scope:'SECRET_SENTINEL'},{resource:'SECRET_SENTINEL'},{version:8}]){
    assert.equal(safeDiagnostic({...context,...projection,...bad}),undefined);
  }
});
test('instrumentation preserves all existing assertion statements and fails on source drift',async()=>{
  const original=await readFile(new URL('../packages/database/test/multi-site-provider.test.ts',import.meta.url),'utf8');
  const candidate=instrument(original);
  const assertions=s=>s.split(/\r?\n/u).filter(l=>l.trim().startsWith('assert.')).map(l=>l.trim());
  assert.deepEqual(assertions(candidate),assertions(original));
  for(const exact of ["skip: databaseUrl === undefined, timeout: 120_000","scope = 'mcp:read'","persistent: { mode: 'guard-only', clientId, resource: resources[0] }"]){
    assert(candidate.includes(exact));
  }
  assert.throws(()=>instrument(original.replace('  assert.ok(databaseUrl);','  assert.ok(false);')));
});
test('reporter retains approved diagnostics, rejects skips, and cannot conceal failure',async()=>{
  const diagnostic={type:'test:diagnostic',data:{message:JSON.stringify({...context,event:'callback',...callbackSummary(new URL('http://localhost/?error=invalid_grant'))})}};
  const fail={type:'test:fail',data:{name:targetName,details:{error:{code:'ERR_ASSERTION',message:'authorization_code_present'}}}};
  const result=await collect([diagnostic,fail]);assert(!result.passed);assert.equal(result.diagnostics[0].operation,12);
  assert(result.outcomes[0].failures.some(f=>f.assertion==='authorization_code_present'));
  assert(!(await collect([{type:'test:pass',data:{name:targetName,skip:true}}])).passed);
  assert(!(await collect([])).passed);
  const truncated=await collect([...Array(257).fill(diagnostic),{type:'test:pass',data:{name:targetName}}]);
  assert(truncated.diagnosticsTruncated);assert(!truncated.passed);
});
test('actual reporter child transport keeps operation and denial while suppressing raw output',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'wepuu-r7-synthetic-')),file=join(directory,'fixture.mjs');
  try{
    const diagnostic={...context,event:'callback',codePresent:false,errorCategory:'invalid_grant',duplicateCriticalParameters:false,secret:'SECRET_SENTINEL'};
    await writeFile(file,`import test from 'node:test';import assert from 'node:assert/strict';test(${JSON.stringify(targetName)},t=>{console.error('SECRET_SENTINEL');t.diagnostic(${JSON.stringify(JSON.stringify(diagnostic))});assert.ok(false,'authorization_code_present');});`);
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    let output,code;
    try{await promisify(execFile)(process.execPath,['--test','--test-reporter',new URL('./multisite-r7-reporter.mjs',import.meta.url).href,file],{env});}
    catch(e){code=e.code;output=e.stdout;}
    assert.equal(code,1);assert(!output.includes('SECRET_SENTINEL'));
    const result=JSON.parse(output);assert.equal(result.diagnostics[0].operation,12);assert(!result.passed);
  }finally{await unlink(file);await rmdir(directory);}
});
test('actual adapter synthetic boundary: native offline artifacts are intercepted; missing protected link is denied',
  {skip:process.env.WEPUU_R7_ADAPTER_SYNTHETIC!=='1'},async()=>{
    const {PersistentReadOnlyRuntime}=await import('/workspace/packages/oauth-provider/src/persistent-readonly.ts');
    const writes=[];
    class Base {constructor(model){this.model=model;}async upsert(_id,payload){writes.push({model:this.model,payload});}}
    const runtime=new PersistentReadOnlyRuntime({clientId:'client_SYNTHETIC',resource:'https://a.example.test/mcp',
      store:{},lookups:{},resolveBinding:async()=>undefined});
    const Adapter=runtime.adapter(Base),adapter=new Adapter('AuthorizationCode');
    const native={kind:'AuthorizationCode',clientId:'client_SYNTHETIC',resource:'https://a.example.test/mcp',scope:'mcp:read offline_access'};
    assert.equal(await runtime.expiresWithSession({}, {...native,scopes:new Set(['mcp:read','offline_access'])}),false);
    await assert.rejects(()=>adapter.upsert('synthetic',native,90),e=>e.error==='invalid_grant');
    assert.equal(writes.length,0);
    await assert.rejects(()=>adapter.upsert('synthetic',{...native,resource:'https://b.example.test/mcp'},90),e=>e.error==='invalid_grant');
    await assert.rejects(()=>adapter.upsert('synthetic',{...native,scope:'mcp:read'},90),e=>e.error==='invalid_grant');
    await adapter.upsert('synthetic',{...native,scope:'mcp:read',expiresWithSession:true},90);
    await adapter.upsert('synthetic',{...native,clientId:'client_UNRELATED'},90);
    assert.equal(writes.length,2);
  });
test('actual adapter synthetic boundary: explicitly approved linked artifact keeps guarded persistence',
  {skip:process.env.WEPUU_R7_ADAPTER_SYNTHETIC!=='1'},async()=>{
    const {PersistentReadOnlyRuntime}=await import('/workspace/packages/oauth-provider/src/persistent-readonly.ts');
    const {PersistentAuthorizationPolicy}=await import('/workspace/packages/oauth-provider/src/persistent-policy.ts');
    const binding={subjectId:'subject_SYNTHETIC',tenantId:'tenant_SYNTHETIC',siteId:'site_SYNTHETIC',grantId:'grant_SYNTHETIC',
      clientId:'client_SYNTHETIC',resource:'https://a.example.test/mcp',scopes:['mcp:read']};
    const receipt={...binding,id:'receipt_SYNTHETIC',interactionUid:'interaction_SYNTHETIC',explicitApproval:true,
      version:1,revoked:false,approvedAt:100,issueExpiresAt:200,authorizationExpiresAt:1000};
    let saved=0,baseWrites=0;
    class Base {async upsert(){baseWrites++;}}
    const runtime=new PersistentReadOnlyRuntime({...binding,policy:new PersistentAuthorizationPolicy('explicit-consent'),
      nowSeconds:()=>150,resolveBinding:async()=>binding,lookups:{current:()=> 'lookup_SYNTHETIC'},
      store:{consent:async()=>receipt,saveLinked:async()=>{saved++;}}});
    const context={oidc:{entities:{Interaction:{uid:receipt.interactionUid}},provider:{Grant:{find:async()=>({
      jti:binding.grantId,accountId:binding.subjectId,clientId:binding.clientId,resources:{[binding.resource]:'mcp:read'},
      getResourceScope:()=> 'mcp:read',getOIDCScope:()=> '',getOIDCClaims:()=> []})}}}};
    const payload={kind:'AuthorizationCode',accountId:binding.subjectId,grantId:binding.grantId,clientId:binding.clientId,
      resource:binding.resource,scope:'mcp:read',sessionUid:'session_SYNTHETIC',scopes:new Set(['mcp:read'])};
    const response=new EventEmitter();
    await runtime.runRequest(response,async()=>{
      assert.equal(await runtime.expiresWithSession(context,payload),false);
      const Adapter=runtime.adapter(Base);
      await new Adapter('AuthorizationCode').upsert('artifact_SYNTHETIC',payload,90);
      await assert.rejects(()=>new Adapter('AuthorizationCode').upsert('artifact_SYNTHETIC',{...payload,accountId:'subject_UNRELATED'},90),e=>e.error==='invalid_grant');
    });
    response.emit('finish');assert.equal(saved,1);assert.equal(baseWrites,0);
  });
