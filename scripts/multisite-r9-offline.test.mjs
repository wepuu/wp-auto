import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {PersistentReadOnlyRuntime} from '../packages/oauth-provider/src/persistent-readonly.ts';
import {authorizationMigrationNames,PostgresOidcAdapter,SecretArtifactCodec} from '../packages/database/src/index.ts';
import {readdir} from 'node:fs/promises';
const source={kind:'AuthorizationCode',jti:'artifact_SYNTHETIC',accountId:'account_SYNTHETIC',clientId:'client_SYNTHETIC',
  grantId:'grant_SYNTHETIC',resource:'https://a.example.test/mcp',scope:'mcp:read offline_access',sessionUid:'session_SYNTHETIC'};
function fixture(mode='NATIVE_OFFLINE',link=undefined){
  const writes=[];
  class Base {async upsert(...args){writes.push({kind:'ordinary',args});}async upsertNativeRefresh(...args){writes.push({kind:'native_refresh',args});}}
  const store={classification:async()=>({version:1,mode}),link:async()=>link};
  const runtime=new PersistentReadOnlyRuntime({clientId:source.clientId,resource:source.resource,store,
    lookups:{candidates:()=>['1:'+'a'.repeat(64)]},resolveBinding:async()=>undefined});
  return {runtime,store,writes,Adapter:runtime.adapter(Base)};
}
const invalid=e=>e.error==='invalid_grant';
test('native offline source is not interpreted as custom persistence and supplies a parent',async()=>{
  const f=fixture(),response=new EventEmitter();
  await f.runtime.runRequest(response,async()=>{
    await f.runtime.verifySource({},source.accountId,source);
    await new f.Adapter('RefreshToken').upsert('new_artifact_SYNTHETIC',{...source,kind:'RefreshToken'},30);
  });
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].kind,'native_refresh');
  assert.equal(f.writes[0].args[3].model,'AuthorizationCode');response.emit('finish');
});
test('session-bound source cannot mint a refresh without an eligible parent',async()=>{
  const f=fixture('SESSION_BOUND');
  await f.runtime.runRequest(new EventEmitter(),async()=>{
    await f.runtime.verifySource({},source.accountId,{...source,scope:'mcp:read',expiresWithSession:true});
    await assert.rejects(()=>new f.Adapter('RefreshToken').upsert('new_artifact_SYNTHETIC',{},30),invalid);
  });assert.equal(f.writes.length,0);
});
test('unknown mode, missing classification, lookup failure and custom link absence all fail closed',async()=>{
  for(const mode of ['UNKNOWN','PERSISTENT_READONLY']){
    const f=fixture(mode);
    await f.runtime.runRequest(new EventEmitter(),async()=>assert.rejects(()=>f.runtime.verifySource({},source.accountId,source),invalid));
    assert.equal(f.writes.length,0);
  }
  for(const failure of ['throw','missing','version']){
    const f=fixture();f.store.classification=async()=>{if(failure==='throw')throw Error('SECRET_SENTINEL');return failure==='missing'?undefined:{version:2,mode:'NATIVE_OFFLINE'};};
    await f.runtime.runRequest(new EventEmitter(),async()=>assert.rejects(()=>f.runtime.verifySource({},source.accountId,source),invalid));
  }
});
test('native classification with a conflicting custom link cannot downgrade',async()=>{
  const f=fixture('NATIVE_OFFLINE',{receiptId:'receipt_SYNTHETIC'});
  await f.runtime.runRequest(new EventEmitter(),async()=>assert.rejects(()=>f.runtime.verifySource({},source.accountId,source),invalid));
});
test('finish clears native lineage and separate request cannot inherit it',async()=>{
  const f=fixture(),response=new EventEmitter();
  await f.runtime.runRequest(response,async()=>{await f.runtime.verifySource({},source.accountId,source);response.emit('finish');
    await assert.rejects(()=>new f.Adapter('RefreshToken').upsert('new_artifact_SYNTHETIC',{},30),invalid);});
  await f.runtime.runRequest(new EventEmitter(),async()=>assert.rejects(()=>new f.Adapter('RefreshToken').upsert('new_artifact_SYNTHETIC',{},30),invalid));
});
test('database adapter writes only through narrow functions and refuses parentless refresh',async()=>{
  const queries=[];const db={withAuthorizationService:async op=>op({query:async(sql,params)=>{queries.push({sql,params});return{rows:[]};}})};
  const codec=new SecretArtifactCodec([Buffer.alloc(32,7)]),p={...source};delete p.jti;
  await new PostgresOidcAdapter('AuthorizationCode',db,codec).upsert('artifact_SYNTHETIC',p,90);
  assert(queries[0].sql.includes('oauth.issue_native_code'));
  await assert.rejects(()=>new PostgresOidcAdapter('RefreshToken',db,codec).upsert('artifact_SYNTHETIC',p,90),invalid);
  await new PostgresOidcAdapter('RefreshToken',db,codec).upsertNativeRefresh('new_artifact_SYNTHETIC',p,90,
    {model:'AuthorizationCode',keys:['1:'+'a'.repeat(64)]});
  assert(queries[1].sql.includes('oauth.issue_native_refresh'));assert.equal(queries.length,2);
});
test('017 selection excludes014, rejects unknown or duplicate releases',async()=>{
  const files=await readdir(new URL('../packages/database/migrations/',import.meta.url));
  const selected=authorizationMigrationNames(files);assert.equal(selected.length,16);assert(selected.at(-1).startsWith('017_'));
  assert(!selected.some(x=>x.startsWith('014')));
  for(const values of [[...files,'018_unknown.sql'],files.filter(f=>!f.startsWith('017')), [...files,'017_duplicate.sql']]){
    assert.throws(()=>authorizationMigrationNames(values));
  }
});
test('SQL classification and privileges include immutable modes, tombstones and no automatic backfill',async()=>{
  const sql=await readFile(new URL('../packages/database/migrations/017_authorization_artifact_classification.sql',import.meta.url),'utf8');
  for(const required of ['FORCE ROW LEVEL SECURITY','REVOKE INSERT,UPDATE,DELETE ON oauth.secret_artifacts FROM wepuu_auth',
    'REVOKE CREATE ON SCHEMA oauth','artifact_reregistration_denied','artifact_classification_immutable',
    'classification_version<>1','artifact_lookup=ANY(ks)','parent.authorization_deadline',"parent.mode<>'NATIVE_OFFLINE'",
    "c.mode='PERSISTENT_READONLY'",'destroyed_at=COALESCE(destroyed_at,clock_timestamp())'])assert(sql.includes(required),required);
  assert(!sql.includes('INSERT INTO oauth.artifact_classifications SELECT'));
  assert(!sql.includes('GRANT wepuu_artifact_owner TO'));
});
