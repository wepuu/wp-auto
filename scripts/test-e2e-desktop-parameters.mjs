// Fixed-executable loopback parameter test only. Never completes an authorization.
import {createServer} from 'node:http';
import {mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {inspectExecutable,isolatedEnvironment,parseArguments,withBoundedProcess} from './test-codex-issuer-compat.mjs';
const scopes=['mcp:read','mcp:content.write','mcp:media.write','mcp:taxonomy.write','mcp:seo.write'];
let base,unexpected=0;
const server=createServer((req,res)=>{
  const p=new URL(req.url,base).pathname;
  if(p==='/mcp'){res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`});res.end();return;}
  const value=p.startsWith('/.well-known/oauth-protected-resource')?{resource:`${base}/mcp`,authorization_servers:[base],scopes_supported:scopes,bearer_methods_supported:['header']}:
    p.startsWith('/.well-known/')?{issuer:base,authorization_endpoint:`${base}/authorize`,token_endpoint:`${base}/token`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],scopes_supported:['openid','offline_access'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true}:null;
  if(!value)unexpected++;
  res.writeHead(value?200:404,{'content-type':'application/json'});res.end(JSON.stringify(value??{}));
});
async function probe(executable,home,explicit){
  const name='wepuu_e2e_r1_loopback';
  const config=[`mcp_servers.${name}.url="${base}/mcp"`,`mcp_servers.${name}.oauth_resource="${base}/mcp"`,
    `mcp_servers.${name}.oauth.client_id="wepuu-local-probe"`,`mcp_servers.${name}.oauth.callback_url="http://127.0.0.1/callback"`,
    `mcp_servers.${name}.scopes=["mcp:read"]`,'analytics.enabled=false'];
  return withBoundedProcess(executable,['app-server','--stdio',...config.flatMap(v=>['-c',v])],{cwd:home,env:isolatedEnvironment(home),timeoutMs:25000},async({child,signal})=>{
    const lines=readline.createInterface({input:child.stdout}),pending=new Map();let id=0;
    lines.on('line',line=>{try{const v=JSON.parse(line);if(pending.has(v.id)){pending.get(v.id)(v);pending.delete(v.id)}}catch{}});
    const call=(method,params)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,resolve);signal.addEventListener('abort',()=>reject(Error('TIMEOUT')),{once:true});child.stdin.write(JSON.stringify({id:key,method,params})+'\n')});
    try{
      const init=await call('initialize',{clientInfo:{name:'e2e_r1_loopback',version:'1'},capabilities:{experimentalApi:true}});if(init.error)throw Error();
      child.stdin.write('{"method":"initialized"}\n');
      const reply=await call('mcpServer/oauth/login',{name,timeoutSecs:10,...(explicit?{scopes:['mcp:read']}:{})});
      const value=reply.result?.url??reply.result?.authorizationUrl;if(reply.error||typeof value!=='string')throw Error();
      const u=new URL(value),cb=new URL(u.searchParams.get('redirect_uri'));
      if(u.origin!==base||u.pathname!=='/authorize'||u.searchParams.get('scope')!=='mcp:read'||u.searchParams.get('resource')!==`${base}/mcp`||u.searchParams.get('response_type')!=='code'||u.searchParams.get('code_challenge_method')!=='S256'||u.searchParams.get('client_id')!=='wepuu-local-probe'||cb.hostname!=='127.0.0.1'||cb.pathname!=='/callback'||!cb.port)throw Error();
      return {explicitScopesParameter:explicit,onlyReadScope:true,resourceMatches:true,codeS256:true,stableCallbackWithDynamicPort:true};
    }finally{lines.close()}
  });
}
try{
  const executable=parseArguments(process.argv.slice(2));const identity=await inspectExecutable(executable);
  if(!/^[a-f0-9]{64}$/.test(process.env.WEPUU_E2E_CODEX_SHA256??'')||identity.executableSha256!==process.env.WEPUU_E2E_CODEX_SHA256)throw Error();
  await mkdir('.tmp',{recursive:true});const home=await mkdtemp(path.resolve('.tmp/e2e-r1-loopback-'));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});base=`http://127.0.0.1:${server.address().port}`;
  const cases=[];for(const explicit of [false,true])cases.push(await probe(executable,home,explicit));
  if(unexpected!==0)throw Error();
  console.log(JSON.stringify({status:'ISOLATED_DESKTOP_PARAMETERS_PASS',passed:true,...identity,cases,advertisedResourceScopes:5,advertisedOidcScopes:true,productionOAuthStarted:false,authorizationSubmitted:false,tokenExchangePerformed:false,actualGuiAcceptance:false}));
}catch{console.log(JSON.stringify({status:'ISOLATED_DESKTOP_PARAMETERS_NOT_CONFIRMED',passed:false,rawErrorSuppressed:true,productionOAuthStarted:false}));process.exitCode=1;}
finally{if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
