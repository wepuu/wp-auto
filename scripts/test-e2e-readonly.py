"""Offline acceptance-helper integration; no production addresses or SSH."""
import copy
import json
import math
import sys
import unittest
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0, str(Path(__file__).parent / 'acceptance'))
import e2e_readonly as core

BINDING={'resource':'https://site.example.test/wp-json/wp-auto/mcp','tenant':'33333333-3333-4333-8333-333333333333','siteSha256':'a'*64,'accountSha256':'b'*64}

def fixture():
    calls=[]
    state={k:['old_'+k] for k in ['migrations','sites','pairings','outbox','grants']}
    target={'visible':True,'readonly':True,'siteCount':1,'siteActive':True,'grants':[]}
    def f(name,value):
        def call(*args):calls.append(name);return copy.deepcopy(value)
        return call
    g={'state':f('state',state),'containers':f('containers',['container']), 'connector':f('connector',{'safe':True}),
       'actual_flag':f('actual_flag','false'),'environment':f('environment',{'WEPUU_EMAIL_OTP_SEND_ENABLED':'false'})}
    reused={'identity':f('identity',{'session':True,'owner':True}),'closed_probes':f('closed_probes',None)}
    resource={'metricsValid':True,'memAvailableKiB':524288,'memoryFullAvg10':0,'hostOomBaselineMatches':True,'pass':True}
    n={'load':lambda:({'m':reused},g,{'resource_snapshot':f('resource',resource)}),'platform':f('full_gate',{'passed':True})}
    io=core.dependencies(n,{'connector':{'safe':True}},['container'],f('guard',True))
    io['query']=f('query',target)
    return io,calls,state,target

