-- LOCAL CANDIDATE. No backfill, no startup migration, no production authorization.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wepuu_artifact_owner') THEN
  CREATE ROLE wepuu_artifact_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 ELSIF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wepuu_artifact_owner'
   AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid='wepuu_artifact_owner'::regrole
   OR member='wepuu_artifact_owner'::regrole) THEN
  RAISE EXCEPTION 'artifact_owner_attributes_or_membership_denied';
 END IF;
END $$;
GRANT USAGE,CREATE ON SCHEMA oauth TO wepuu_artifact_owner;
CREATE TABLE oauth.artifact_classifications (
 model text NOT NULL CHECK(model IN ('AuthorizationCode','RefreshToken')),
 artifact_lookup text NOT NULL CHECK(artifact_lookup ~ '^[1-9][0-9]{0,4}:[a-f0-9]{64}$'),
 classification_version smallint NOT NULL DEFAULT 1 CHECK(classification_version=1),
 mode text NOT NULL CHECK(mode IN ('SESSION_BOUND','NATIVE_OFFLINE','PERSISTENT_READONLY')),
 binding jsonb NOT NULL,
 tenant_id uuid NOT NULL,
 site_id text NOT NULL,
 authorization_deadline timestamptz NOT NULL,
 receipt_id text,
 parent_model text,
 parent_lookup text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 destroyed_at timestamptz,
 PRIMARY KEY(model,artifact_lookup),
 CHECK((mode='PERSISTENT_READONLY' AND receipt_id IS NOT NULL) OR (mode<>'PERSISTENT_READONLY' AND receipt_id IS NULL)),
 CHECK((model='AuthorizationCode' AND parent_model IS NULL AND parent_lookup IS NULL)
   OR (model='RefreshToken' AND parent_model IN ('AuthorizationCode','RefreshToken') AND parent_lookup IS NOT NULL))
);
CREATE UNIQUE INDEX classified_one_successor_per_parent ON oauth.artifact_classifications(parent_model,parent_lookup)
 WHERE model='RefreshToken';
-- No cascading FK: an artifact deletion must not erase its classification/tombstone.
ALTER TABLE oauth.artifact_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth.artifact_classifications FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth.artifact_classifications OWNER TO wepuu_artifact_owner;
CREATE POLICY artifact_owner_access ON oauth.artifact_classifications TO wepuu_artifact_owner USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA oauth,platform TO wepuu_artifact_owner;
GRANT SELECT,INSERT,UPDATE,DELETE ON oauth.secret_artifacts TO wepuu_artifact_owner;
GRANT SELECT ON oauth.provider_artifacts,oauth.clients,platform.accounts,platform.grants,platform.sites,
 platform.tenants,platform.tenant_memberships,oauth.persistent_consents,oauth.persistent_links TO wepuu_artifact_owner;
CREATE POLICY artifact_owner_grants ON platform.grants FOR SELECT TO wepuu_artifact_owner USING(true);
-- PostgreSQL row locking requires UPDATE privilege. Only the ID column is granted,
-- and actual row updates are denied by WITH CHECK; functions never change that ID.
GRANT UPDATE(id) ON platform.grants TO wepuu_artifact_owner;
CREATE POLICY artifact_owner_grant_locks ON platform.grants FOR UPDATE TO wepuu_artifact_owner USING(true) WITH CHECK(false);
CREATE POLICY artifact_owner_sites ON platform.sites FOR SELECT TO wepuu_artifact_owner USING(true);
CREATE POLICY artifact_owner_tenants ON platform.tenants FOR SELECT TO wepuu_artifact_owner USING(true);
CREATE POLICY artifact_owner_members ON platform.tenant_memberships FOR SELECT TO wepuu_artifact_owner USING(true);
CREATE POLICY artifact_owner_receipts ON oauth.persistent_consents FOR SELECT TO wepuu_artifact_owner USING(true);
CREATE POLICY artifact_owner_links ON oauth.persistent_links FOR SELECT TO wepuu_artifact_owner USING(true);

