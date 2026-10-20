"""Acceptance-only projections. No SSH, writes, OAuth, credentials or application imports."""
import collections
import hashlib
import json
import math
import re
import uuid
from pathlib import Path
from urllib.parse import urlsplit


class GateError(Exception):
    def __init__(self, stage, code, detail=None):
        super().__init__(code)
        self.stage, self.code, self.detail = stage, code, detail


SAFE_STAGES={'resource','binding','grant_projection','delta','dispatch','identity','runtime','complete_runtime','ending','local_mapping','local_projection'}
SAFE_CODES={'RESOURCE_OBSERVATION_INVALID','HOST_OOM_BASELINE_DRIFT','RESOURCE_PRESSURE','RESOURCE_GATE_DISAGREEMENT',
            'BINDING_INVALID','SQL_TEMPLATE_INVALID','ACTION_INVALID','VISIBILITY_NOT_CONFIRMED','SITE_BINDING_FAILED',
            'GRANT_PROJECTION_INVALID','TARGET_GRANT_EXISTS','GRANT_DELTA_NOT_ONE','GRANT_BINDING_FAILED',
            'PROTECTED_ROWS_CHANGED','STATE_INVALID','SESSION_NOT_VALID','CONTAINERS_CHANGED','SITE_A_CONNECTOR_CHANGED',
            'SENDING_NOT_PAUSED','GUARD_CHANGED','FULL_GATE_FAILED','BASELINE_REQUIRED','CONCURRENT_STATE_CHANGE',
            'MAPPING_INVALID','LOCAL_GRANT_EXISTS','LOCAL_GRANT_BINDING_FAILED','ADAPTER_MARKER_DRIFT','READER_SOURCE_INVALID'}


def need(ok, stage, code):
    if ok is not True:
        raise GateError(stage, code)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def safe_failure(error, stage):
    result = {'passed': False, 'stage': stage, 'category': 'NOT_CONFIRMED', 'rawErrorSuppressed': True}
    if isinstance(error, GateError):
        result.update(stage=error.stage if error.stage in SAFE_STAGES else 'dispatch',
                      category=error.code if error.code in SAFE_CODES else 'NOT_CONFIRMED')
        if error.code == 'RESOURCE_PRESSURE' and isinstance(error.detail, dict):
            result['resourceAtGate'] = {k:error.detail[k] for k in ['memAvailableKiB','memoryFullAvg10','minimumMemoryKiB','exclusiveMaximumPsi']}
        elif error.code == 'RESOURCE_PRESSURE':
            result['resourceDiagnosticStatus'] = 'RESOURCE_DIAGNOSTIC_NOT_AVAILABLE'
    elif isinstance(error, PermissionError):
        result['category'] = 'ACCESS_DENIED'
    elif isinstance(error, TimeoutError):
        result['category'] = 'TIMEOUT'
    return result


def resource_gate(value):
    stage = 'resource'
    need(isinstance(value, dict), stage, 'RESOURCE_OBSERVATION_INVALID')
    mem, psi = value.get('memAvailableKiB'), value.get('memoryFullAvg10')
    valid = (type(mem) is int and mem >= 0 and type(psi) in (int, float)
             and math.isfinite(psi) and psi >= 0 and value.get('metricsValid') is True)
    need(valid, stage, 'RESOURCE_OBSERVATION_INVALID')
    detail = {'memAvailableKiB': mem, 'memoryFullAvg10': psi,
              'minimumMemoryKiB': 524288, 'exclusiveMaximumPsi': 1}
    need(value.get('hostOomBaselineMatches') is True, stage, 'HOST_OOM_BASELINE_DRIFT')
    if mem < 524288 or psi >= 1:
        raise GateError(stage, 'RESOURCE_PRESSURE', detail)
    need(value.get('pass') is True, stage, 'RESOURCE_GATE_DISAGREEMENT')
    return detail


