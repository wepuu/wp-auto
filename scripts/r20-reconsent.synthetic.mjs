import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { nativeFixturePayload, fixtureParent } from '../packages/database/test/reconsent-native-fixture.mjs';
import { expectedLedger } from '../packages/database/test/r17-migration-evidence.mjs';
import { targetFile, projectTarget } from '../test/persistent-authorization/r19/target-schema.mjs';
import { executeTarget } from '../test/persistent-authorization/r19/reconsent-target.mjs';
let checks = 0; const check = fn => { fn(); checks++; };
const binding = { grantId: 'grant_FIRST', accountId: 'account_SYNTHETIC', clientId: 'client_SYNTHETIC',
  resource: 'https://reconsent.example.test/wp-json/wp-auto/v1/mcp', sessionUid: 'session_FIRST' };
const first = nativeFixturePayload(binding), second = nativeFixturePayload({ ...binding, grantId: 'grant_SECOND', sessionUid: 'session_SECOND' });
check(() => assert.equal(first.kind, 'RefreshToken'));
check(() => assert.equal(first.scope, 'mcp:read offline_access'));
check(() => assert.equal(first.resource, binding.resource));
check(() => assert.equal(first.accountId, second.accountId));
check(() => assert.notEqual(first.grantId, second.grantId));
check(() => assert.notEqual(first.sessionUid, second.sessionUid));
check(() => assert(Object.isFrozen(first)));
check(() => assert(!('expiresWithSession' in first)));
for (const patch of [{ grantId: '' }, { sessionUid: '' }, { scope: 'mcp:write' }, { tenantId: 'unknown' },
  { resource: 'https://www.wepuu.com/wp-json/wp-auto/mcp' }, { resource: 'http://site.example.test/mcp' },
  { resource: 'https://user:secret@site.example.test/mcp' }, { kind: 'AuthorizationCode' }]) check(() => assert.throws(() => nativeFixturePayload({ ...binding, ...patch })));
const requests = [], candidates = [{ version: 2, digest: new Uint8Array(32).fill(2) }, { version: 1, digest: new Uint8Array(32).fill(1) }];
const codec = { candidates(id) { requests.push(id); return candidates; } };
const parent = fixtureParent(codec, 'AuthorizationCode', 'code_first_synthetic');
check(() => assert.deepEqual(requests, ['code_first_synthetic']));
check(() => assert.deepEqual(parent, { model: 'AuthorizationCode', keys: ['2:' + '02'.repeat(32), '1:' + '01'.repeat(32)] }));
check(() => assert.equal(fixtureParent(codec, 'RefreshToken', 'r0_synthetic').model, 'RefreshToken'));
for (const value of [[], [...candidates, candidates[0]], [{ version: 0, digest: new Uint8Array(32) }],
  [{ version: 65536, digest: new Uint8Array(32) }], [{ version: 1, digest: new Uint8Array(31) }],
  [{ version: 1, digest: 'SENSITIVE_SENTINEL' }], [candidates[0], candidates[0]]]) check(() => assert.throws(() => fixtureParent({ candidates: () => value }, 'AuthorizationCode', 'code_synthetic')));
