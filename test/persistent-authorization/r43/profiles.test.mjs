import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { candidateDatabase, retainedDatabase, legacyDatabase, pureMapping, verifyProfile } from './profiles.mjs';
import { allPass, requiredStages } from './results.mjs';
const units = JSON.parse(await readFile(new URL('./unit-manifest.json', import.meta.url)));
const frozenUnits = JSON.parse(await readFile(new URL('../r10/unit-manifest.json', import.meta.url)));
// Repository paths are resolved independently of execution cwd.
const actualDb = (await readdir(new URL('../../../packages/database/test/', import.meta.url))).filter(f => f.endsWith('.test.ts'));
const input = { units, frozenUnits, databaseFiles: actualDb };
let checks = 0;
assert.equal(verifyProfile(input).mappingTests, 43); checks++;
for (const mutate of [
  v => ({...v, units:v.units.slice(1)}),
  v => ({...v, units:[...v.units, 'unknown.test.ts']}),
  v => ({...v, units:[...v.units.slice(1),v.units[1]]}),
  v => ({...v, databaseFiles:v.databaseFiles.slice(1)}),
  v => ({...v, databaseFiles:[...v.databaseFiles,'unknown.test.ts']}),
  v => ({...v, databaseFiles:[...v.databaseFiles.slice(1),v.databaseFiles[1]]}),
  v => ({...v, groups:[candidateDatabase,retainedDatabase,legacyDatabase,{...pureMapping,'refresh-find-mapping.test.ts':23}]}),
  v => ({...v, groups:[{...candidateDatabase,...pureMapping},retainedDatabase,legacyDatabase,{}]}),
  v => ({...v, skips:[]}),
  v => ({...v, frozenUnits:v.frozenUnits.slice(1)})
]) { assert.throws(() => verifyProfile(mutate(input))); checks++; }
const actual = [];
for (const kind of ['packages','apps']) for (const name of await readdir(new URL('../../../'+kind+'/',import.meta.url))) {
 const dir = kind+'/'+name+'/'+(kind==='packages'?'test':'src');
 let entries; try { entries=await readdir(new URL('../../../'+dir+'/',import.meta.url)); } catch { continue; }
 actual.push(...entries.filter(f=>f.endsWith('.test.ts')).map(f=>dir+'/'+f));
}
actual.push(...(await readdir(new URL('../../../scripts/',import.meta.url))).filter(f=>f.endsWith('.test.mjs')).map(f=>'scripts/'+f));
assert.deepEqual(actual.sort(),units); checks++;
const complete = requiredStages.map(stage => ({stage,passed:true}));
assert(allPass(complete)); checks++;
for (const name of requiredStages) {
 assert.equal(allPass(complete.map(s => s.stage === name ? {...s,passed:false} : s)),false); checks++;
 assert.equal(allPass(complete.filter(s => s.stage !== name)),false); checks++;
}
assert.equal(allPass([...complete,complete[0]]),false); checks++;
console.log(JSON.stringify({passed:true,checks,profile:verifyProfile(input),servicesStarted:false}));
