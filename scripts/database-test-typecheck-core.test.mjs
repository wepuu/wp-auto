import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyInventory,verifyOptions,verifyProgramRoots,safeRows,expectedTests} from './database-test-typecheck-core.mjs';
import path from 'node:path';

test('program roots allow the real image workspace but reject foreign source trees',()=>{
  verifyProgramRoots('/workspace',['/workspace/packages/database/src/index.ts','/workspace/node_modules/typescript/lib/lib.d.ts'],path.posix);
  verifyProgramRoots('D:\\candidate',['D:\\candidate\\packages\\database\\src\\index.ts'],path.win32);
  for(const file of ['/workspace-other/x.ts','/tmp/other.ts','/workspace/../outside.ts'])assert.throws(()=>verifyProgramRoots('/workspace',[file],path.posix));
  assert.throws(()=>verifyProgramRoots('/tmp/candidate',['/workspace/packages/database/src/index.ts'],path.posix));
  assert.throws(()=>verifyProgramRoots('D:\\candidate',['C:\\foreign\\x.ts'],path.win32));
});
test('database typecheck inventory rejects omission and duplicates',()=>{
 verifyInventory(expectedTests);assert.throws(()=>verifyInventory(expectedTests.slice(1)));
 assert.throws(()=>verifyInventory([...expectedTests.slice(1),expectedTests[1]]));
});
test('database typecheck preserves strict options',()=>{
 const ts={ModuleKind:{NodeNext:199},ModuleResolutionKind:{NodeNext:99}};
 const o={noEmit:true,skipLibCheck:false,composite:false,module:199,moduleResolution:99,types:['node','bun','react']};
 for(const k of ['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitOverride','noFallthroughCasesInSwitch','noImplicitReturns',
 'noPropertyAccessFromIndexSignature','useUnknownInCatchVariables','verbatimModuleSyntax','isolatedModules','forceConsistentCasingInFileNames'])o[k]=true;
 verifyOptions(ts,o);assert.throws(()=>verifyOptions(ts,{...o,skipLibCheck:true}));assert.throws(()=>verifyOptions(ts,{...o,noEmit:false}));assert.throws(()=>verifyOptions(ts,{...o,strict:false}));
});
test('database diagnostics never output raw messages or unknown paths',()=>{
 const ts={DiagnosticCategory:{Error:1}}, secret='SENSITIVE_SENTINEL';
 const ds=[{code:2322,category:1,messageText:secret,file:{fileName:'/secret/'+secret+'.ts',getLineAndCharacterOfPosition:()=>({line:0,character:0})},start:0}];
 const output=safeRows(ts,ds,'/candidate');assert.equal(output[0].code,2322);assert.equal(output[0].kind,'UNKNOWN');assert(!JSON.stringify(output).includes(secret));
});
