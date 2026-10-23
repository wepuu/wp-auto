import {safeMessage} from '../r3/lifecycle.mjs';import {safeNormalizationSnapshot} from '../r5/guard-core.mjs';
export function safeEnvelope(m){
 if(m===null||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join('|')!=='detail|normalization|testPhase'||m.testPhase!=='r5_guard_diagnostic')return null;
 const detail=safeMessage(m.detail),normalization=safeNormalizationSnapshot(m.normalization);if(!detail||!normalization)return null;
 return {testPhase:'r5_guard_diagnostic',detail,normalization};
}
export function envelope(detail,guard){return safeEnvelope({testPhase:'r5_guard_diagnostic',detail,normalization:guard.normalizationSnapshot()});}
