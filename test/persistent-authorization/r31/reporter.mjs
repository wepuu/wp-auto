import {testProjection} from './results.mjs';
export default async function* reporter(source) {
 // Keep only counts: event payloads can contain exception/secret values.
 const safe = [];
 for await (const e of source) {
  if (e.type === 'test:pass' || e.type === 'test:fail') safe.push({type:e.type, data:{skip:e.data.skip === true, todo:e.data.todo === true}});
  if (e.type === 'test:summary') safe.push({type:e.type, data:{counts:e.data.counts}});
 }
 yield JSON.stringify(testProjection(safe)) + '\n';
}
