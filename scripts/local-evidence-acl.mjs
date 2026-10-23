import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Windows PowerShell's CLR ACL APIs require no Get-Acl/Join-Path/JSON module autoload.
export const windowsEvidenceAclCode = String.raw`
$ErrorActionPreference='Stop'
try {
  $taskDir=$env:WEPUU_LOCAL_ACL_PATH
  $taskCurrent=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $taskAllowed=@($taskCurrent,'S-1-5-18','S-1-5-32-544')
  $taskPaths=[System.Collections.Generic.List[string]]::new()
  $taskPaths.Add($taskDir)
  foreach($taskName in $env:WEPUU_LOCAL_ACL_FILES.Split([char]10,[System.StringSplitOptions]::RemoveEmptyEntries)) {
    $taskPaths.Add([System.IO.Path]::Combine($taskDir,$taskName))
  }
  $taskOk=$true
  foreach($taskPath in $taskPaths) {
    if($taskPath -eq $taskDir) {
      $taskAcl=[System.IO.Directory]::GetAccessControl($taskPath)
      if(-not $taskAcl.AreAccessRulesProtected){$taskOk=$false}
    } else { $taskAcl=[System.IO.File]::GetAccessControl($taskPath) }
    if($taskAcl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $taskAllowed){$taskOk=$false}
    foreach($taskRule in $taskAcl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
      if($taskRule.IdentityReference.Value -notin $taskAllowed){$taskOk=$false}
    }
  }
  if($taskOk){[Console]::WriteLine('{"verified":true,"category":"PRIVATE"}')}
  else{[Console]::WriteLine('{"verified":false,"category":"NOT_PRIVATE"}')}
} catch { [Console]::WriteLine('{"verified":false,"category":"ACL_READ_NOT_CONFIRMED"}') }
`;

export function parseEvidenceAclResult(text) {
  let value;try{value=JSON.parse(text);}catch{throw Object.assign(Error('acl_result_invalid'),{code:'R3_ACL_READ_NOT_CONFIRMED'});}
  if(value?.verified===true&&value.category==='PRIVATE')return {verified:true,category:'PRIVATE'};
  if(value?.verified===false&&value.category==='NOT_PRIVATE')return {verified:false,category:'NOT_PRIVATE'};
  throw Object.assign(Error('acl_result_invalid'),{code:'R3_ACL_READ_NOT_CONFIRMED'});
}

export async function checkWindowsEvidenceAcl(directory,names,environment=process.env) {
  if(typeof directory!=='string'||!Array.isArray(names)||!names.every(n=>typeof n==='string'&&n!=='.'&&n!=='..'&&/^[A-Za-z0-9_.-]+$/u.test(n))) {
    throw Object.assign(Error('acl_input_invalid'),{code:'R3_ACL_READ_NOT_CONFIRMED'});
  }
  let out;
  try{out=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',windowsEvidenceAclCode],{
    windowsHide:true,timeout:15000,maxBuffer:10000,
    env:{...environment,WEPUU_LOCAL_ACL_PATH:directory,WEPUU_LOCAL_ACL_FILES:names.join('\n')}
  });}catch{throw Object.assign(Error('acl_transport_not_confirmed'),{code:'R3_ACL_READ_NOT_CONFIRMED'});}
  return parseEvidenceAclResult(out.stdout);
}
