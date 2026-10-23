import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PostgresOidcAdapter,SecretArtifactCodec,PostgresPersistentReceiptStore} from '../packages/database/src/index.ts';

// Historical pre-017 characterization, pinned by R10's test manifest.
// Reproduce against 546dc51447ff99c9b592f286c6888be0913e1683, not current adapters.
const keys=()=>new SecretArtifactCodec([Buffer.alloc(32,7)]);
const native={kind:'AuthorizationCode',accountId:'account_SYNTHETIC',clientId:'client_SYNTHETIC',
  grantId:'grant_SYNTHETIC',resource:'https://a.example.test/mcp',scope:'mcp:read offline_access'};

test('real base adapter can write either partition without a persistent receipt',async()=>{
  const writes=[];
  const db={withAuthorizationService:async operation=>operation({query:async(sql,params)=>{
    writes.push({sql,params});return {rows:[],rowCount:1};
  }})};
  const adapter=new PostgresOidcAdapter('AuthorizationCode',db,keys());
  await adapter.upsert('artifact_GLOBAL_SYNTHETIC',native,90);
  await adapter.upsert('artifact_TENANT_SYNTHETIC',{...native,tenantId:'11111111-1111-4111-8111-111111111111'},90);
  assert.equal(writes.length,2);
  assert.equal(writes[0].params[4],'global');assert.equal(writes[0].params[3],null);
  assert.equal(writes[1].params[4],'tenant');assert.equal(typeof writes[1].params[3],'string');
  assert(writes.every(w=>w.sql.includes('INSERT INTO oauth.secret_artifacts')));
  assert(writes.every(w=>!w.sql.includes('persistent_links')));
  assert(writes.every(w=>w.sql.includes('partition_kind = EXCLUDED.partition_kind')));
});

test('current link read has no independent discriminator when the link is absent',async()=>{
  let queryCount=0;
  const db={withAuthorizationService:async operation=>operation({query:async(sql)=>{
    queryCount++;assert(sql.includes('FROM oauth.persistent_links'));
    assert(!sql.includes('FROM oauth.secret_artifacts'));return {rows:[],rowCount:0};
  }})};
  const store=new PostgresPersistentReceiptStore(db,keys());
  const lookup=store.lookups().candidates('artifact_SYNTHETIC');
  assert.equal(await store.link('AuthorizationCode',lookup),undefined);
  assert.equal(queryCount,1);
});

test('narrowing the predicate to scope or partition admits a deleted-link downgrade counterexample',()=>{
  const original={...native,scope:'mcp:read',partition_kind:'tenant'};
  const altered={...original,scope:'mcp:read offline_access'};
  const naiveScopeNeedsLink=p=>p.clientId==='client_SYNTHETIC'&&p.scope==='mcp:read';
  assert(naiveScopeNeedsLink(original));assert(!naiveScopeNeedsLink(altered));
  // A base-produced native tenant record and an altered linked record can have
  // the same inspected tuple. This models metadata ambiguity, not an exposed
  // remote attack or a PostgreSQL execution proof.
  const inspected=p=>[p.kind,p.clientId,p.resource,p.scope,p.partition_kind,p.expiresWithSession??null];
  assert.deepEqual(inspected(altered),inspected({...native,partition_kind:'tenant'}));
});

test('existing SQL and codec do not define a protected artifact authorization-mode contract',async()=>{
  const migration=await readFile(new URL('../packages/database/migrations/005_token_lifecycle.sql',import.meta.url),'utf8');
  const table=migration.slice(0,migration.indexOf('CREATE INDEX'));
  assert(table.includes("partition_kind IN ('global', 'tenant')"));
  assert(!table.includes('authorization_mode'));
  assert(migration.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON'));
  const source=await readFile(new URL('../packages/database/src/index.ts',import.meta.url),'utf8');
  const codec=source.slice(source.indexOf('export class SecretArtifactCodec'),source.indexOf('function decodeArtifactKey'));
  assert(codec.includes('createHmac'));assert(!codec.includes('payload'));
  const key=keys();assert(key.matches('artifact_SYNTHETIC',key.current('artifact_SYNTHETIC')));
});
