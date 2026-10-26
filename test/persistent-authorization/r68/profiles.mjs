import assert from 'node:assert/strict';
import {candidateDatabase,retainedDatabase,legacyDatabase,pureMapping} from '../r43/profiles.mjs';
export {candidateDatabase,retainedDatabase,legacyDatabase,pureMapping};
export const nativeDatabase=Object.freeze({'scripts/multisite-r9-database.test.mjs':1});
export const legacyCompatibility=Object.freeze({'packages/account-auth/test/account-auth-postgres.test.ts':1,'apps/control-api/src/server.test.ts':24});
export function verifyDatabaseManifest(files){
 const expected=[candidateDatabase,retainedDatabase,legacyDatabase,pureMapping].flatMap(g=>Object.keys(g)).sort();
 assert.equal(expected.length,18);assert.equal(new Set(files).size,files.length);assert.deepEqual([...files].sort(),expected);
}
export function verifyUnits(actual,frozen,previous){
 assert.equal(actual.length,59);assert.equal(new Set(actual).size,59);assert.deepEqual([...actual].sort(),[...frozen].sort());
 assert.equal(previous.length,58);assert.deepEqual([...frozen].sort(),[...previous,'scripts/database-test-typecheck-core.test.mjs'].sort());
 return {unitFiles:59,databaseDirectoryFiles:18,pureMappingFiles:2,pureMappingTopLevelTests:43,legacyCompatibilityFiles:2,nativeDatabaseFiles:1};
}
