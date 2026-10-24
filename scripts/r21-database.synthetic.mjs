import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixtures, projectGroup, canStartConsole } from './run-r21-database.mjs';
import { candidateDatabase, retainedDatabase, legacyDatabase } from '../test/persistent-authorization/r10/profiles.mjs';
import { expectedLedger, fixtureScopes } from '../packages/database/test/r17-migration-evidence.mjs';
// Re-run the reviewed 78-check pure ledger/failure-envelope suite unchanged.
await import('./r17-database.synthetic.mjs');
let checks = 0; const check = fn => { fn(); checks++; };
const runner = await readFile('scripts/run-r21-database.mjs', 'utf8');
check(() => assert.equal(Object.keys(candidateDatabase).length, 13));
check(() => assert.equal(Object.values(candidateDatabase).reduce((a, b) => a + b, 0), 28));
check(() => assert.equal(Object.keys(retainedDatabase).length, 2));
check(() => assert.equal(Object.values(retainedDatabase).reduce((a, b) => a + b, 0), 3));
check(() => assert.deepEqual(legacyDatabase, { 'console-auth.test.ts': 1 }));
for (const f of ['grant-reconsent.test.ts', 'reconsent-diagnostic.mjs', 'r19-target-ledger.mjs', 'reconsent-native-fixture.mjs',
  'otp-send-budget.test.ts', 'otp-migration-evidence.mjs', 'p3d-fixture.ts', 'r17-migration-evidence.mjs']) check(() => assert(fixtures.includes('packages/database/test/' + f)));
check(() => assert.equal(new Set(fixtures).size, fixtures.length));
for (const [file, hash] of [
  ['packages/database/test/grant-reconsent.test.ts', 'a05421184ee623c6ebe8912bcb63bba5f80e07fdc125508e05aac064d429ca0b'],
  ['packages/database/test/reconsent-native-fixture.mjs', '421e75a05bd82fc97b92a3485379615aa1e2efbe3fe4728b080a25fcf01639d6'],
  ['test/persistent-authorization/r17/database-group.mjs', '55616b500101ec0af4ffa3082fc6d9103bf365d5c2a6244d7df43225c2051fe8']
]) {
  const bytes = await readFile(file);
  check(() => assert.equal(createHash('sha256').update(bytes).digest('hex'), hash));
}
function makeProcess() { return { completed: true, spawnFailed: false, timedOut: false, outputLimitExceeded: false, exitCode: 0, signal: null, outputBytes: 0 }; }
const samples = [];
for (const legacy of [false, true]) {
  const manifest = legacy ? legacyDatabase : { ...candidateDatabase, ...retainedDatabase }, run = 'r17-999-' + (legacy ? 'legacy' : 'candidate');
  const v = { run, passed: true, stage: 'complete', candidatePass: !legacy, retainedPass: !legacy, legacyResult: legacy ? 'PASS' : 'NOT_RUN', reports: [], observations: [] };
  let next = 0;
  for (const [file, count] of Object.entries(manifest)) {
    v.reports.push({ file, passed: true, migrationVerified: true, category: 'PASS', reportStatus: 'VALID', process: makeProcess(),
      report: { passed: true, total: count, fileCount: 1, skipCount: 0, topLevelCountsMatch: true, missing: [], failures: [], unexpectedEvent: false, unmappedEventCount: 0 } });
    const [profile, childCount, mode] = fixtureScopes[file], migrations = profile === 'none' ? [] : await expectedLedger(profile);
    for (let i = 0; i < childCount; i++) {
      const databaseSha256 = (++next).toString(16).padStart(64, '0');
      for (const stage of mode === 'paired' ? ['before', 'after'] : ['post']) v.observations.push({ run, file, profile, stage, databaseSha256, migrations, consoleObjects: legacy, passed: true });
    }
  }
  const safe = await projectGroup(v, run, legacy);
  check(() => assert.equal(safe.passed, true));
  for (const mutate of [x => delete x.reports[0].process, x => x.reports[0].process.exitCode = 1,
    x => x.reports[0].process.timedOut = true, x => x.reports[0].process.spawnFailed = true,
    x => x.reports[0].report.passed = false, x => x.reports[0].report.skipCount = 1,
    x => x.reports.pop(), x => x.observations.pop(), x => x.observations[0].migrations = [],
    x => x.observations[0].consoleObjects = !legacy]) {
    const bad = structuredClone(v); mutate(bad); await assert.rejects(() => projectGroup(bad, run, legacy)); checks++;
  }
  samples.push(v);
}
const prefix = 'synthetic-candidate', states = ['tests', 'pg', 'seed'].map(s => ({ name: prefix + '-' + s, stopped: true, exitCode: 0, oomKilled: false }));
check(() => assert.equal(canStartConsole(samples[0], states, prefix), true));
for (const group of [{ ...samples[0], passed: false }, { ...samples[0], candidatePass: false }, { ...samples[0], retainedPass: false }, undefined]) check(() => assert.equal(canStartConsole(group, states, prefix), false));
for (const change of [x => x.pop(), x => x.push(x[0]), x => x[0].stopped = false, x => x[1].exitCode = 1, x => x[2].oomKilled = true]) {
  const bad = structuredClone(states); change(bad); check(() => assert.equal(canStartConsole(samples[0], bad, prefix), false));
}
for (const text of ["const run = 'r21-'", "'4368a59'", "for (const phase of ['candidate', 'legacy'])", "!canStartConsole(result.groups[0]", "if (!group.passed) deny('DATABASE_GROUP_FAILED')", "'--pull=never'", "'--internal'", "'1000:1000'", "fixtureHelpersLoaded", "'scripts/run-r17-database.mjs'"]) check(() => assert(runner.includes(text)));
const worker = await readFile('test/persistent-authorization/r17/database-group.mjs', 'utf8');
check(() => assert(!worker.includes('WEPUU_R18_RUN_ID') && !worker.includes('WEPUU_R19_RUN_ID')));
check(() => assert(!runner.includes('test-persistent-images.mjs') && !runner.includes('docker system prune')));
console.log(JSON.stringify({ passed: true, r21Checks: checks, priorPureChecks: 78, formalGroupAttempts: 0, databaseStarted: false, productionAccessed: false }));
