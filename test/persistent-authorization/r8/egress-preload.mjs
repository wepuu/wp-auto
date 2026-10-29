import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import dnsPromises from 'node:dns/promises';import {syncBuiltinESMExports} from 'node:module';
import {installGuard} from '../r5/guard-core.mjs';import {loadContext,readScoped} from './context.mjs';
const context=loadContext(),{allowedPorts}=JSON.parse(readScoped(context,'ports.json'));
export const guard=installGuard({net,tls,dns,dnsPromises,syncBuiltinESMExports,allowedPorts});
