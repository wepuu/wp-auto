import { readdir, readFile, lstat } from 'node:fs/promises';
import { projectEvidence } from './evidence.mjs';
const out = {};
const read = async path => { const m = await lstat(path); if (!m.isFile() || m.isSymbolicLink() || m.size > 1000000) throw Error('UNSAFE_EVIDENCE_FILE'); return JSON.parse(await readFile(path, 'utf8')); };
for (const name of ['unit-tests.json', 'database-tests.json', 'legacy-tests.json']) {
  if ((await readdir('/evidence')).includes(name)) out[name] = projectEvidence(name, await read('/evidence/' + name));
}
const stages = new Set(['setup', 'identity', 'explicit_migration', 'runtime_privileges', 'missing_schema_default_main',
  'missing_ledger_permission', 'compiled_service_matrix', 'syntax', 'transition_order']);
for (const file of ['integration.mjs', 'transition.mjs', 'startup-service.mjs', 'control-service.mjs']) {
  const source = await readFile('/harness/r8/' + file, 'utf8');
  for (const m of source.matchAll(/stage\s*=\s*'([A-Za-z0-9_]+)'/gu)) stages.add(m[1]);
}
function projection(v) {
  const r = { passed: v?.passed === true };
  if (stages.has(v?.stage)) r.stage = v.stage;
  if (['TIMEOUT', 'ASSERTION_FAILED', 'LOCAL_FAILURE', 'SQL_FAILURE', 'OFFLINE_CHECK_FAILED'].includes(v?.category)) r.category = v.category;
  if (typeof v?.sqlstate === 'string' && /^[0-9A-Z]{5}$/u.test(v.sqlstate)) r.sqlstate = v.sqlstate;
  for (const k of ['explicitMigration', 'runtimePrivilegeSeparationPass', 'protocolAssertionsPass', 'childEvidencePass', 'deadlineExceeded', 'syntheticFileSecretsEphemeral'])
    if (typeof v?.[k] === 'boolean') r[k] = v[k];
  for (const k of ['authRequests', 'tokenRequests', 'mockDeliveriesObserved', 'elapsedMonotonicMs'])
    if (Number.isFinite(v?.[k]) && v[k] >= 0) r[k] = v[k];
  if (Array.isArray(v?.checks)) { r.checkCount = v.checks.length; r.passedCheckCount = v.checks.filter(c => c.passed === true).length; }
  if (v?.matrix) r.matrix = projection(v.matrix);
  if (v?.cleanup) r.cleanup = { childrenStopped: v.cleanup.childrenStopped === true, forcedOwnedChildTermination: v.cleanup.forcedOwnedChildTermination === true };
  return r;
}
if ((await readdir('/evidence')).includes('offline')) out['offline/result.json'] = projection(await read('/evidence/offline/result.json'));
for (const dir of await readdir('/evidence')) {
  if (!/^(startup|control|matrix|transition)-[a-f0-9]{12}$/u.test(dir)) continue;
  for (const name of ['driver-result.json', 'integration.json', 'transition.json', 'startup.json', 'control.json']) {
    if ((await readdir('/evidence/' + dir)).includes(name)) out[dir + '/' + name] = projection(await read('/evidence/' + dir + '/' + name));
  }
}
console.log(JSON.stringify(out));
