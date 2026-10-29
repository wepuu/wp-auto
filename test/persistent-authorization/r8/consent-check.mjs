import assert from 'node:assert/strict';
export async function inspectDenial(response,expectedStatus,id){
 let body;try{body=JSON.parse(await response.text());}catch{}
 return {id,expectedStatus,actualStatus:response.status,jsonValid:body!==undefined,error:body?.error==='invalid_request'?'invalid_request':'NOT_CONFIRMED',locationPresent:response.headers.has('location'),codePresent:body!==null&&typeof body==='object'&&Object.hasOwn(body,'code'),tokenPresent:body!==null&&typeof body==='object'&&(Object.hasOwn(body,'access_token')||Object.hasOwn(body,'refresh_token'))};
}
export function assertDenial(e){
 assert.match(e.id,/^[A-Z_]+$/);assert.equal(e.actualStatus,e.expectedStatus,e.id+'_STATUS');assert.equal(e.jsonValid,true,e.id+'_JSON');assert.equal(e.error,'invalid_request',e.id+'_ERROR');assert.equal(e.locationPresent,false,e.id+'_LOCATION');assert.equal(e.codePresent,false,e.id+'_CODE');assert.equal(e.tokenPresent,false,e.id+'_TOKEN');
}
