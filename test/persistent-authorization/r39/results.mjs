// R39 runs the frozen 19 Code tests and 24 RT find tests. No names or bodies.
export function testsPass(r){return r?.summaryObserved===true&&r.passed===43&&r.failed===0&&r.skipped===0&&r.todo===0&&
 r.summaryCounts?.tests===43&&r.summaryCounts.passed===43&&['failed','cancelled','skipped','todo'].every(k=>r.summaryCounts[k]===0);}
