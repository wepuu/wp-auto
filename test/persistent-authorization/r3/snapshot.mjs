// Test helper metadata only. Never accept raw arguments, destinations or stacks.
export const enums = Object.freeze({
  api: ['TCP_CONNECT','TLS_CONNECT','DNS_LOOKUP','DNS_RESOLVE','DNS_REVERSE'],
  form: ['POSITIONAL','OPTIONS','NORMALIZED_ARRAY','PIPE','UNKNOWN'],
  reason: ['HOST_NOT_ALLOWED','PORT_NOT_ALLOWED','TLS_FORBIDDEN','DNS_FORBIDDEN'],
  target: ['NUMERIC_LOOPBACK','LOCALHOST_NAME','NON_LOOPBACK','PIPE','UNKNOWN'],
  caller: ['PG_CONNECTION','PG_CLIENT','DATABASE_PACKAGE','ACCOUNT_AUTH_PACKAGE','NODE_NET','NODE_DNS','SYNTHETIC_FIXTURE','UNKNOWN']
});
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...keys].sort().join('|');
const countKeys=['tcpDenied','tlsDenied','dnsDenied'];
export function safeSnapshot(value) {
  if(!exact(value,['version','counts','firstDenial'])||value.version!==1||!exact(value.counts,countKeys))return null;
  const counts={};for(const k of countKeys){if(!Number.isSafeInteger(value.counts[k])||value.counts[k]<0)return null;counts[k]=value.counts[k];}
  let firstDenial=null;
  if(value.firstDenial!==null){const e=value.firstDenial;if(!exact(e,[...Object.keys(enums),'portAllowlisted'])||typeof e.portAllowlisted!=='boolean')return null;
    firstDenial={};for(const[k,values]of Object.entries(enums)){if(!values.includes(e[k]))return null;firstDenial[k]=e[k];}firstDenial.portAllowlisted=e.portAllowlisted;Object.freeze(firstDenial);
  }
  return Object.freeze({version:1,counts:Object.freeze(counts),firstDenial});
}
export function callerCategory(stack) {
  if(typeof stack!=='string')return 'UNKNOWN';const s=stack.slice(0,8192).replaceAll('\\','/');
  for(const[needle,label]of [['pg/lib/connection.js','PG_CONNECTION'],['pg/lib/client.js','PG_CLIENT'],['packages/database/dist/','DATABASE_PACKAGE'],['packages/account-auth/dist/','ACCOUNT_AUTH_PACKAGE'],['fixture-child.mjs','SYNTHETIC_FIXTURE'],['node:net:','NODE_NET'],['node:dns:','NODE_DNS']])if(s.includes(needle))return label;
  return 'UNKNOWN';
}
