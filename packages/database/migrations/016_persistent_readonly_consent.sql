-- LOCAL CANDIDATE ONLY. Additive to 001-013 and independently compatible with 015.
CREATE TABLE oauth.persistent_consents (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]+$' AND length(id) BETWEEN 8 AND 256),
  interaction_uid text NOT NULL UNIQUE CHECK (interaction_uid ~ '^[A-Za-z0-9_-]+$' AND length(interaction_uid) BETWEEN 8 AND 256),
  policy_version smallint NOT NULL DEFAULT 1 CHECK (policy_version = 1),
  tenant_id uuid NOT NULL,
  site_id text NOT NULL,
  grant_id text NOT NULL,
  subject_id text NOT NULL,
  client_id text NOT NULL,
  resource_uri text NOT NULL CHECK (resource_uri ~ '^https://'),
  scopes text[] NOT NULL CHECK (scopes = ARRAY['mcp:read']::text[]),
  explicit_approval boolean NOT NULL CHECK (explicit_approval),
  approved_at timestamptz NOT NULL,
  issue_expires_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  FOREIGN KEY (tenant_id, grant_id) REFERENCES platform.grants(tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES platform.sites(tenant_id, id),
  FOREIGN KEY (subject_id) REFERENCES platform.accounts(id),
  FOREIGN KEY (client_id) REFERENCES oauth.clients(client_id),
  CHECK (issue_expires_at > approved_at AND issue_expires_at <= approved_at + interval '5 minutes'),
  CHECK (authorization_expires_at > approved_at AND authorization_expires_at <= approved_at + interval '90 days')
);
CREATE TABLE oauth.persistent_links (
  model text NOT NULL CHECK (model IN ('AuthorizationCode', 'RefreshToken')),
  artifact_lookup text NOT NULL CHECK (artifact_lookup ~ '^[1-9][0-9]{0,4}:[a-f0-9]{64}$'),
  receipt_id text NOT NULL REFERENCES oauth.persistent_consents(id),
  interaction_uid text NOT NULL,
  session_uid text NOT NULL CHECK (session_uid ~ '^[A-Za-z0-9_-]+$' AND length(session_uid) BETWEEN 8 AND 256),
  parent_model text CHECK (parent_model IN ('AuthorizationCode','RefreshToken')),
  parent_lookup text,
  PRIMARY KEY (model, artifact_lookup),
  FOREIGN KEY (parent_model, parent_lookup) REFERENCES oauth.persistent_links(model, artifact_lookup),
  CHECK ((model = 'AuthorizationCode' AND parent_model IS NULL AND parent_lookup IS NULL)
    OR (model = 'RefreshToken' AND parent_model IS NOT NULL AND parent_lookup IS NOT NULL))
);
CREATE UNIQUE INDEX persistent_one_code_per_receipt ON oauth.persistent_links(receipt_id) WHERE model = 'AuthorizationCode';
CREATE UNIQUE INDEX persistent_one_successor_per_parent ON oauth.persistent_links(parent_model,parent_lookup) WHERE model = 'RefreshToken';
ALTER TABLE oauth.persistent_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth.persistent_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth.persistent_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth.persistent_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON oauth.persistent_consents, oauth.persistent_links FROM PUBLIC;
GRANT USAGE ON SCHEMA oauth TO wepuu_control;
GRANT SELECT ON oauth.persistent_consents, oauth.persistent_links TO wepuu_auth, wepuu_control;
CREATE POLICY persistent_auth_read ON oauth.persistent_consents FOR SELECT TO wepuu_auth USING (true);
CREATE POLICY persistent_auth_link_read ON oauth.persistent_links FOR SELECT TO wepuu_auth USING (true);
CREATE POLICY persistent_tenant_read ON oauth.persistent_consents FOR SELECT TO wepuu_control
 USING (tenant_id=platform.current_tenant_id() AND subject_id=platform.current_account_id()
   AND platform.has_active_membership(tenant_id,platform.current_account_id()));
CREATE POLICY persistent_tenant_link_read ON oauth.persistent_links FOR SELECT TO wepuu_control
 USING (EXISTS (SELECT 1 FROM oauth.persistent_consents c WHERE c.id=receipt_id));

CREATE FUNCTION oauth.persistent_binding_active(c oauth.persistent_consents) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (
  SELECT 1 FROM platform.grants g
  JOIN platform.sites s ON s.tenant_id=g.tenant_id AND s.id=g.site_id
  JOIN platform.accounts a ON a.id=g.subject_id
  JOIN platform.tenants t ON t.id=g.tenant_id
  JOIN platform.tenant_memberships m ON m.tenant_id=g.tenant_id AND m.account_id=g.subject_id
  JOIN oauth.clients client ON client.client_id=g.client_id
  WHERE g.tenant_id=c.tenant_id AND g.id=c.grant_id AND g.site_id=c.site_id
   AND g.subject_id=c.subject_id AND g.client_id=c.client_id AND s.resource_uri=c.resource_uri
   AND g.scopes=ARRAY['mcp:read']::text[] AND c.scopes=g.scopes
   AND g.status='active' AND s.status='active' AND a.status='active' AND t.status='active'
   AND m.status='active' AND m.role IN ('owner','administrator') AND client.status='active'
 );
