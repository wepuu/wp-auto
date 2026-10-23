import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,unlink,rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { windowsEvidenceAclCode,parseEvidenceAclResult,checkWindowsEvidenceAcl } from './local-evidence-acl.mjs';

test('ACL child code uses no autoloaded PowerShell cmdlet',()=>{
  assert(!/\b(?:Get-Acl|Join-Path|ConvertTo-Json|ConvertFrom-Json|New-Object)\b/u.test(windowsEvidenceAclCode));
  assert(windowsEvidenceAclCode.includes('[System.IO.Directory]::GetAccessControl'));
  assert(windowsEvidenceAclCode.includes('[System.IO.File]::GetAccessControl'));
});
test('ACL parser separates non-private access from missing diagnostics without leaking fields',()=>{
  assert.deepEqual(parseEvidenceAclResult('{"verified":true,"category":"PRIVATE","secret":"SECRET_SENTINEL"}'),{verified:true,category:'PRIVATE'});
  assert.deepEqual(parseEvidenceAclResult('{"verified":false,"category":"NOT_PRIVATE"}'),{verified:false,category:'NOT_PRIVATE'});
  for(const text of ['SECRET_SENTINEL','null','{}','{"verified":true,"category":"unknown"}','{"verified":false,"category":"ACL_READ_NOT_CONFIRMED"}']) {
    assert.throws(()=>parseEvidenceAclResult(text),{code:'R3_ACL_READ_NOT_CONFIRMED'});
  }
});
test('Windows child transport verifies private fixtures and rejects broad file access',{skip:process.platform!=='win32'},async()=>{
  const exec=promisify(execFile),directory=await mkdtemp(join(tmpdir(),'wepuu-r3-acl-test-')),file=join(directory,'receipt.json');
  try{
    await writeFile(file,'{"synthetic":true}\n',{flag:'wx'});
    const user=(await exec('whoami',[],{windowsHide:true})).stdout.trim();
    assert(/^[A-Za-z0-9_. -]+\\[A-Za-z0-9_. -]+$/u.test(user));
    await exec('icacls',[directory,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{windowsHide:true});
    const noModules={...process.env,PSModulePath:''};
    assert.equal((await checkWindowsEvidenceAcl(directory,['receipt.json'],noModules)).verified,true);
    await exec('icacls',[file,'/grant','*S-1-1-0:R'],{windowsHide:true});
    assert.equal((await checkWindowsEvidenceAcl(directory,['receipt.json'],noModules)).verified,false);
  }finally{await unlink(file);await rmdir(directory);}
});