check(() => assert.throws(() => fixtureParent(codec, 'Session', 'id_synthetic')));
check(() => assert.throws(() => fixtureParent(codec, 'RefreshToken', '')));
// Restore only approved fixture replacements and compare the entire R19 file.
const original = execFileSync('git', ['show', '435e49e:' + targetFile], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
const current = (await readFile(targetFile, 'utf8')).replaceAll('\r\n', '\n');
let restored = current;
const block = (label, replacement) => {
  const begin = '  // BEGIN R20 ' + label + '\n', end = '  // END R20 ' + label + '\n';
  const a = restored.indexOf(begin), b = restored.indexOf(end);
  assert(a >= 0 && b > a && restored.indexOf(begin, a + 1) === -1);
  restored = restored.slice(0, a) + replacement + restored.slice(b + end.length);
};
restored = restored.replace("import { nativeFixturePayload, fixtureParent } from './reconsent-native-fixture.mjs';\n", '');
block('fixture preparation', '');
block('first issuance', '  await refresh.upsert(r0, { ...tokenPayload, rotations: 0 }, 3_600);\n');
block('independent second issuance', "  await refresh.upsert(explicitRevocationToken, {\n    ...tokenPayload, grantId: second.grantId, rotations: 0\n  }, 3_600);\n");
restored = restored.replace("  await refresh.upsertNativeRefresh(r1, { ...tokenPayload, rotations: 1 }, 3_600,\n    fixtureParent(artifactCodec, 'RefreshToken', r0));", '  await refresh.upsert(r1, { ...tokenPayload, rotations: 1 }, 3_600);');
const start = restored.indexOf('  const tokenPayload = '), end = restored.indexOf("  diagnostic.checkpoint('R0_ISSUE');", start);
const oldStart = original.indexOf('  const tokenPayload = '), oldEnd = original.indexOf("  diagnostic.checkpoint('R0_ISSUE');", oldStart);
assert(start >= 0 && end > start && oldStart >= 0 && oldEnd > oldStart);
restored = restored.slice(0, start) + original.slice(oldStart, oldEnd) + restored.slice(end);
check(() => assert.equal(restored, original));
check(() => assert.equal([...current.matchAll(/await refresh\.upsert\(/gu)].length, 0));
check(() => assert.equal([...current.matchAll(/await expectRejectedIssue\(/gu)].length, 4));
for (const text of ["fixtureParent(artifactCodec, 'RefreshToken', r0)", "fixtureParent(artifactCodec, 'AuthorizationCode', secondCode)",
  "await codeAdapter.consume(firstCode)", "await codeAdapter.consume(secondCode)", "code: 'P0001' | '23505'",
  "assert.deepEqual((await counts()).rows, before.rows)", "assert.equal(await refresh.find(id), undefined)",
  "sessionUid: 'session_RECONSENT02'", "scope", "assert.equal(typeof (await replayAdapter.find(r0))?.['consumed'], 'number')"]) {
  if (text === 'scope') check(() => assert.equal(first.scope, 'mcp:read offline_access'));
  else check(() => assert(current.includes(text)));
}
// Reuse the reviewed worker with purely mocked I/O: exactly one target, no DB/process.
const run = 'r19-456-target', diagnosticRun = 'r18-456', expected = await expectedLedger('candidate');
for (const outcome of ['pass', 'fail', 'missing-diagnostic', 'missing-ledger', 'save-failed']) {
  let attempts = 0, saved, closed = false;
  const cfg = { host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres', password: 'c'.repeat(64), run, diagnosticRun };
  class Client { async connect() {} async query() {} async end() { closed = true; } }
  const rawPass = outcome !== 'fail';
  const result = await executeTarget({ load: async () => cfg, Client, runtime: async () => ({ executable: 'not-executed', args: [] }),
    test: async options => {
      attempts++; assert.deepEqual(options.config.files, [targetFile]); assert.equal(options.timeoutMs, 150000);
      assert.equal(options.config.expectedTopLevel['grant-reconsent.test.ts'], 1);
      return { passed: rawPass, category: rawPass ? 'PASS' : 'TEST_FAILURE', reportStatus: 'VALID',
        process: { completed: true, spawnFailed: false, timedOut: false, outputLimitExceeded: false, exitCode: rawPass ? 0 : 1, signal: null, outputBytes: 0 },
        report: { passed: rawPass, total: 1, fileCount: 1, unmappedEventCount: 0, topLevelCountsMatch: true, unexpectedEvent: false, missing: [], skips: [],
          failures: rawPass ? [] : [{ file: targetFile, line: 1, category: 'ERR_TEST_FAILURE' }] } };
    },
    diagnostics: async () => outcome === 'missing-diagnostic' ? { readStatus: 'MISSING', diagnosticCoverage: 'NOT_CONFIRMED' }
      : { readStatus: 'VALID', run: diagnosticRun, diagnosticCoverage: 'COMPLETE', testVerdict: 'NOT_CONFIRMED', ledgerStatus: 'NOT_CONFIRMED',
        mainStatus: rawPass ? 'PASS' : 'FAIL', cleanupStatus: 'PASS', primaryFailure: rawPass ? null : { stage: 'R1_ISSUE', error: { category: 'POSTGRES_ERROR', sqlstate: 'P0001' } }, cleanupFailure: null },
    ledgers: async (_run, db) => ({ status: outcome === 'missing-ledger' ? 'NOT_CONFIRMED' : 'COMPLETE',
      observations: outcome === 'missing-ledger' ? [] : ['before', 'after'].map(stage => ({ run, stage, databaseSha256: db, migrations: expected, consoleObjects: false, passed: true })) }),
    save: async value => { if (outcome === 'save-failed') throw Error('SENSITIVE_SENTINEL'); saved = structuredClone(value); }
  });
  const projected = await projectTarget(result, run);
  check(() => assert.equal(attempts, 1));
  check(() => assert.equal(projected.passed, outcome === 'pass'));
  check(() => assert.equal(closed, true));
  check(() => assert(!JSON.stringify(projected).includes('SENSITIVE_SENTINEL')));
  if (outcome !== 'save-failed') check(() => assert.equal(saved.testAttempts, 1));
}
const runner = await readFile('scripts/run-r20-reconsent.mjs', 'utf8');
for (const text of ["const run = 'r20-'", "for (const phase of ['target'])", "'reconsent-native-fixture.mjs'", "'--pull=never'", "'--internal'", "'1000:1000'", "'435e49e'", "'scripts/r20-reconsent.synthetic.mjs'"]) check(() => assert(runner.includes(text)));
check(() => assert(!runner.includes("['candidate', 'legacy']") && !runner.includes('test-persistent-images.mjs')));
check(() => assert.equal(expected.length, 16));
check(() => assert(!expected.some(v => v.name.startsWith('014_'))));
console.log(JSON.stringify({ passed: true, checks, databaseStarted: false, formalTestAttempts: 0, originalAssertionsPreserved: true, productionAccessed: false }));
