import assert from 'node:assert/strict';
import { candidateDatabase, retainedDatabase, legacyDatabase, offlineSkipFiles } from '../r10/profiles.mjs';
export { candidateDatabase, retainedDatabase, legacyDatabase };
export const pureMapping = Object.freeze({ 'authorization-consume-mapping.test.ts': 19, 'refresh-find-mapping.test.ts': 24 });
export function verifyProfile({ units, frozenUnits, databaseFiles, groups = [candidateDatabase, retainedDatabase, legacyDatabase, pureMapping], skips = offlineSkipFiles }) {
  assert.equal(units.length, 58, 'UNIT_COUNT');
  assert.equal(new Set(units).size, units.length, 'UNIT_DUPLICATE');
  const additions = Object.keys(pureMapping).map(f => 'packages/database/test/' + f);
  assert.deepEqual([...units].sort(), [...frozenUnits, ...additions].sort(), 'UNIT_MANIFEST_DRIFT');
  assert.deepEqual(groups, [candidateDatabase, retainedDatabase, legacyDatabase, pureMapping], 'PROFILE_DRIFT');
  const names = groups.flatMap(g => Object.keys(g));
  assert.equal(names.length, 18, 'DATABASE_COUNT');
  assert.equal(new Set(names).size, names.length, 'DATABASE_DUPLICATE');
  assert.deepEqual([...databaseFiles].sort(), [...names].sort(), 'DATABASE_MANIFEST_DRIFT');
  assert.deepEqual(skips, offlineSkipFiles, 'SKIP_DRIFT');
  assert(Object.keys(pureMapping).every(f => !skips.includes(f)), 'PURE_MAPPING_SKIPPED');
  return { passed: true, units: 58, candidateDatabase: 13, retainedDatabase: 2, legacyDatabase: 1, pureMapping: 2, mappingTests: 43 };
}