def query(binding):
    need(isinstance(binding, dict), 'binding', 'BINDING_INVALID')
    resource = binding.get('resource', '')
    parts = urlsplit(resource)
    need(parts.scheme == 'https' and bool(parts.hostname) and not parts.username and not parts.password
         and not parts.query and not parts.fragment and "'" not in resource and not any(c.isspace() for c in resource), 'binding', 'BINDING_INVALID')
    for key in ['siteSha256', 'accountSha256']:
        need(isinstance(binding.get(key), str) and re.fullmatch('[a-f0-9]{64}', binding[key]) is not None, 'binding', 'BINDING_INVALID')
    try:
        tenant = str(uuid.UUID(binding['tenant']))
    except (ValueError, KeyError, TypeError, AttributeError):
        raise GateError('binding', 'BINDING_INVALID') from None
    sql = Path(__file__).with_name('e2e-grants.sql').read_text(encoding='utf8')
    for key, value in [('RESOURCE', resource), ('TENANT', tenant), ('SITE', binding['siteSha256']), ('ACCOUNT', binding['accountSha256'])]:
        sql = sql.replace('__' + key + '__', value)
    need('__RESOURCE__' not in sql, 'binding', 'SQL_TEMPLATE_INVALID')
    return sql


def grant_projection(target, action):
    need(action in ['before', 'after'], 'grant_projection', 'ACTION_INVALID')
    need(isinstance(target, dict) and target.get('visible') is True and target.get('readonly') is True,
         'grant_projection', 'VISIBILITY_NOT_CONFIRMED')
    need(type(target.get('siteCount')) is int and target['siteCount'] == 1 and target.get('siteActive') is True,
         'grant_projection', 'SITE_BINDING_FAILED')
    grants = target.get('grants')
    need(isinstance(grants, list), 'grant_projection', 'GRANT_PROJECTION_INVALID')
    if action == 'before':
        need(len(grants) == 0, 'grant_projection', 'TARGET_GRANT_EXISTS')
        return None
    need(len(grants) == 1, 'grant_projection', 'GRANT_DELTA_NOT_ONE')
    g = grants[0]
    need(isinstance(g, dict) and g.get('status') == 'active' and g.get('scopes') == ['mcp:read']
         and type(g.get('providerCount')) is int and g['providerCount'] == 1
         and g.get('providerMatches') is True
         and all(g.get(k) is True for k in ['accountMatches', 'tenantMatches', 'siteMatches', 'clientMatches'])
         and re.fullmatch('[a-f0-9]{64}', g.get('idSha256', '')) is not None,
         'grant_projection', 'GRANT_BINDING_FAILED')
    return g['idSha256']


def state_delta(before, after):
    for key in ['migrations', 'sites', 'pairings', 'outbox']:
        need(before.get(key) == after.get(key) and isinstance(before.get(key), list), 'delta', 'PROTECTED_ROWS_CHANGED')
    need(isinstance(before.get('grants'), list) and isinstance(after.get('grants'), list), 'delta', 'STATE_INVALID')
    old, current = collections.Counter(before['grants']), collections.Counter(after['grants'])
    need(not bool(old - current) and sum((current - old).values()) == 1, 'delta', 'GRANT_DELTA_NOT_ONE')


def dependencies(namespace, initial, transition, guard):
    """Explicit adapter for the reviewed E2F -> E2C -> E1K helper contract."""
    r, g, d = namespace['load']()
    reused = r['m']
    return {
        'resource': d['resource_snapshot'], 'state': g['state'], 'identity': reused['identity'],
        'containers': g['containers'], 'connector': g['connector'],
        'flags': lambda: (g['actual_flag'](), g['environment']()['WEPUU_EMAIL_OTP_SEND_ENABLED']),
        'guard': guard, 'closed_guards': reused['closed_probes'],
        'full_gate': lambda: legacy_full_gate(lambda: namespace['platform'](r, g, d), d.get('resource_failure_detail')),
        'initial': initial, 'transition': transition,
    }


def legacy_full_gate(call, diagnose=None):
    """Preserve fixed legacy codes; never substitute a later resource snapshot."""
    try:
        return call()
    except RuntimeError as error:
        code = str(error)
        if code == 'RESOURCE_PRESSURE':
            detail = None
            if callable(diagnose):
                try:
                    observed = diagnose(error)
                    mem, psi = observed.get('memAvailableKiB'), observed.get('memoryFullAvg10')
                    if (observed.get('metricsValid') is True and type(mem) is int and mem >= 0
                            and type(psi) in (int, float) and math.isfinite(psi) and psi >= 0):
                        detail = {'memAvailableKiB':mem,'memoryFullAvg10':psi,'minimumMemoryKiB':524288,'exclusiveMaximumPsi':1}
                except BaseException:
                    pass
            raise GateError('complete_runtime', code, detail) from None
        raise GateError('complete_runtime', code if code in SAFE_CODES else 'NOT_CONFIRMED') from None


