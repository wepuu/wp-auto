import { verifyAuthorizationArtifact, verifyBuildProcess, verifyRuntimeProbe, publicBuildFailure } from './authorization-build-contract.mjs';

export const R2_ARTIFACT = Object.freeze({
  buildRevision: 'a3aaf70780adc93aadba030716e61ed9648a00df',
  tag: 'wepuu-r4br2-authorization:a3aaf70780ad-fdf45454dea0',
  imageId: 'sha256:26c094ab8280e5071bf42e072597ef364f04b57cec2817137d2ed15f874497d3'
});
export const AUTHORIZATION_BUILD_INPUTS = Object.freeze(['apps','packages','package.json','pnpm-lock.yaml',
  'pnpm-workspace.yaml','.npmrc','tsconfig.base.json','tsconfig.json','deploy/Authorization.Containerfile','.dockerignore']);
const deny = code => { throw Object.assign(new Error('revalidation_denied'),{code}); };
const probeCode = 'console.log(JSON.stringify({version:process.version,lts:process.release.lts,uid:process.getuid()}))';

/** Closed command set: there is no build, fetch, load, retag or fallback branch. */
export function revalidationDockerArgs(operation,{context,nonce}) {
  if(typeof context!=='string'||!/^[A-Za-z0-9_.-]+$/u.test(context)||!/^[a-f0-9]{12}$/u.test(nonce))deny('R3_ARGUMENT_INVALID');
  const name='wepuu-r4br3-probe-'+nonce, prefix=['--context',context];
  switch(operation) {
    case 'context': return [...prefix,'context','inspect',context];
    case 'tag': return [...prefix,'image','inspect',R2_ARTIFACT.tag];
    case 'identity': return [...prefix,'image','inspect',R2_ARTIFACT.imageId];
    case 'probe': return [...prefix,'run','--rm','--pull=never','--platform','linux/amd64','--name',name,
      '--label','wepuu.phase=p3e2sr4br3','--label','wepuu.run='+nonce,'--network','none','--read-only',
      '--no-healthcheck','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',R2_ARTIFACT.imageId,'-e',probeCode];
    case 'probe-list': return [...prefix,'container','ls','--all','--filter','name=^/'+name+'$','--format','{{.ID}}'];
    case 'probe-inspect': return [...prefix,'container','inspect',name];
    case 'probe-stop': return [...prefix,'stop','--time','5',name];
    default: return deny('R3_OPERATION_DENIED');
  }
}

export async function revalidateExistingAuthorization({readEvidence,probe,postflight,onStage=()=>{}}) {
  onStage('evidence');
  const input=await readEvidence(), receipt=input?.receipt;
  if(receipt?.revision!==R2_ARTIFACT.buildRevision||receipt?.source?.head!==R2_ARTIFACT.buildRevision
    ||receipt?.tag!==R2_ARTIFACT.tag||receipt?.attempts!==1)deny('R3_RECEIPT_MISMATCH');
  verifyBuildProcess(input.buildProcess);
  onStage('artifact');
  const artifact=verifyAuthorizationArtifact({exitCode:input.buildProcess.code,revision:R2_ARTIFACT.buildRevision,
    tag:R2_ARTIFACT.tag,iid:input.iid,metadata:input.metadata,images:input.images});
  if(artifact.imageId!==R2_ARTIFACT.imageId||input.identityImages?.length!==1
    ||input.identityImages[0]?.Id!==artifact.imageId)deny('R3_RETAINED_IMAGE_MISMATCH');
  // The tag and immutable-ID reads must describe the same reviewed artifact.
  verifyAuthorizationArtifact({exitCode:0,revision:R2_ARTIFACT.buildRevision,tag:R2_ARTIFACT.tag,
    iid:input.iid,metadata:input.metadata,images:input.identityImages});
  onStage('probe');
  const runtime=verifyRuntimeProbe(await probe(artifact.imageId));
  onStage('postflight'); await postflight(artifact);
  return {passed:true,artifact,runtime,imageBuildRevision:R2_ARTIFACT.buildRevision};
}

export function revalidationFailure(error) {
  const fixed=new Set(['R3_ARGUMENT_INVALID','R3_OPERATION_DENIED','R3_RECEIPT_MISMATCH','R3_RETAINED_IMAGE_MISMATCH',
    'R3_INPUT_MISSING','R3_INPUT_NOT_REGULAR','R3_INPUT_PERMISSION_DENIED','R3_BUILD_INPUT_CHANGED',
    'R3_VERIFIER_REVISION_MISMATCH','R3_VERIFIER_NOT_CLEAN','R3_CONTEXT_CHANGED','R3_INPUT_CHANGED','R3_PROBE_CLEANUP_FAILED']);
  return fixed.has(error?.code)?error.code:publicBuildFailure(error);
}
