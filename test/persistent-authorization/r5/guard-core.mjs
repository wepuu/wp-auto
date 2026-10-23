import {types} from 'node:util';
import {installGuard as installR3Guard} from '../r3/guard-core.mjs';

// This is the only intentional decision delta from R3. It never calls a resolver.
export function literalFamily(args) {
  if(args.length!==3||typeof args[0]!=='string'||typeof args[2]!=='function')return 0;
  const family=args[0]==='127.0.0.1'?4:args[0]==='::1'?6:0;if(family===0)return 0;
  const options=args[1];if(options===null||typeof options!=='object'||types.isProxy(options))return 0;
  try{
    if(Object.getPrototypeOf(options)!==Object.prototype)return 0;
    const keys=Reflect.ownKeys(options);if(keys.length!==1||keys[0]!=='all')return 0;
    const all=Object.getOwnPropertyDescriptor(options,'all');return all&&Object.hasOwn(all,'value')&&all.value===true?family:0;
  }catch{return 0;}
}

export function safeNormalizationSnapshot(value) {
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!=='ipv4|ipv6|mode|version'||value.version!==1||value.mode!=='FIXED_MEMORY_LITERAL_MAPPING')return null;
  if(!['ipv4','ipv6'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0))return null;
  return Object.freeze({version:1,mode:'FIXED_MEMORY_LITERAL_MAPPING',ipv4:value.ipv4,ipv6:value.ipv6});
}

export function installGuard(options) {
  const base=installR3Guard(options),deniedLookup=options.dns.lookup,counts={ipv4:0,ipv6:0};
  options.dns.lookup=function(...args){
    const family=literalFamily(args);
    if(family===0)return deniedLookup.apply(this,args);
    const callback=args[2],address=family===4?'127.0.0.1':'::1';counts[family===4?'ipv4':'ipv6']++;
    // Return a fresh result asynchronously. No original/system/network lookup.
    queueMicrotask(()=>callback(null,[{address,family}]));
  };
  options.syncBuiltinESMExports?.();
  return Object.freeze({snapshot:base.snapshot,normalizationSnapshot:()=>safeNormalizationSnapshot({version:1,mode:'FIXED_MEMORY_LITERAL_MAPPING',...counts})});
}
