import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './database-test-typecheck-core.mjs';
const result=process.argv.length===2?await run(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')):
 {passed:false,category:'UNEXPECTED_ARGUMENTS',rawOutputSuppressed:true};
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
