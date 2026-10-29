import assert from 'node:assert/strict';
import {projectDriver,verifyDriver as previousVerify} from '../r38/report.mjs';
export {projectDriver};
export function verifyDriver(v,ledger){const o=previousVerify(v,ledger),m=o.matrix;
 assert.deepEqual(o.checks?.map(c=>[c.name,c.passed]),[['separate_explicit_migration_identity',true],['runtime_cannot_DDL_write_ledger_or_assume_migrator',true]],'PRIVILEGES_REQUIRED');
 for(const k of ['exchange','refresh'])assert(m.normalEvidence[k]?.status===200&&m.normalEvidence[k].accessTokenPresent&&m.normalEvidence[k].refreshTokenPresent,'NORMAL_RESPONSE_REQUIRED');
 assert(m.protocolAssertionsPass===true&&m.startupEvidence?.length===2&&new Set(m.startupEvidence.map(r=>r.mode)).size===2,'LIFECYCLE_REQUIRED');
 for(const r of m.startupEvidence)assert(['A','B'].includes(r.mode)&&r.readyStatus===200&&r.readinessRequestCount===1&&r.ownedChildStopped&&!r.forcedOwnedChildTermination&&r.observed?.passed&&r.observed.evidenceComplete&&r.observed.snapshotReceived&&!r.observed.timedOut&&r.observed.exitCode===0,'LIFECYCLE_REQUIRED');
 assert(m.serviceLogs?.length===2&&new Set(m.serviceLogs.map(r=>r.mode)).size===2&&m.serviceLogs.every(r=>['A','B'].includes(r.mode)&&!r.stdout.overflow&&!r.stderr.overflow),'LOG_LIMIT');return o;
}
