import assert from 'node:assert/strict';
export const negatives=Object.freeze([
 {name:'invalid_signature',wrongSignature:true,expected:'INVALID_SIGNATURE'},
 {name:'wrong_tenant',overrides:{tenant_id:'22222222-2222-4222-8222-222222222222'},expected:'PROOF_CLAIMS_INVALID'},
 {name:'wrong_site',overrides:{site_id:'site_OTHER_FAKE'},expected:'PROOF_CLAIMS_INVALID'},
 {name:'wrong_client',overrides:{client_id:'client_OTHER_FAKE'},expected:'PROOF_CLAIMS_INVALID'},
 {name:'wrong_subject',overrides:{subject_id:'account_OTHER_FAKE'},expected:'PROOF_CLAIMS_INVALID'},
 {name:'wrong_resource',overrides:{resource:'https://protected.r3r1.example.test/wp-json/wp-auto/mcp'},expected:'PROOF_CLAIMS_INVALID'},
 {name:'wrong_scope',overrides:{scope:['mcp:content.write']},expected:'PROOF_CLAIMS_INVALID'}
]);
const errors={tenant_mismatch:'TENANT_MISMATCH',site_mismatch:'SITE_MISMATCH',client_mismatch:'CLIENT_MISMATCH',subject_mismatch:'SUBJECT_MISMATCH',resource_mismatch:'RESOURCE_MISMATCH',scope_mismatch:'SCOPE_MISMATCH'};
export function classify(error){
 if(error?.name==='PairingDiagnosticError'&&error?.stage==='proof'&&error?.code==='proof.signature_invalid')return {category:'INVALID_SIGNATURE'};
 if(error?.name==='PairingDiagnosticError'&&error?.stage==='proof'&&error?.code==='proof.claims_invalid')return {category:'PROOF_CLAIMS_INVALID'};
 if(error?.code==='23505')return {category:'SQL_UNIQUE_CONFLICT',sqlstate:'23505',constraint:error.constraint==='grants_one_live_consent_idx'?'GRANT_LIVE_BINDING_UNIQUE':'NOT_OBSERVED_OR_OTHER'};
 if(typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code))return {category:'SQL_FAILURE',sqlstate:error.code};
 if(error?.code==='ERR_JWS_SIGNATURE_VERIFICATION_FAILED')return {category:'INVALID_SIGNATURE'};
 if(typeof error?.message==='string'&&Object.hasOwn(errors,error.message))return {category:errors[error.message]};
 if(error?.code==='ERR_ASSERTION')return {category:'ASSERTION_FAILED'};
 return {category:'NOT_CONFIRMED'};
}
export async function expectedReject(operation,expected){let error;try{await operation();}catch(e){error=e;}assert(error,'EXPECTED_REJECTION');const safe=classify(error);assert.equal(safe.category,expected,'EXACT_REJECTION_CATEGORY');return safe;}
export async function proofMatrix({pending,makeProof,complete,state,setStage,checks}){
 const before=await state(pending.gid);assert.equal(before.status,'pending','ORIGINAL_PENDING');
 for(const test of negatives){setStage('proof_'+test.name);await expectedReject(async()=>complete(await makeProof(pending,test)),test.expected);assert.deepEqual(await state(pending.gid),before,'PENDING_BINDING_UNCHANGED');checks.push({name:'proof_'+test.name,passed:true,expectedError:test.expected});}
 setStage('proof_valid_activation');await complete(await makeProof(pending,{}));const after=await state(pending.gid);assert.equal(after.status,'active','VALID_PROOF_ACTIVATES');assert.deepEqual({...after,status:before.status},before,'ACTIVATION_PRESERVES_BINDING');checks.push({name:'single_pending_negative_proofs_then_valid_activation',passed:true});
}
