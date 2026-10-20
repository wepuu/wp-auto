// Isolated PostgreSQL integration. No production URLs, tokens, SSH or OAuth requests.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
const sha=x=>createHash('sha256').update(x).digest('hex');
const tenant='33333333-3333-4333-8333-333333333333',otherTenant='44444444-4444-4444-8444-444444444444';
const resource='https://site.example.test/wp-json/wp-auto/mcp',site='site_SYNTHETIC01',account='account_SYNTHETIC01',grantId='grant_SYNTHETIC01';
let client,cases=0;
try{
  const url=new URL(process.env.WEPUU_E2E_R1_DATABASE_URL??'');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/wepuu_e2e_r1');
  client=new pg.Client({connectionString:url.href,statement_timeout:10000});await client.connect();
  assert.equal((await client.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='platform'")).rows[0].n,0,'fresh isolated database required');
  const directory=new URL('../packages/database/migrations/',import.meta.url);
  const migrations=(await readdir(directory)).filter(n=>/\.sql$/.test(n)&&(!n.startsWith('014_'))).sort();
  assert.equal(migrations.length,14);
  for(const name of migrations)await client.query(await readFile(new URL(name,directory),'utf8'));
  await client.query("INSERT INTO platform.tenants(id,status) VALUES($1,'active'),($2,'active')",[tenant,otherTenant]);
  await client.query("INSERT INTO platform.accounts(id,status,identity_issuer,identity_subject_hash) VALUES($1,'active','https://issuer.example.test',$2)",[account,'a'.repeat(64)]);
  await client.query("INSERT INTO platform.sites(tenant_id,id,resource_uri,display_hostname,status,protocol_version,site_public_jwk,site_key_thumbprint) VALUES($1,$2,$3,'site.example.test','active','1',$4,'synthetic-thumbprint')",[tenant,site,resource,{kty:'OKP',crv:'Ed25519',x:'A'.repeat(43)}]);
  const template=await readFile(new URL('./acceptance/e2e-grants.sql',import.meta.url),'utf8');
  let sql=template;for(const [key,value]of Object.entries({RESOURCE:resource,TENANT:tenant,SITE:sha(site),ACCOUNT:sha(account)}))sql=sql.replaceAll(`__${key}__`,value);
  const read=async(role)=>{
    await client.query('BEGIN READ ONLY');
    try{if(role)await client.query(`SET LOCAL ROLE ${role}`);return (await client.query(sql)).rows[0].jsonb_build_object;}
    finally{await client.query('ROLLBACK')}
  };
  let out=await read();assert.equal(out.visible,true);assert.equal(out.readonly,true);assert.equal(out.siteActive,true);assert.deepEqual(out.grants,[]);cases++;
  const require=createRequire(new URL('../packages/oauth-provider/package.json',import.meta.url));
  const {Provider}=await import(pathToFileURL(require.resolve('oidc-provider')).href);
  let persisted;
  class Adapter{async upsert(id,payload){persisted={id,payload}}async find(){return undefined}}
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={...privateKey.export({format:'jwk'}),use:'sig',alg:'RS256',kid:'fixture-key'};
  const provider=new Provider('https://issuer.example.test',{adapter:Adapter,jwks:{keys:[key]},clients:[],features:{devInteractions:{enabled:false}}});
  const grant=new provider.Grant({jti:grantId,accountId:account,clientId:'wepuu-e2e-codex'});grant.addResourceScope(resource,'mcp:read');await grant.save();
  assert.equal(persisted.id,grantId);assert.equal(persisted.payload.kind,'Grant');
  await client.query("INSERT INTO platform.grants(tenant_id,id,site_id,subject_id,client_id,scopes,consent_challenge_hash,consent_expires_at,status,consent_version) VALUES($1,$2,$3,$4,'wepuu-e2e-codex',ARRAY['mcp:read'],decode(repeat('a',64),'hex'),now()+interval '1 hour','active','1')",[tenant,grantId,site,account]);
  const saveProvider=async(payload=persisted.payload,t=tenant,expires=null,partition='tenant')=>{
    await client.query("INSERT INTO oauth.provider_artifacts(model,artifact_id,tenant_id,partition_kind,payload,expires_at) VALUES('Grant',$1,$2,$3,$4,$5) ON CONFLICT(model,artifact_id) DO UPDATE SET tenant_id=excluded.tenant_id,partition_kind=excluded.partition_kind,payload=excluded.payload,expires_at=excluded.expires_at",[grantId,t,partition,payload,expires]);
  };
  await saveProvider();out=await read();assert.equal(out.grants.length,1);assert.equal(out.grants[0].providerMatches,true);assert.equal(out.grants[0].accountMatches,true);assert.equal(out.grants[0].siteMatches,true);cases++;
  for(const change of [{kind:'AuthorizationCode'},{accountId:'wrong_account'},{clientId:'wrong_client'},{resources:{[resource]:'mcp:content.write'}},{resources:{[resource]:'mcp:read','https://other.example.test/mcp':'mcp:read'}},{openid:{scope:'openid'}},{openid:{claims:['email']}},{rejected:{resources:{[resource]:'mcp:read'}}},{jti:'wrong_grant'}]){
    await saveProvider({...persisted.payload,...change});assert.notEqual((await read()).grants[0].providerMatches,true);cases++;
  }
  await saveProvider(persisted.payload,otherTenant);assert.notEqual((await read()).grants[0].providerMatches,true);cases++;
  await saveProvider(persisted.payload,tenant,new Date(0));assert.notEqual((await read()).grants[0].providerMatches,true);cases++;
  await saveProvider(persisted.payload,null,null,'global');assert.notEqual((await read()).grants[0].providerMatches,true);cases++;
  await client.query("DELETE FROM oauth.provider_artifacts WHERE model='Grant' AND artifact_id=$1",[grantId]);assert.equal((await read()).grants[0].providerCount,0);cases++;
  await saveProvider();
  for(const status of ['pending','suspended','revoked']){await client.query('UPDATE platform.grants SET status=$1 WHERE id=$2',[status,grantId]);assert.equal((await read()).grants[0].status,status);cases++;}
  await client.query("UPDATE platform.grants SET status='active',scopes=ARRAY['mcp:read','mcp:content.write'] WHERE id=$1",[grantId]);assert.deepEqual((await read()).grants[0].scopes,['mcp:read','mcp:content.write']);cases++;
  await client.query("INSERT INTO platform.grants(tenant_id,id,site_id,subject_id,client_id,scopes,consent_challenge_hash,consent_expires_at,status,consent_version) VALUES($1,'grant_SECOND',$2,'account_SECOND','wepuu-e2e-codex',ARRAY['mcp:read'],decode(repeat('b',64),'hex'),now()+interval '1 hour','active','1')",[tenant,site]);assert.equal((await read()).grants.length,2);cases++;
  await client.query('CREATE ROLE e2e_fixture_reader NOLOGIN NOBYPASSRLS');
  await client.query('GRANT USAGE ON SCHEMA platform,oauth TO e2e_fixture_reader');
  await client.query('GRANT SELECT ON platform.sites,platform.grants,platform.pairing_attempts,oauth.provider_artifacts TO e2e_fixture_reader');
  assert.equal((await read('e2e_fixture_reader')).visible,false);cases++;
  await client.query('REVOKE SELECT ON platform.grants FROM e2e_fixture_reader');await assert.rejects(()=>read('e2e_fixture_reader'));cases++;
  await client.query('BEGIN READ ONLY');await assert.rejects(()=>client.query("DELETE FROM platform.grants"));await client.query('ROLLBACK');cases++;
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='10ms'");await assert.rejects(()=>client.query('SELECT pg_sleep(1)'));await client.query('ROLLBACK');cases++;
  console.log(JSON.stringify({status:'ISOLATED_SQL_PROJECTION_PASS',passed:true,cases,providerSerialization:'locked oidc-provider Grant.save()',migrationSet:'001-013+015',productionAccessed:false}));
}catch{console.log(JSON.stringify({status:'ISOLATED_SQL_PROJECTION_NOT_CONFIRMED',passed:false,cases,rawErrorSuppressed:true}));process.exitCode=1;}
finally{await client?.end().catch(()=>{});}