CREATE FUNCTION oauth.artifact_binding(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('kind',p->'kind','accountId',p->'accountId','clientId',p->'clientId',
 'grantId',p->'grantId','resource',p->'resource','scope',p->'scope','sessionUid',p->'sessionUid',
 'expiresWithSession',p->'expiresWithSession','redirectUri',p->'redirectUri',
 'codeChallenge',p->'codeChallenge','codeChallengeMethod',p->'codeChallengeMethod',
 'rar',p->'rar','tenantId',p->'tenantId','tenant_id',p->'tenant_id','iiat',p->'iiat','familyId',p->'familyId');
$$;
CREATE FUNCTION oauth.artifact_assert_binding(p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE g platform.grants%ROWTYPE; requested text[];
BEGIN
 SELECT * INTO g FROM platform.grants WHERE id=p->>'grantId' FOR SHARE;
 requested:=regexp_split_to_array(btrim(COALESCE(p->>'scope','')),'\s+');
 IF NOT FOUND OR g.status<>'active' OR g.subject_id IS DISTINCT FROM p->>'accountId'
  OR g.client_id IS DISTINCT FROM p->>'clientId' OR p ? 'rar' OR p ? 'jti'
  OR p->>'sessionUid' IS NULL OR p->>'scope' IS NULL OR cardinality(requested)<1
  OR NOT EXISTS(SELECT 1 FROM platform.sites s JOIN platform.accounts a ON a.id=g.subject_id
   JOIN platform.tenants t ON t.id=g.tenant_id JOIN oauth.clients c ON c.client_id=g.client_id
   WHERE s.tenant_id=g.tenant_id AND s.id=g.site_id AND s.resource_uri=p->>'resource'
   AND s.status='active' AND a.status='active' AND t.status='active' AND c.status='active')
  OR NOT EXISTS(SELECT 1 FROM platform.tenant_memberships m WHERE m.tenant_id=g.tenant_id
   AND m.account_id=g.subject_id AND m.status='active' AND m.role IN ('owner','administrator'))
  OR EXISTS(SELECT 1 FROM unnest(requested) v WHERE v NOT IN ('openid','offline_access') AND NOT(v=ANY(g.scopes)))
 THEN RAISE EXCEPTION 'artifact_binding_denied'; END IF;
 RETURN g.tenant_id;
END $$;

CREATE FUNCTION oauth.artifact_register(m text,v smallint,h bytea,ks text[],p jsonb,mode_value text,
 deadline timestamptz,r text,pm text,pk text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text:=v::text||':'||encode(h,'hex'); candidate text;
BEGIN
 IF m NOT IN ('AuthorizationCode','RefreshToken') OR p->>'kind' IS DISTINCT FROM m OR v<1 OR octet_length(h)<>32
  OR ks IS NULL OR cardinality(ks) NOT BETWEEN 1 AND 2 OR NOT(k=ANY(ks)) OR deadline<=clock_timestamp()
 THEN RAISE EXCEPTION 'artifact_classification_denied'; END IF;
 -- All key-version candidates lock in a deterministic order; no token re-registration.
 FOR candidate IN SELECT x FROM unnest(ks) x ORDER BY x LOOP
  IF candidate !~ '^[1-9][0-9]{0,4}:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'artifact_lookup_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(m||':'||candidate,917));
 END LOOP;
 IF EXISTS(SELECT 1 FROM oauth.artifact_classifications WHERE model=m AND artifact_lookup=ANY(ks))
  OR EXISTS(SELECT 1 FROM oauth.secret_artifacts WHERE model=m AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY(ks))
 THEN RAISE EXCEPTION 'artifact_reregistration_denied'; END IF;
 INSERT INTO oauth.artifact_classifications(model,artifact_lookup,mode,binding,tenant_id,site_id,authorization_deadline,receipt_id,parent_model,parent_lookup)
 SELECT m,k,mode_value,oauth.artifact_binding(p),g.tenant_id,g.site_id,deadline,r,pm,pk
 FROM platform.grants g WHERE g.id=p->>'grantId';
 IF NOT FOUND THEN RAISE EXCEPTION 'artifact_binding_denied'; END IF;
END $$;

CREATE FUNCTION oauth.artifact_classify(m text,ks text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c oauth.artifact_classifications%ROWTYPE; n integer; a oauth.secret_artifacts%ROWTYPE;
BEGIN
 IF m NOT IN ('AuthorizationCode','RefreshToken') OR ks IS NULL OR cardinality(ks) NOT BETWEEN 1 AND 2
 THEN RAISE EXCEPTION 'artifact_classification_denied'; END IF;
 SELECT count(*) INTO n FROM oauth.artifact_classifications WHERE model=m AND artifact_lookup=ANY(ks);
 IF n<>1 THEN RAISE EXCEPTION 'artifact_classification_missing_or_conflicting'; END IF;
 SELECT * INTO c FROM oauth.artifact_classifications WHERE model=m AND artifact_lookup=ANY(ks);
 SELECT * INTO a FROM oauth.secret_artifacts WHERE model=m
  AND lookup_version::text||':'||encode(artifact_hash,'hex')=c.artifact_lookup;
 IF NOT FOUND OR c.classification_version<>1 OR c.destroyed_at IS NOT NULL
  OR c.binding IS DISTINCT FROM oauth.artifact_binding(a.payload)
  OR NOT EXISTS(SELECT 1 FROM platform.grants g JOIN platform.sites s ON s.tenant_id=g.tenant_id AND s.id=g.site_id
    WHERE g.id=c.binding->>'grantId' AND g.tenant_id=c.tenant_id AND g.site_id=c.site_id
    AND g.subject_id=c.binding->>'accountId' AND g.client_id=c.binding->>'clientId'
    AND s.resource_uri=c.binding->>'resource')
 THEN RAISE EXCEPTION 'artifact_classification_denied'; END IF;
 IF c.mode='PERSISTENT_READONLY' AND NOT EXISTS(SELECT 1 FROM oauth.persistent_links l
  WHERE l.model=m AND l.artifact_lookup=c.artifact_lookup AND l.receipt_id=c.receipt_id)
 THEN RAISE EXCEPTION 'artifact_link_missing'; END IF;
 RETURN jsonb_build_object('version',c.classification_version,'mode',c.mode);
END $$;

CREATE FUNCTION oauth.issue_native_code(v smallint,h bytea,ks text[],p jsonb,expiry timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE mode_value text; tenant uuid;
BEGIN
 tenant:=oauth.artifact_assert_binding(p);
 IF p->>'kind' IS DISTINCT FROM 'AuthorizationCode' OR expiry IS NULL OR expiry<=clock_timestamp()
  OR expiry>clock_timestamp()+interval '91 seconds' THEN RAISE EXCEPTION 'artifact_code_denied'; END IF;
 IF p->'expiresWithSession'='true'::jsonb AND NOT('offline_access'=ANY(regexp_split_to_array(p->>'scope','\s+'))) THEN
  mode_value:='SESSION_BOUND';
 ELSIF (NOT(p ? 'expiresWithSession') OR p->'expiresWithSession'='false'::jsonb)
  AND 'offline_access'=ANY(regexp_split_to_array(p->>'scope','\s+')) THEN mode_value:='NATIVE_OFFLINE';
 ELSE RAISE EXCEPTION 'artifact_native_mode_denied'; END IF;
 PERFORM oauth.artifact_register('AuthorizationCode',v,h,ks,p,mode_value,clock_timestamp()+interval '90 days',NULL,NULL,NULL);
 INSERT INTO oauth.secret_artifacts(model,lookup_version,artifact_hash,tenant_id,partition_kind,payload,expires_at)
 VALUES('AuthorizationCode',v,h,tenant,'tenant',p,expiry);
END $$;

CREATE FUNCTION oauth.issue_native_refresh(v smallint,h bytea,ks text[],p jsonb,expiry timestamptz,pm text,pks text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE parent oauth.artifact_classifications%ROWTYPE; a oauth.secret_artifacts%ROWTYPE; tenant uuid; n integer;
BEGIN
 tenant:=oauth.artifact_assert_binding(p);
 PERFORM oauth.artifact_classify(pm,pks);
 SELECT count(*) INTO n FROM oauth.artifact_classifications WHERE model=pm AND artifact_lookup=ANY(pks);
 IF n<>1 THEN RAISE EXCEPTION 'artifact_parent_denied'; END IF;
 SELECT * INTO parent FROM oauth.artifact_classifications WHERE model=pm AND artifact_lookup=ANY(pks) FOR UPDATE;
 SELECT * INTO a FROM oauth.secret_artifacts WHERE model=pm
  AND lookup_version::text||':'||encode(artifact_hash,'hex')=parent.artifact_lookup FOR UPDATE;
 IF NOT FOUND OR a.consumed_at IS NULL OR a.expires_at<=clock_timestamp() OR parent.mode<>'NATIVE_OFFLINE'
  OR p->>'kind' IS DISTINCT FROM 'RefreshToken' OR expiry IS NULL OR expiry<=clock_timestamp()
  OR expiry>parent.authorization_deadline OR expiry>clock_timestamp()+interval '30 days 1 second'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['accountId','clientId','grantId','resource','sessionUid']) f
    WHERE p->f IS DISTINCT FROM a.payload->f)
  OR EXISTS(SELECT 1 FROM unnest(regexp_split_to_array(p->>'scope','\s+')) s
    WHERE NOT(s=ANY(regexp_split_to_array(a.payload->>'scope','\s+'))))
 THEN RAISE EXCEPTION 'artifact_parent_denied'; END IF;
 PERFORM oauth.artifact_register('RefreshToken',v,h,ks,p,'NATIVE_OFFLINE',parent.authorization_deadline,NULL,pm,parent.artifact_lookup);
 INSERT INTO oauth.secret_artifacts(model,lookup_version,artifact_hash,tenant_id,partition_kind,payload,expires_at)
 VALUES('RefreshToken',v,h,tenant,'tenant',p,expiry);
END $$;

CREATE FUNCTION oauth.issue_persistent_artifact(m text,v smallint,h bytea,ks text[],p jsonb,expiry timestamptz,
 r text,uid text,sid text,pm text,pk text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c oauth.persistent_consents%ROWTYPE; parent oauth.artifact_classifications%ROWTYPE;
BEGIN
 PERFORM oauth.artifact_assert_binding(p);
 SELECT * INTO c FROM oauth.persistent_consents WHERE id=r;
 IF NOT FOUND THEN RAISE EXCEPTION 'artifact_receipt_denied'; END IF;
 IF m='RefreshToken' THEN
  SELECT * INTO parent FROM oauth.artifact_classifications WHERE model=pm AND artifact_lookup=pk FOR UPDATE;
  IF NOT FOUND OR parent.mode<>'PERSISTENT_READONLY' OR parent.receipt_id<>r OR parent.classification_version<>1
   OR parent.destroyed_at IS NOT NULL THEN RAISE EXCEPTION 'artifact_parent_denied'; END IF;
 END IF;
 PERFORM oauth.artifact_register(m,v,h,ks,p,'PERSISTENT_READONLY',c.authorization_expires_at,r,pm,pk);
 PERFORM oauth.save_persistent_artifact(m,v,h,p,expiry,r,uid,sid,pm,pk);
END $$;

CREATE FUNCTION oauth.save_other_artifact(m text,v smallint,h bytea,p jsonb,expiry timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE tenant uuid;
BEGIN
 IF m NOT IN ('AccessToken','BackchannelAuthenticationRequest','DeviceCode','InitialAccessToken',
  'PushedAuthorizationRequest','RegistrationAccessToken') OR p ? 'jti' OR v<1 OR octet_length(h)<>32
 THEN RAISE EXCEPTION 'artifact_model_denied'; END IF;
 tenant:=COALESCE(p->>'tenantId',p->>'tenant_id')::uuid;
 INSERT INTO oauth.secret_artifacts(model,lookup_version,artifact_hash,tenant_id,partition_kind,payload,expires_at)
 VALUES(m,v,h,tenant,CASE WHEN tenant IS NULL THEN 'global' ELSE 'tenant' END,p,expiry)
 ON CONFLICT(model,lookup_version,artifact_hash) DO UPDATE SET payload=EXCLUDED.payload,
  expires_at=LEAST(oauth.secret_artifacts.expires_at,EXCLUDED.expires_at),updated_at=clock_timestamp();
 -- Never clear consumed_at through a save.
END $$;

CREATE FUNCTION oauth.consume_classified_artifact(m text,ks text[],rate_subject bytea) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a oauth.secret_artifacts%ROWTYPE; c oauth.artifact_classifications%ROWTYPE;
BEGIN
 PERFORM oauth.artifact_classify(m,ks);
 SELECT * INTO c FROM oauth.artifact_classifications WHERE model=m AND artifact_lookup=ANY(ks);
 -- Lock Grant before artifact, matching receipt consumption and revocation lock order.
 PERFORM 1 FROM platform.grants WHERE id=c.binding->>'grantId' FOR UPDATE;
 SELECT * INTO a FROM oauth.secret_artifacts WHERE model=m
  AND lookup_version::text||':'||encode(artifact_hash,'hex')=c.artifact_lookup FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF a.consumed_at IS NOT NULL THEN
  IF m='RefreshToken' THEN
   PERFORM oauth.revoke_refresh_grant(a.payload->>'grantId',clock_timestamp(),'refresh_replay'); RETURN 'replay';
  END IF;
  RETURN 'missing';
 END IF;
 IF a.expires_at<=clock_timestamp() THEN RETURN 'missing'; END IF;
 IF m='RefreshToken' THEN
  IF octet_length(rate_subject) IS DISTINCT FROM 32 OR NOT oauth.consume_rate_limit('oauth.refresh_family',rate_subject,10,60,clock_timestamp())
   THEN RETURN 'rate_limited'; END IF;
 END IF;
 IF m='AuthorizationCode' AND c.mode='PERSISTENT_READONLY' THEN
  PERFORM oauth.consume_persistent_code(a.lookup_version,a.artifact_hash);
 ELSE
  UPDATE oauth.secret_artifacts SET consumed_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE model=m AND lookup_version=a.lookup_version AND artifact_hash=a.artifact_hash AND consumed_at IS NULL;
 END IF;
 RETURN 'consumed';
END $$;

CREATE FUNCTION oauth.consume_other_artifact(m text,ks text[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF m IN ('AuthorizationCode','RefreshToken') THEN RAISE EXCEPTION 'artifact_model_denied'; END IF;
 UPDATE oauth.secret_artifacts SET consumed_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE model=m AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY(ks)
  AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp());
 RETURN FOUND;
END $$;

CREATE FUNCTION oauth.destroy_classified_artifact(m text,ks text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE oauth.artifact_classifications SET destroyed_at=COALESCE(destroyed_at,clock_timestamp())
 WHERE model=m AND artifact_lookup=ANY(ks);
 DELETE FROM oauth.secret_artifacts WHERE model=m AND lookup_version::text||':'||encode(artifact_hash,'hex')=ANY(ks);
END $$;
CREATE FUNCTION oauth.destroy_grant_artifacts(g text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE oauth.artifact_classifications SET destroyed_at=COALESCE(destroyed_at,clock_timestamp()) WHERE binding->>'grantId'=g;
 DELETE FROM oauth.secret_artifacts WHERE payload->>'grantId'=g;
END $$;

CREATE FUNCTION oauth.artifact_classification_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'destroyed_at') IS DISTINCT FROM (to_jsonb(OLD)-'destroyed_at')
  OR OLD.destroyed_at IS NOT NULL AND NEW.destroyed_at IS DISTINCT FROM OLD.destroyed_at
 THEN RAISE EXCEPTION 'artifact_classification_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER artifact_classification_immutable BEFORE UPDATE OR DELETE ON oauth.artifact_classifications
 FOR EACH ROW EXECUTE FUNCTION oauth.artifact_classification_immutable();

-- Narrow owner rights; callers cannot assume this role or invoke private primitives.
GRANT EXECUTE ON FUNCTION oauth.save_persistent_artifact(text,smallint,bytea,jsonb,timestamptz,text,text,text,text,text),
 oauth.consume_persistent_code(smallint,bytea),oauth.revoke_refresh_grant(text,timestamptz,text),
 oauth.consume_rate_limit(text,bytea,integer,integer,timestamptz) TO wepuu_artifact_owner;
REVOKE INSERT,UPDATE,DELETE ON oauth.secret_artifacts FROM wepuu_auth;
REVOKE EXECUTE ON FUNCTION oauth.save_persistent_artifact(text,smallint,bytea,jsonb,timestamptz,text,text,text,text,text),
 oauth.consume_persistent_code(smallint,bytea) FROM wepuu_auth;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='oauth' AND p.proname IN ('artifact_binding','artifact_assert_binding','artifact_register','artifact_classify',
   'issue_native_code','issue_native_refresh','issue_persistent_artifact','save_other_artifact','consume_classified_artifact',
   'consume_other_artifact','destroy_classified_artifact','destroy_grant_artifacts','artifact_classification_immutable') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  EXECUTE format('ALTER FUNCTION %s OWNER TO wepuu_artifact_owner',f.signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA oauth FROM wepuu_artifact_owner;
GRANT EXECUTE ON FUNCTION oauth.artifact_classify(text,text[]),
 oauth.issue_native_code(smallint,bytea,text[],jsonb,timestamptz),
 oauth.issue_native_refresh(smallint,bytea,text[],jsonb,timestamptz,text,text[]),
 oauth.issue_persistent_artifact(text,smallint,bytea,text[],jsonb,timestamptz,text,text,text,text,text),
 oauth.save_other_artifact(text,smallint,bytea,jsonb,timestamptz),
 oauth.consume_classified_artifact(text,text[],bytea),oauth.consume_other_artifact(text,text[]),
 oauth.destroy_classified_artifact(text,text[]),oauth.destroy_grant_artifacts(text) TO wepuu_auth;
