// Terminal fake transports: no node:net/tls/dns imports, sockets or listeners.
export function fakeApis(){let terminalCalls=0;class Socket{connect(){terminalCalls++;return this;}}return {net:{Socket},tls:{connect(){terminalCalls++;return 'terminal';}},dns:{},dnsPromises:{},terminalCalls:()=>terminalCalls};}