$$;
CREATE FUNCTION oauth.persistent_receipt_valid(c oauth.persistent_consents, issuing boolean) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(c.policy_version=1 AND c.explicit_approval AND NOT c.revoked
  AND c.approved_at<=clock_timestamp() AND c.authorization_expires_at>clock_timestamp()
  AND (NOT issuing OR c.issue_expires_at>clock_timestamp())
  AND oauth.persistent_binding_active(c),false);
$$;
CREATE FUNCTION oauth.persistent_receipt_json(c oauth.persistent_consents) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',c.id,'interactionUid',c.interaction_uid,'version',c.policy_version,
 'subjectId',c.subject_id,'tenantId',c.tenant_id::text,'siteId',c.site_id,'grantId',c.grant_id,
 'clientId',c.client_id,'resource',c.resource_uri,'scopes',to_jsonb(c.scopes),
 'explicitApproval',c.explicit_approval,'approvedAt',extract(epoch FROM c.approved_at)::bigint,
 'issueExpiresAt',extract(epoch FROM c.issue_expires_at)::bigint,
 'authorizationExpiresAt',extract(epoch FROM c.authorization_expires_at)::bigint,'revoked',c.revoked);
$$;
CREATE FUNCTION oauth.create_persistent_consent(target_id text, uid text, target_tenant uuid,
 target_site text, target_grant text, target_account text, target_client text, target_resource text,
 approved boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c oauth.persistent_consents%ROWTYPE; ts timestamptz;
BEGIN
 IF approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 PERFORM 1 FROM platform.grants WHERE tenant_id=target_tenant AND id=target_grant FOR SHARE;
 ts:=date_trunc('second',clock_timestamp());
 c.id:=target_id; c.interaction_uid:=uid; c.policy_version:=1; c.tenant_id:=target_tenant;
 c.site_id:=target_site; c.grant_id:=target_grant; c.subject_id:=target_account;
 c.client_id:=target_client; c.resource_uri:=target_resource; c.scopes:=ARRAY['mcp:read'];
 c.explicit_approval:=true; c.approved_at:=ts; c.issue_expires_at:=ts+interval '5 minutes';
 c.authorization_expires_at:=ts+interval '90 days'; c.revoked:=false;
 IF NOT oauth.persistent_binding_active(c) THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 INSERT INTO oauth.persistent_consents SELECT c.*;
 RETURN oauth.persistent_receipt_json(c);
END;
$$;
CREATE FUNCTION oauth.withdraw_persistent_consent(target_id text, target_account text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE oauth.persistent_consents SET revoked=true WHERE id=target_id AND subject_id=target_account AND NOT revoked;
 RETURN FOUND;
END;
$$;

CREATE FUNCTION oauth.save_persistent_artifact(target_model text, target_version smallint,
 target_hash bytea, artifact_payload jsonb, artifact_expiry timestamptz, target_receipt text,
 uid text, session_id text, parent_kind text, parent_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c oauth.persistent_consents%ROWTYPE; parent oauth.persistent_links%ROWTYPE;
 target_key text; parent_consumed timestamptz; parent_expiry timestamptz;
BEGIN
 SELECT * INTO c FROM oauth.persistent_consents WHERE id=target_receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 PERFORM 1 FROM platform.grants WHERE tenant_id=c.tenant_id AND id=c.grant_id FOR SHARE;
 SELECT * INTO c FROM oauth.persistent_consents WHERE id=target_receipt FOR UPDATE;
 IF target_model NOT IN ('AuthorizationCode','RefreshToken') OR target_version<1
  OR octet_length(target_hash)<>32 OR NOT oauth.persistent_receipt_valid(c,target_model='AuthorizationCode')
  OR uid IS DISTINCT FROM c.interaction_uid OR artifact_expiry IS NULL OR artifact_expiry<=clock_timestamp()
  OR artifact_payload->>'kind' IS DISTINCT FROM target_model
  OR artifact_payload->>'accountId' IS DISTINCT FROM c.subject_id
  OR artifact_payload->>'clientId' IS DISTINCT FROM c.client_id
  OR artifact_payload->>'grantId' IS DISTINCT FROM c.grant_id
  OR artifact_payload->>'scope' IS DISTINCT FROM 'mcp:read'
  OR artifact_payload->>'resource' IS DISTINCT FROM c.resource_uri
  OR artifact_payload->>'sessionUid' IS DISTINCT FROM session_id
  OR artifact_payload ? 'jti' OR artifact_payload ? 'rar'
  OR COALESCE((artifact_payload->>'expiresWithSession')::boolean,false)
 THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 target_key:=target_version::text||':'||encode(target_hash,'hex');
 IF target_model='RefreshToken' THEN
  SELECT * INTO parent FROM oauth.persistent_links WHERE model=parent_kind AND artifact_lookup=parent_key;
  IF NOT FOUND OR parent.receipt_id<>c.id OR parent.interaction_uid<>uid OR parent.session_uid<>session_id
   THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
  SELECT consumed_at,expires_at INTO parent_consumed,parent_expiry FROM oauth.secret_artifacts
   WHERE model=parent_kind AND lookup_version=split_part(parent_key,':',1)::smallint
    AND artifact_hash=decode(split_part(parent_key,':',2),'hex');
  IF NOT FOUND OR parent_consumed IS NULL OR parent_expiry<=clock_timestamp()
   THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 ELSE
  IF parent_kind IS NOT NULL OR parent_key IS NOT NULL THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 END IF;
 INSERT INTO oauth.secret_artifacts(model,lookup_version,artifact_hash,tenant_id,partition_kind,payload,expires_at)
  VALUES(target_model,target_version,target_hash,c.tenant_id,'tenant',artifact_payload,artifact_expiry);
 INSERT INTO oauth.persistent_links(model,artifact_lookup,receipt_id,interaction_uid,session_uid,parent_model,parent_lookup)
  VALUES(target_model,target_key,c.id,uid,session_id,parent_kind,parent_key);
END;
$$;

CREATE FUNCTION oauth.consume_persistent_code(target_version smallint, target_hash bytea) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c oauth.persistent_consents%ROWTYPE; l oauth.persistent_links%ROWTYPE;
 s oauth.provider_artifacts%ROWTYPE; a oauth.secret_artifacts%ROWTYPE; target_key text;
BEGIN
 target_key:=target_version::text||':'||encode(target_hash,'hex');
 SELECT * INTO l FROM oauth.persistent_links WHERE model='AuthorizationCode' AND artifact_lookup=target_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 SELECT * INTO c FROM oauth.persistent_consents WHERE id=l.receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 PERFORM 1 FROM platform.grants WHERE tenant_id=c.tenant_id AND id=c.grant_id FOR SHARE;
 SELECT * INTO c FROM oauth.persistent_consents WHERE id=l.receipt_id FOR UPDATE;
 SELECT * INTO s FROM oauth.provider_artifacts WHERE model='Session' AND payload->>'uid'=l.session_uid FOR UPDATE;
 IF NOT FOUND OR s.expires_at IS NULL OR s.expires_at<=clock_timestamp()
  OR s.payload->>'accountId' IS DISTINCT FROM c.subject_id
  OR s.payload->'authorizations'->c.client_id->>'grantId' IS DISTINCT FROM c.grant_id
  OR NOT oauth.persistent_receipt_valid(c,true) OR l.interaction_uid<>c.interaction_uid
  THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 SELECT * INTO a FROM oauth.secret_artifacts WHERE model='AuthorizationCode'
  AND lookup_version=target_version AND artifact_hash=target_hash FOR UPDATE;
 IF NOT FOUND OR a.consumed_at IS NOT NULL OR a.expires_at<=clock_timestamp()
  OR a.payload->>'accountId' IS DISTINCT FROM c.subject_id
  OR a.payload->>'clientId' IS DISTINCT FROM c.client_id
  OR a.payload->>'grantId' IS DISTINCT FROM c.grant_id
  OR a.payload->>'sessionUid' IS DISTINCT FROM l.session_uid
  OR a.payload->>'resource' IS DISTINCT FROM c.resource_uri
  OR a.payload->>'scope' IS DISTINCT FROM 'mcp:read'
  THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
 UPDATE oauth.secret_artifacts SET consumed_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE model='AuthorizationCode' AND lookup_version=target_version AND artifact_hash=target_hash AND consumed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'persistent_grant_denied'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION oauth.persistent_binding_active(oauth.persistent_consents) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.persistent_receipt_valid(oauth.persistent_consents,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.persistent_receipt_json(oauth.persistent_consents) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.create_persistent_consent(text,text,uuid,text,text,text,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.withdraw_persistent_consent(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.save_persistent_artifact(text,smallint,bytea,jsonb,timestamptz,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION oauth.consume_persistent_code(smallint,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oauth.persistent_receipt_json(oauth.persistent_consents),
 oauth.create_persistent_consent(text,text,uuid,text,text,text,text,text,boolean),
 oauth.withdraw_persistent_consent(text,text),
 oauth.save_persistent_artifact(text,smallint,bytea,jsonb,timestamptz,text,text,text,text,text),
 oauth.consume_persistent_code(smallint,bytea) TO wepuu_auth;
