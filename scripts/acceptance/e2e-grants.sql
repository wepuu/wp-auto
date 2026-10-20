SELECT jsonb_build_object(
  'visible',(SELECT bool_and(has_table_privilege(current_user,t,'SELECT') AND NOT row_security_active(t::regclass))
    FROM unnest(ARRAY['platform.sites','platform.grants','platform.pairing_attempts','oauth.provider_artifacts']) t),
  'readonly',current_setting('transaction_read_only')='on',
  'siteCount',(SELECT count(*) FROM platform.sites WHERE resource_uri='__RESOURCE__'),
  'siteActive',(SELECT bool_and(status='active' AND tenant_id='__TENANT__'
    AND encode(sha256(convert_to(id,'UTF8')),'hex')='__SITE__') FROM platform.sites WHERE resource_uri='__RESOURCE__'),
  'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'idSha256',encode(sha256(convert_to(g.id,'UTF8')),'hex'),'status',g.status,
    'accountMatches',encode(sha256(convert_to(g.subject_id,'UTF8')),'hex')='__ACCOUNT__',
    'tenantMatches',g.tenant_id='__TENANT__','clientMatches',g.client_id='wepuu-e2e-codex',
    'siteMatches',encode(sha256(convert_to(g.site_id,'UTF8')),'hex')='__SITE__','scopes',to_jsonb(g.scopes),
    'providerCount',(SELECT count(*) FROM oauth.provider_artifacts p WHERE p.model='Grant' AND p.artifact_id=g.id),
    'providerMatches',(SELECT bool_and(
      p.tenant_id=g.tenant_id AND p.partition_kind='tenant' AND (p.expires_at IS NULL OR p.expires_at>statement_timestamp())
      AND p.payload->>'kind'='Grant' AND p.payload->>'jti'=g.id AND p.payload->>'accountId'=g.subject_id AND p.payload->>'clientId'=g.client_id
      AND p.payload->'resources'=jsonb_build_object('__RESOURCE__','mcp:read')
      AND coalesce(p.payload#>>'{openid,scope}','')='' AND coalesce(p.payload#>'{openid,claims}','[]'::jsonb)='[]'::jsonb
      AND coalesce(p.payload->'rejected','{}'::jsonb)='{}'::jsonb
    ) FROM oauth.provider_artifacts p WHERE p.model='Grant' AND p.artifact_id=g.id)
  ) ORDER BY g.id),'[]'::jsonb) FROM platform.grants g JOIN platform.sites s ON s.id=g.site_id AND s.tenant_id=g.tenant_id
    WHERE s.resource_uri='__RESOURCE__'));