class Integration(unittest.TestCase):
    def test_full_before_nested_namespace_and_order(self):
        io,calls,_,_=fixture();r=core.platform_check(io,'before',BINDING)
        self.assertTrue(r['passed']);self.assertIn('closed_probes',calls)
        self.assertLess(calls.index('resource'),calls.index('query'))
        self.assertLess(calls.index('closed_probes'),calls.index('full_gate'))
        self.assertEqual(calls.count('full_gate'),1)
    def test_full_after_preserves_old_rows(self):
        io,_,state,target=fixture();before=core.platform_check(io,'before',BINDING)
        state['grants']+=['new'];io['state']=lambda:copy.deepcopy(state)
        g={'idSha256':'c'*64,'status':'active','scopes':['mcp:read'],'providerCount':1,'providerMatches':True,
           **{k:True for k in ['accountMatches','tenantMatches','siteMatches','clientMatches']}}
        target['grants']=[g];io['query']=lambda q:target
        self.assertTrue(core.platform_check(io,'after',BINDING,before)['passed'])
        for key in ['migrations','sites','pairings','outbox','grants']:
            altered=copy.deepcopy(state);altered[key][0]='changed';io['state']=lambda:altered
            with self.assertRaises(core.GateError):core.platform_check(io,'after',BINDING,before)
    def test_every_dependency_failure_stops_and_suppresses(self):
        for key in ['resource','state','identity','containers','connector','flags','guard','closed_guards','query','full_gate']:
            for error in [PermissionError('SECRET_SENTINEL'),TimeoutError('SECRET_SENTINEL'),RuntimeError('SECRET_SENTINEL')]:
                with self.subTest(key=key,error=type(error).__name__):
                    io,calls,_,_=fixture()
                    def fail(*a):raise error
                    io[key]=fail
                    try:core.platform_check(io,'before',BINDING)
                    except BaseException as e:r=core.safe_failure(e,key)
                    else:self.fail('failure swallowed')
                    self.assertFalse(r['passed']);self.assertNotIn('SECRET_SENTINEL',json.dumps(r))
                    if key!='full_gate':self.assertNotIn('full_gate',calls)
    def test_missing_function_or_wrong_type(self):
        io,_,_,_=fixture();del io['closed_guards']
        with self.assertRaises(KeyError):core.platform_check(io,'before',BINDING)
        for value in [None,{},[],{'passed':1},{'passed':False}]:
            io,_,_,_=fixture();io['full_gate']=lambda:value
            with self.assertRaises(core.GateError):core.platform_check(io,'before',BINDING)
    def test_resource_boundaries_and_no_secret_fields(self):
        for mem,psi,ok in [(524288,0,True),(524287,0,False),(524288,.999,True),(524288,1,False)]:
            v={'metricsValid':True,'memAvailableKiB':mem,'memoryFullAvg10':psi,'hostOomBaselineMatches':True,'pass':ok,'secret':'SECRET_SENTINEL'}
            if ok:core.resource_gate(v)
            else:
                with self.assertRaises(core.GateError) as cm:core.resource_gate(v)
                out=core.safe_failure(cm.exception,'resource');self.assertNotIn('SECRET_SENTINEL',json.dumps(out));self.assertEqual(out['resourceAtGate']['memAvailableKiB'],mem)
        for bad in [None,True,'0',float('nan'),float('inf'),-1]:
            v={'metricsValid':True,'memAvailableKiB':524288,'memoryFullAvg10':bad,'hostOomBaselineMatches':True,'pass':True}
            with self.assertRaises(core.GateError):core.resource_gate(v)
    def test_session_or_grant_blocks_before_full_gate(self):
        io,calls,_,_=fixture();io['identity']=lambda s:{'owner':True,'session':False}
        with self.assertRaises(core.GateError):core.platform_check(io,'before',BINDING)
        self.assertNotIn('full_gate',calls)
        for status in ['pending','active','revoked','suspended']:
            io,calls,_,target=fixture();target['grants']=[{'status':status}];io['query']=lambda q:target
            with self.assertRaises(core.GateError):core.platform_check(io,'before',BINDING)
            self.assertNotIn('full_gate',calls)
    def test_grant_field_matrix(self):
        valid={'visible':True,'readonly':True,'siteCount':1,'siteActive':True,'grants':[{'idSha256':'c'*64,'status':'active','scopes':['mcp:read'],'providerCount':1,'providerMatches':True,**{k:True for k in ['accountMatches','tenantMatches','siteMatches','clientMatches']}}]}
        self.assertEqual(core.grant_projection(valid,'after'),'c'*64)
        for key in ['providerMatches','accountMatches','tenantMatches','siteMatches','clientMatches']:
            for bad in [False,None,1]:
                v=copy.deepcopy(valid);v['grants'][0][key]=bad
                with self.assertRaises(core.GateError):core.grant_projection(v,'after')
        for key,bad in [('scopes',['mcp:read','openid']),('scopes',['mcp:read','mcp:content.write']),('providerCount',0),('providerCount',2),('status','pending')]:
            v=copy.deepcopy(valid);v['grants'][0][key]=bad
            with self.assertRaises(core.GateError):core.grant_projection(v,'after')
        for key in ['visible','readonly','siteActive']:
            v=copy.deepcopy(valid);v[key]=False
            with self.assertRaises(core.GateError):core.grant_projection(v,'after')
    def test_concurrent_state_change(self):
        io,_,state,_=fixture();seq=iter([state,{**state,'outbox':['changed']}]);io['state']=lambda:next(seq)
        with self.assertRaises(core.GateError):core.platform_check(io,'before',BINDING)
    def test_sql_input_and_credential_boundaries(self):
        sql=core.query(BINDING);self.assertNotIn('__RESOURCE__',sql)
        self.assertNotIn('secret_artifacts',sql);self.assertNotIn("'payload',p.payload",sql)
        for field,value in [('resource',"https://site.example.test/x'"),('resource','http://site.example.test/x'),('tenant','bad'),('accountSha256','bad')]:
            b={**BINDING,field:value}
            with self.assertRaises(core.GateError):core.query(b)
    def test_local_mapping_matrix(self):
        row={'grantIdSha256':'c'*64,**{k:True for k in ['optionNameMatches','siteMatches','identityMatches','clientMatches','resourceMatches','scopesMatch','userExists']}}
        self.assertTrue(core.mapping_projection([row],'after','c'*64));self.assertTrue(core.mapping_projection([],'before'))
        for key in list(row)[1:]:
            with self.assertRaises(core.GateError):core.mapping_projection([{**row,key:False}],'after','c'*64)
        for rows in [[],[row,row]]:
            with self.assertRaises(core.GateError):core.mapping_projection(rows,'after','c'*64)
        with self.assertRaises(core.GateError):core.mapping_projection([row],'before')
    def test_php_adapter_preserves_transaction_and_blocks_drift(self):
        rollback="        if(false===$wpdb->query('ROLLBACK')){throw new RuntimeException();}$e1kInTransaction=false;"
        zero="        if($e1kResult['localGrantMappingCount']!==0){$e1kStage='local_grant_mapping_present';throw new RuntimeException();}"
        original="$wpdb->query('START TRANSACTION READ ONLY');\n"+rollback+'\n'+zero
        reader=(Path(__file__).parent/'acceptance/e2e-grant-projection.php').read_text(encoding='utf8')
        out=core.php_adapter(original,reader)
        self.assertIn('START TRANSACTION READ ONLY',out);self.assertEqual(out.count(rollback),1)
        self.assertNotIn(zero,out);self.assertLess(out.index("$e1kResult['formalMappings']"),out.index(rollback))
        for broken in [original+rollback,original+zero,original.replace(rollback,''),original.replace(zero,'')]:
            with self.assertRaises(core.GateError):core.php_adapter(broken,reader)
    def test_arbitrary_gate_error_is_not_a_logging_bypass(self):
        out=core.safe_failure(core.GateError('SECRET_SENTINEL','SECRET_SENTINEL',{'raw':'SECRET_SENTINEL'}),'dispatch')
        self.assertNotIn('SECRET_SENTINEL',json.dumps(out));self.assertEqual(out['category'],'NOT_CONFIRMED')
    def test_legacy_failure_keeps_original_metrics_without_resampling(self):
        def fail():raise RuntimeError('RESOURCE_PRESSURE')
        calls=[]
        def diagnose(e):calls.append('diagnose');return {'metricsValid':True,'memAvailableKiB':500000,'memoryFullAvg10':2,'unknown':'SECRET_SENTINEL'}
        with self.assertRaises(core.GateError) as cm:core.legacy_full_gate(fail,diagnose)
        out=core.safe_failure(cm.exception,'complete_runtime');self.assertEqual(calls,['diagnose']);self.assertEqual(out['resourceAtGate']['memAvailableKiB'],500000)
        self.assertNotIn('SECRET_SENTINEL',json.dumps(out))
        with self.assertRaises(core.GateError) as cm:core.legacy_full_gate(fail)
        self.assertEqual(core.safe_failure(cm.exception,'complete_runtime')['resourceDiagnosticStatus'],'RESOURCE_DIAGNOSTIC_NOT_AVAILABLE')
    def test_legacy_unknown_failure_is_not_logged_or_treated_as_success(self):
        def fail():raise RuntimeError('SECRET_SENTINEL')
        with self.assertRaises(core.GateError) as cm:core.legacy_full_gate(fail)
        self.assertNotIn('SECRET_SENTINEL',json.dumps(core.safe_failure(cm.exception,'complete_runtime')))

if __name__=='__main__':unittest.main()
