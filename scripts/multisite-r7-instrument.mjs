import assert from 'node:assert/strict';
export function instrument(source) {
  let text=source;
  function replace(before,after){assert.equal(text.split(before).length,2,'EXACT_DIAGNOSTIC_ANCHOR');text=text.replace(before,after);}
  replace("import assert from 'node:assert/strict';",`import assert from 'node:assert/strict';
import { callbackSummary, providerSummary } from '/diagnostics/multisite-r7-diagnostics.mjs';`);
  replace('  assert.ok(databaseUrl);',`  assert.ok(databaseUrl);
  let operationCounter=0;
  let current={version:7,operation:0,resource:'NONE',scope:'NONE'};
  const operations=new WeakMap<object, typeof current>();
  const diagnostic=(value:object)=>t.diagnostic(JSON.stringify({...current,...value}));
  function tracked<T extends object>(input:T):T { operations.set(input,{...current}); return input; }
  const originalConsole={warn:console.warn,error:console.error,info:console.info};
  for (const level of ['warn','error','info'] as const) {
    console[level]=(...args:unknown[])=>{
      if(args.length===1 && typeof args[0]==='string' && args[0].length<2048){
        try { const safe=providerSummary(JSON.parse(args[0])); if(safe)diagnostic(safe); } catch {}
      }
      originalConsole[level](...args);
    };
  }
  t.after(()=>{Object.assign(console,originalConsole);});`);
  replace("    const verifier = randomBytes(32).toString('base64url');",`    current={version:7,operation:++operationCounter,resource:index===0?'A':'B',
      scope:scope==='mcp:read offline_access'?'READ_ONLY_OFFLINE':'READ_ONLY'};
    diagnostic({event:'operation_started'});
    const verifier = randomBytes(32).toString('base64url');`);
  replace('return { path: new URL(path, issuer).pathname, verifier, state };','return tracked({ path: new URL(path, issuer).pathname, verifier, state });');
  replace("return { path: `/interaction/${row.rows[0]?.artifact_id ?? ''}`, verifier, state };","return tracked({ path: `/interaction/${row.rows[0]?.artifact_id ?? ''}`, verifier, state });");
  replace('    let response = await approve(input.path, jar);',`    current=operations.get(input) ?? current;
    let response = await approve(input.path, jar);`);
  replace("      if (callback.origin === 'http://127.0.0.1:49152') {",`      if (callback.origin === 'http://127.0.0.1:49152') {
        diagnostic({event:'callback',...callbackSummary(callback)});`);
  replace("    return jar.request('/token', new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code',",`    current=operations.get(input) ?? current;
    return jar.request('/token', new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code',`);
  return text;
}