def platform_check(io, action, binding, prior=None):
    need(action in ['before', 'after'], 'dispatch', 'ACTION_INVALID')
    sql = query(binding)  # Validate inputs before any remote read.
    resource = resource_gate(io['resource']())
    state = io['state']()
    who = io['identity'](state)
    need(who.get('session') is True and who.get('owner') is True, 'identity', 'SESSION_NOT_VALID')
    cs = io['containers']()
    need(cs == io['transition'], 'runtime', 'CONTAINERS_CHANGED')
    need(io['connector']() == io['initial']['connector'], 'runtime', 'SITE_A_CONNECTOR_CHANGED')
    need(io['flags']() == ('false', 'false'), 'runtime', 'SENDING_NOT_PAUSED')
    need(io['guard']() is True, 'runtime', 'GUARD_CHANGED')
    io['closed_guards']()
    target = io['query'](sql)
    grant_sha = grant_projection(target, action)
    if action == 'before':
        gate = io['full_gate']()
        need(isinstance(gate, dict) and gate.get('passed') is True, 'complete_runtime', 'FULL_GATE_FAILED')
    else:
        need(isinstance(prior, dict) and prior.get('passed') is True, 'delta', 'BASELINE_REQUIRED')
        state_delta(prior['state'], state)
        need(digest(cs) == prior.get('containerSha256'), 'delta', 'CONTAINERS_CHANGED')
    need(io['state']() == state and io['containers']() == cs, 'ending', 'CONCURRENT_STATE_CHANGE')
    return {'passed': True, 'state': {k: state[k] for k in ['migrations', 'sites', 'pairings', 'outbox', 'grants']},
            'target': target, 'grantSha256': grant_sha, 'containerSha256': digest(cs), 'resourceAtGate': resource,
            'sessionAndOwnerValid': True, 'otpActualAndPersistedFalse': True, 'guardsVerified': True,
            'productionMutatedByCheck': False}


def mapping_projection(rows, action, grant_sha=None):
    need(isinstance(rows, list), 'local_mapping', 'MAPPING_INVALID')
    if action == 'before':
        need(len(rows) == 0, 'local_mapping', 'LOCAL_GRANT_EXISTS')
    elif action == 'after':
        need(len(rows) == 1 and re.fullmatch('[a-f0-9]{64}', grant_sha or '') is not None,
             'local_mapping', 'LOCAL_GRANT_BINDING_FAILED')
        m = rows[0]
        need(m.get('grantIdSha256') == grant_sha and all(m.get(k) is True for k in [
            'optionNameMatches', 'siteMatches', 'identityMatches', 'clientMatches', 'resourceMatches', 'scopesMatch', 'userExists']),
            'local_mapping', 'LOCAL_GRANT_BINDING_FAILED')
    else:
        raise GateError('local_mapping', 'ACTION_INVALID')
    return True


def php_adapter(original, reader):
    """Fail on drift; retain the original read-only transaction and identity gates."""
    rollback="        if(false===$wpdb->query('ROLLBACK')){throw new RuntimeException();}$e1kInTransaction=false;"
    zero="        if($e1kResult['localGrantMappingCount']!==0){$e1kStage='local_grant_mapping_present';throw new RuntimeException();}"
    need(isinstance(original, str) and original.count(rollback) == 1 and original.count(zero) == 1,
         'local_projection', 'ADAPTER_MARKER_DRIFT')
    need(reader.startswith('<?php') and reader.count('function wepuu_e2e_read_mappings(') == 1,
         'local_projection', 'READER_SOURCE_INVALID')
    projection="        $e1kResult['formalMappings']=wepuu_e2e_read_mappings($wpdb,$e1kValues['wp_auto_connector_platform_connection'],$e1kValues['wp_auto_connector_site_identity']);\n"
    return reader.removeprefix('<?php')+'\n'+original.replace(rollback,projection+rollback).replace(zero,'')
