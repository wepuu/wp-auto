import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from 'pg';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database,PostgresPersistentReceiptStore,SecretArtifactCodec,RateLimitSubjectCodec,createOidcAdapterFactory}
  from '../packages/database/src/index.ts';
const target=process.env.WEPUU_TEST_DATABASE_URL;
const id=p=>p+'_'+randomBytes(10).toString('hex');
const invalid=e=>e.error==='invalid_grant';
const denied=e=>['42501','P0001','23514','23505'].includes(e.code)||e.message==='persistent_storage_denied';
test('R9 authoritative classification and restricted writer acceptance',{skip:!target,timeout:120000},async t=>{
  const checks=[];const mark=stage=>{checks.push(stage);t.diagnostic(JSON.stringify({version:9,stage}));};
  const setup=new Client({connectionString:target});await setup.connect();
  const name='wepuu_r9_'+randomBytes(6).toString('hex');await setup.query(`CREATE DATABASE ${name}`);
  const adminUrl=new URL(target);adminUrl.pathname='/'+name;
  const admin=new Client({connectionString:adminUrl.href});await admin.connect();
  const migrator=new Database({connectionString:adminUrl.href,migrationProfile:'authorization'});
  let runtime,upgradeDb,upgradeAdmin,upgradeName,upgradeDir,loginName;
  t.after(async()=>{
    await runtime?.close();await migrator.close();await admin.end();
    await upgradeDb?.close();await upgradeAdmin?.end();
    for(const dbName of [name,upgradeName].filter(Boolean)){
      let closed=false;
      for(let i=0;i<20;i++){
        const row=await setup.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[dbName]);
        if(row.rows[0].n===0){closed=true;break;}await new Promise(r=>setTimeout(r,100));
      }
      assert(closed,'owned_database_connections_closed');
    }
    await setup.query(`DROP DATABASE ${name}`);
    if(upgradeName)await setup.query(`DROP DATABASE ${upgradeName}`);
    if(loginName)await setup.query(`DROP ROLE ${loginName}`);
    await setup.end();if(upgradeDir)await rm(upgradeDir,{recursive:true});
  });
  mark('migration017');await migrator.migrate();await migrator.assertCandidateMigrationIntegrity();
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.wepuu_schema_migrations')).rows[0].n,16);
  const b={subjectId:id('account'),tenantId:'11111111-1111-4111-8111-111111111111',siteId:id('site'),grantId:id('grant'),
    clientId:id('client'),resource:'https://r9.example.test/mcp',scopes:['mcp:read']};
  await admin.query("INSERT INTO platform.accounts(id,status,identity_issuer,identity_subject_hash) VALUES($1,'active','https://identity.example.test',$2)",[b.subjectId,'f'.repeat(64)]);
  await admin.query("INSERT INTO platform.tenants(id,status) VALUES($1,'active')",[b.tenantId]);
  await admin.query("INSERT INTO platform.tenant_memberships(tenant_id,account_id,role,status) VALUES($1,$2,'owner','active')",[b.tenantId,b.subjectId]);
  await admin.query("INSERT INTO oauth.clients(client_id,registration_mode,redirect_uris,metadata_digest,status) VALUES($1,'pre-registered','[\"http://127.0.0.1:49152/callback\"]','synthetic','active')",[b.clientId]);
  const jwk=generateKeyPairSync('ed25519').publicKey.export({format:'jwk'});
  async function seed(binding){
    await admin.query("INSERT INTO platform.sites(tenant_id,id,resource_uri,display_hostname,status,protocol_version,site_public_jwk,site_key_thumbprint) VALUES($1,$2,$3,'r9.example.test','active','1',$4::jsonb,$5)",[binding.tenantId,binding.siteId,binding.resource,JSON.stringify(jwk),'f'.repeat(64)]);
    await admin.query("INSERT INTO platform.grants(tenant_id,id,site_id,subject_id,client_id,scopes,consent_challenge_hash,consent_expires_at,status,consent_version) VALUES($1,$2,$3,$4,$5,ARRAY['mcp:read'],decode($6,'hex'),now()+interval '2 minutes','active','1')",[binding.tenantId,binding.grantId,binding.siteId,binding.subjectId,binding.clientId,'f'.repeat(64)]);
  }
  await seed(b);const second={...b,siteId:id('site'),grantId:id('grant'),resource:'https://r9-b.example.test/mcp'};await seed(second);
  loginName='r9_runtime_'+randomBytes(6).toString('hex');const password=randomBytes(32).toString('hex');
  await admin.query(`CREATE ROLE ${loginName} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await admin.query(`GRANT wepuu_auth TO ${loginName}`);
  const runtimeUrl=new URL(adminUrl);runtimeUrl.username=loginName;runtimeUrl.password=password;
  runtime=new Database({connectionString:runtimeUrl.href,migrationProfile:'authorization'});
  const codec=new SecretArtifactCodec([randomBytes(32)]),store=new PostgresPersistentReceiptStore(runtime,codec);
  const Adapter=createOidcAdapterFactory(runtime,codec,new RateLimitSubjectCodec(randomBytes(32)));
  mark('runtime_privileges');await store.assertCompatible();
  await runtime.withAuthorizationService(async c=>{
    const result=await c.query('SELECT current_user AS role,session_user AS login');
    assert.equal(result.rows[0].role,'wepuu_auth');assert.equal(result.rows[0].login,loginName);
  });
  for(const sql of ["UPDATE oauth.secret_artifacts SET payload='{}'::jsonb",'DELETE FROM oauth.secret_artifacts',
    'DELETE FROM oauth.artifact_classifications','SET ROLE wepuu_artifact_owner',
    "SELECT oauth.artifact_register(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
    "SELECT oauth.save_persistent_artifact(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)"]){
    await assert.rejects(()=>runtime.withAuthorizationService(c=>c.query(sql)),e=>e.code==='42501');
  }
  const payload=(binding=b,offline=true)=>({kind:'AuthorizationCode',accountId:binding.subjectId,clientId:binding.clientId,
    grantId:binding.grantId,resource:binding.resource,scope:offline?'mcp:read offline_access':'mcp:read',
    sessionUid:'session_SYNTHETIC',...(offline?{}:{expiresWithSession:true})});
  mark('native_classification');
  const ordinary=id('code'),native=id('code');
  await new Adapter('AuthorizationCode').upsert(ordinary,payload(b,false),90);
  await new Adapter('AuthorizationCode').upsert(native,payload(),90);
  assert.equal((await store.classification('AuthorizationCode',store.lookups().candidates(ordinary))).mode,'SESSION_BOUND');
  assert.equal((await store.classification('AuthorizationCode',store.lookups().candidates(native))).mode,'NATIVE_OFFLINE');
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM oauth.persistent_consents')).rows[0].n,0);
  await assert.rejects(()=>new Adapter('AuthorizationCode').upsert(native,payload(),90),denied);
  const both=[...store.lookups().candidates(ordinary),...store.lookups().candidates(native)];
  await assert.rejects(()=>store.classification('AuthorizationCode',both),denied);
  mark('immutable_and_tombstone');
  await assert.rejects(()=>admin.query("UPDATE oauth.artifact_classifications SET mode='SESSION_BOUND' WHERE artifact_lookup=$1",[store.lookups().current(native)]),denied);
  const removed=id('code');await new Adapter('AuthorizationCode').upsert(removed,payload(),90);
  await new Adapter('AuthorizationCode').destroy(removed);
  assert.equal(await new Adapter('AuthorizationCode').find(removed),undefined);
  await assert.rejects(()=>new Adapter('AuthorizationCode').upsert(removed,payload(),90),denied);
  const colliding=id('code');
  const race=await Promise.allSettled([new Adapter('AuthorizationCode').upsert(colliding,payload(),90),new Adapter('AuthorizationCode').upsert(colliding,payload(),90)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  mark('custom_atomicity_and_downgrade');
  const receipt=await store.createConsent({...b,id:id('receipt'),interactionUid:id('interaction'),explicitApproval:true});
  const custom=id('code'),sessionUid=id('sessionuid');
  await new Adapter('Session').upsert(id('session'),{kind:'Session',uid:sessionUid,accountId:b.subjectId,
    authorizations:{[b.clientId]:{grantId:b.grantId}}},600);
  const customPayload={...payload(b,false),sessionUid};delete customPayload.expiresWithSession;
  const link={receiptId:receipt.id,interactionUid:receipt.interactionUid,binding:b,sessionUid};
  await store.saveLinked('AuthorizationCode',custom,customPayload,90,store.lookups().current(custom),link,undefined);
  assert.equal((await store.classification('AuthorizationCode',store.lookups().candidates(custom))).mode,'PERSISTENT_READONLY');
  const key=store.lookups().current(custom),[version,hex]=key.split(':');
  const links=(await admin.query("SELECT * FROM oauth.persistent_links WHERE model='AuthorizationCode' AND artifact_lookup=$1",[key])).rows[0];
  await admin.query("DELETE FROM oauth.persistent_links WHERE model='AuthorizationCode' AND artifact_lookup=$1",[key]);
  await assert.rejects(()=>new Adapter('AuthorizationCode').find(custom),denied);
  await admin.query('INSERT INTO oauth.persistent_links(model,artifact_lookup,receipt_id,interaction_uid,session_uid,parent_model,parent_lookup) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [links.model,links.artifact_lookup,links.receipt_id,links.interaction_uid,links.session_uid,links.parent_model,links.parent_lookup]);
  await admin.query("UPDATE oauth.secret_artifacts SET payload=jsonb_set(payload,'{scope}','\"mcp:read offline_access\"'::jsonb) WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=decode($2,'hex')",[version,hex]);
  await assert.rejects(()=>new Adapter('AuthorizationCode').find(custom),denied);
  await admin.query("UPDATE oauth.secret_artifacts SET payload=$3::jsonb WHERE model='AuthorizationCode' AND lookup_version=$1 AND artifact_hash=decode($2,'hex')",[version,hex,JSON.stringify(customPayload)]);
  const failed=id('code');
  await assert.rejects(()=>store.saveLinked('AuthorizationCode',failed,{...customPayload,scope:'mcp:content.write'},90,store.lookups().current(failed),link,undefined),denied);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM oauth.artifact_classifications WHERE artifact_lookup=$1',[store.lookups().current(failed)])).rows[0].n,0);
  await new Adapter('AuthorizationCode').consume(custom);
  await assert.rejects(()=>new Adapter('AuthorizationCode').consume(custom));
  mark('native_parent_and_rotation');
  await new Adapter('AuthorizationCode').consume(native);
  const rt=id('refresh'),rt2=id('refresh'),rtPayload={...payload(),kind:'RefreshToken'};
  await new Adapter('RefreshToken').upsertNativeRefresh(rt,rtPayload,60,{model:'AuthorizationCode',keys:store.lookups().candidates(native)});
  await assert.rejects(()=>new Adapter('RefreshToken').upsertNativeRefresh(id('refresh'),rtPayload,60,
    {model:'AuthorizationCode',keys:store.lookups().candidates(native)}),denied);
  await assert.rejects(()=>new Adapter('RefreshToken').upsertNativeRefresh(id('refresh'),{...rtPayload,resource:second.resource},60,
    {model:'AuthorizationCode',keys:store.lookups().candidates(native)}),denied);
  const concurrent=await Promise.allSettled([new Adapter('AuthorizationCode').consume(ordinary),new Adapter('AuthorizationCode').consume(ordinary)]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
  await new Adapter('RefreshToken').consume(rt);
  await new Adapter('RefreshToken').upsertNativeRefresh(rt2,rtPayload,60,{model:'RefreshToken',keys:store.lookups().candidates(rt)});
  assert.equal((await store.classification('RefreshToken',store.lookups().candidates(rt2))).mode,'NATIVE_OFFLINE');
  mark('revocation_and_replay');
  const bCode=id('code'),bRt=id('refresh');await new Adapter('AuthorizationCode').upsert(bCode,payload(second),90);
  await new Adapter('AuthorizationCode').consume(bCode);
  await new Adapter('RefreshToken').upsertNativeRefresh(bRt,{...payload(second),kind:'RefreshToken'},60,{model:'AuthorizationCode',keys:store.lookups().candidates(bCode)});
  await new Adapter('RefreshToken').revokeByGrantId(second.grantId);
  assert.equal(await new Adapter('RefreshToken').find(bRt),undefined);
  assert.notEqual(await new Adapter('RefreshToken').find(rt2),undefined);
  await assert.rejects(()=>new Adapter('RefreshToken').consume(rt),invalid);
  assert.equal((await admin.query('SELECT revocation_reason FROM platform.grants WHERE id=$1',[b.grantId])).rows[0].revocation_reason,'refresh_replay');
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM oauth.revocation_outbox')).rows[0].n,2);
  mark('upgrade_and_old_reader_rejection');
  upgradeName='wepuu_r9_upgrade_'+randomBytes(6).toString('hex');await setup.query(`CREATE DATABASE ${upgradeName}`);
  const upgradeUrl=new URL(target);upgradeUrl.pathname='/'+upgradeName;
  upgradeDir=await mkdtemp(join(tmpdir(),'wepuu-r9-upgrade-'));
  await cp(new URL('../packages/database/migrations/',import.meta.url),upgradeDir,{recursive:true,
    filter:p=>!String(p).endsWith('014_console_auth_boundary.sql')&&!String(p).endsWith('017_authorization_artifact_classification.sql')});
  upgradeDb=new Database({connectionString:upgradeUrl.href,migrationsDirectory:upgradeDir});await upgradeDb.migrate();
  upgradeAdmin=new Client({connectionString:upgradeUrl.href});await upgradeAdmin.connect();
  await upgradeAdmin.query("INSERT INTO oauth.secret_artifacts(model,lookup_version,artifact_hash,partition_kind,payload,expires_at) VALUES('AuthorizationCode',1,decode($1,'hex'),'global',$2::jsonb,now()+interval '5 minutes')",['a'.repeat(64),JSON.stringify(payload())]);
  await upgradeDb.close();upgradeDb=new Database({connectionString:upgradeUrl.href,migrationProfile:'authorization'});
  await upgradeDb.migrate();await upgradeDb.assertCandidateMigrationIntegrity();
  // Stage2 deliberately uses the retained old image's compiled module, while
  // new source/migrations are mounted separately. This tests its startup gate,
  // not execution of an old service main.
  const {Database:OldDatabase}=await import('../packages/database/dist/index.js');
  const oldReader=new OldDatabase({connectionString:upgradeUrl.href});
  try{await assert.rejects(()=>oldReader.assertCandidateMigrationIntegrity(),/candidate_migration_set_mismatch/u);}
  finally{await oldReader.close();}
  await assert.rejects(()=>upgradeDb.withAuthorizationService(c=>c.query("SELECT oauth.artifact_classify('AuthorizationCode',ARRAY[$1])",['1:'+'a'.repeat(64)])),denied);
  assert.equal((await upgradeAdmin.query('SELECT count(*)::int AS n FROM oauth.artifact_classifications')).rows[0].n,0);
  assert.equal((await upgradeAdmin.query("SELECT count(*)::int AS n FROM public.wepuu_schema_migrations WHERE name LIKE '014%'")).rows[0].n,0);
  mark('complete');assert.equal(checks.at(-1),'complete');
});
