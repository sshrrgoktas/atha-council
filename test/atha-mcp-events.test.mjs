import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {mcpHash,mcpSeal,mcpOpen,mcpDeliver,mcpQueueEvents,mcpStatus,encrypt};').toString('base64'));
const worker=runtime.default,origin='https://atlas-council.sshrrgoktas.workers.dev',resource=origin+'/mcp';
const owner='github:101',room='room_one',now=()=>Date.now();
const oldFetch=globalThis.fetch;
let sql,db,env,access,who,callbackCalls;
class D1 {
 constructor(sqlite){this.sql=sqlite}
 prepare(query){
  let args=[];const stmt=this.sql.prepare(query);
  return {bind(...a){args=a;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {success:true,meta:{changes:Number(r.changes)}}}};
 }
 async batch(stmts){this.sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());this.sql.exec('COMMIT');return out}catch(e){this.sql.exec('ROLLBACK');throw e}}
}
async function request(path,method='GET',body,token=access,headers={}){
 const pending=[];const response=await worker.fetch(new Request(origin+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env,{waitUntil(p){pending.push(p)}});await Promise.all(pending);return response;
}
async function rpc(method,params={},token=access){const r=await request('/mcp','POST',{jsonrpc:'2.0',id:1,method,params},token);return {status:r.status,...await r.json()}}
function seedEvent(id='evt_test'){sql.prepare('INSERT OR IGNORE INTO atha_sync_events(owner_id,room_id,event_id,created_at) VALUES(?,?,?,?)').run(owner,room,id,now())}
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const subscription=(url='https://callbacks.openai.com/test')=>({name:'message.created',arguments:{room_id:room},delivery:{mode:'webhook',url,secret}});
async function subscribe(){const r=await rpc('events/subscribe',subscription());assert.ok(r.result,JSON.stringify(r));return r.result.id}
async function queue(id='evt_test',text='Atha, merhaba'){seedEvent(id);await runtime.mcpQueueEvents(env,owner,room,[id],[{content:text}])}
beforeEach(async()=>{
 sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const path of ['schema.sql','replies.sql','events.sql','mcp.sql'])sql.exec(readFileSync(new URL('../worker/atha-sync/'+path,import.meta.url),'utf8'));
 db=new D1(sql);env={ATHA_SYNC_DB:db,GITHUB_SESSION_SECRET:'test-only-session-secret-with-more-than-32-characters',ATHA_MCP_CALLBACK_ORIGINS:'https://callbacks.openai.com'};
 sql.prepare('INSERT INTO atha_sync_rooms VALUES(?,?,?,?,?)').run(owner,room,'Test',JSON.stringify({version:1,title:'Test',items:[{role:'user',name:'Sen',content:'Atha selam',speakerId:'human'},{role:'assistant',name:'Google Gemini',content:'Merhaba',speakerId:'gemini'}]}),now());
 sql.prepare('INSERT INTO atha_mcp_grants(grant_id,owner_id,room_id,client_id,expires_at) VALUES(?,?,?,?,?)').run('grant_test',owner,room,'client_test',now()+86400000);
 who=sql.prepare('SELECT * FROM atha_mcp_grants').get();access='a'.repeat(43);
 sql.prepare('INSERT INTO atha_mcp_tokens VALUES(?,?,?,?)').run(await runtime.mcpHash(access),'grant_test','access',now()+3600000);
 callbackCalls=[];
 globalThis.fetch=async(url,options={})=>{
  assert.equal(String(url),'https://callbacks.openai.com/test');assert.equal(options.redirect,'error');
  const h=options.headers,b=JSON.parse(options.body),sig=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(h['webhook-id']+'.'+h['webhook-timestamp']+'.'+options.body).digest('base64');
  assert.ok(h['webhook-signature'].split(' ').includes('v1,'+sig),'standard webhook signature must cover exact bytes');
  assert.ok(Math.abs(Number(h['webhook-timestamp'])-Date.now()/1000)<5);
  callbackCalls.push({body:b,headers:h});
  return b.type==='verification'?Response.json({challenge:b.challenge}):new Response(null,{status:204});
 };
});
afterEach(()=>{globalThis.fetch=oldFetch;sql.close()});
test('MCP requires OAuth, advertises tools/events, denies foreign origin and room',async()=>{
 const unauth=await request('/mcp','POST',{jsonrpc:'2.0',method:'initialize',id:1},null);assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource\/mcp/);
 assert.deepEqual((await rpc('initialize')).result.capabilities,{tools:{},events:{}});
 assert.equal((await rpc('tools/list')).result.tools.length,4);
 assert.equal((await rpc('events/list')).result.events[0].name,'message.created');
 assert.equal((await request('/mcp','POST',{},access,{origin:'https://evil.example'})).status,403);
 assert.ok((await rpc('tools/call',{name:'council_read',arguments:{room_id:'foreign_room'}})).error);
 const context=(await rpc('tools/call',{name:'council_read',arguments:{room_id:room}})).result.structuredContent;
 assert.equal(context.conversation.items[1].speakerId,'gemini');assert.equal(context.untrustedContent,true);
 sql.prepare('UPDATE atha_mcp_tokens SET expires_at=0').run();assert.equal((await rpc('tools/list')).status,401);
});
test('OAuth discovery has S256, exact resource, issuer and restricted DCR redirects',async()=>{
 const metadata=await (await request('/.well-known/oauth-authorization-server')).json();assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);assert.equal(metadata.issuer,origin);
 const denied=await request('/mcp/oauth/register','POST',{redirect_uris:['https://evil.example/callback']});assert.equal(denied.status,400);
 const good={redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect'],token_endpoint_auth_method:'none'};
 const one=await (await request('/mcp/oauth/register','POST',good)).json();const two=await (await request('/mcp/oauth/register','POST',good)).json();assert.equal(one.client_id,two.client_id);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_clients').get().n,1);
 assert.equal((await request('/mcp/oauth/token','POST','resource=wrong')).status,400);
});
test('OAuth code is bound to client, redirect, resource, PKCE and single use; refresh rotates',async()=>{
 const verifier='v'.repeat(50),code='test_code',redirect='https://chatgpt.com/connector_platform_oauth_redirect';
 sql.prepare('INSERT INTO atha_mcp_codes(code_hash,grant_id,challenge,redirect_uri,expires_at) VALUES(?,?,?,?,?)').run(await runtime.mcpHash(code),'grant_test',await runtime.mcpHash(verifier),redirect,now()+100000);
 const token=async(values)=>request('/mcp/oauth/token','POST',new URLSearchParams({grant_type:'authorization_code',resource,code,client_id:'client_test',redirect_uri:redirect,code_verifier:verifier,...values}).toString());
 assert.equal((await token({code_verifier:'bad'})).status,400);assert.equal((await token({client_id:'evil'})).status,400);
 const valid=await token({});assert.equal(valid.status,200);const tokens=await valid.json();assert.ok(tokens.access_token);assert.equal((await token({})).status,400);
 const refreshBody=new URLSearchParams({grant_type:'refresh_token',resource,client_id:'client_test',refresh_token:tokens.refresh_token}).toString();
 const rotated=await request('/mcp/oauth/token','POST',refreshBody);assert.equal(rotated.status,200);assert.equal((await request('/mcp/oauth/token','POST',refreshBody)).status,400);
 const revoke=new URLSearchParams({token:(await rotated.json()).access_token,client_id:'client_test'}).toString();assert.equal((await request('/mcp/oauth/revoke','POST',revoke)).status,200);assert.equal((await rpc('tools/list')).status,401);
});
test('Subscription verifies callback, encrypts secrets and persists idempotently',async()=>{
 const id=await subscribe();assert.equal((await subscribe()),id);
 const row=sql.prepare('SELECT * FROM atha_mcp_subscriptions').get();assert.equal(row.active,1);assert.notEqual(row.secret_cipher,secret);assert.equal(await runtime.mcpOpen(row.secret_cipher,env),secret);assert.equal(callbackCalls.length,2);
 const short=await rpc('events/subscribe',{...subscription(),ttlMs:120000});assert.ok(Date.parse(short.result.refreshBefore)<=now()+120001);
 assert.ok((await rpc('events/subscribe',{...subscription(),arguments:{room_id:'foreign'}})).error);
});
test('Callback SSRF and invalid signing secrets fail before any network call',async()=>{
 for(const url of ['http://callbacks.openai.com/test','https://127.0.0.1/test','https://[::1]/test','https://evil.example/test','https://callbacks.openai.com.evil.example/test','https://user@callbacks.openai.com/test','https://callbacks.openai.com:8443/test'])assert.ok((await rpc('events/subscribe',subscription(url))).error,url);
 assert.equal(callbackCalls.length,0);
 assert.ok((await rpc('events/subscribe',{...subscription(),delivery:{...subscription().delivery,secret:'whsec_eA=='}})).error);assert.equal(callbackCalls.length,0);
 env.ATHA_MCP_CALLBACK_ORIGINS='';assert.ok((await rpc('events/subscribe',subscription())).error);assert.equal(callbackCalls.length,0);
});
test('Forged callback challenge never creates an active subscription',async()=>{
 globalThis.fetch=async()=>Response.json({challenge:'forged'});
 const r=await rpc('events/subscribe',subscription());assert.equal(r.error.code,-32015);assert.equal(r.error.data.reason,'challenge_failed');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_subscriptions').get().n,0);
});
test('New user call sends one signed event immediately, no duplicate enqueue or replay',async()=>{
 await subscribe();await queue();await queue();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_delivery').get().n,1);
 await runtime.mcpDeliver(env);await runtime.mcpDeliver(env);
 assert.equal(callbackCalls.length,2);assert.equal(callbackCalls[1].body.name,'message.created');assert.equal(callbackCalls[1].headers['webhook-id'],'evt_test');assert.equal(callbackCalls[1].body.data.room_id,room);
 assert.equal(sql.prepare('SELECT state FROM atha_sync_events').get().state,'delivered');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_sync_replies').get().n,0,'delivery must not fabricate a ChatGPT response');
});
test('Mention filters, model responses, unsubscribe and paused room cannot loop or deliver',async()=>{
 await subscribe();await queue('evt_other','Gemini, merhaba');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_delivery').get().n,0);
 await queue();const p=subscription();delete p.delivery.secret;
 assert.ok((await rpc('events/unsubscribe',p)).result);assert.ok((await rpc('events/unsubscribe',p)).result);
 await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,1);assert.equal(sql.prepare('SELECT state FROM atha_mcp_delivery').get().state,'cancelled');
 await subscribe();await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,2,'old pending delivery cannot resurrect');
 await rpc('tools/call',{name:'council_participation',arguments:{room_id:room,mode:'paused'}});await queue('evt_paused');await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,2);
});
test('Unsubscribe, owner revocation, expiry and deleted room suppress pending sends',async()=>{
 for(const action of ['expire','revoke','delete']){
  if(action==='delete')sql.prepare('UPDATE atha_mcp_grants SET revoked=0').run();
  await subscribe();await queue('evt_'+action);
  if(action==='expire')sql.prepare('UPDATE atha_mcp_subscriptions SET expires_at=0').run();
  if(action==='revoke')sql.prepare('UPDATE atha_mcp_grants SET revoked=1').run();
  if(action==='delete')sql.prepare('DELETE FROM atha_sync_rooms').run();
  const count=callbackCalls.length;await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,count);
 }
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_subscriptions').get().n,0);
});
test('Transient delivery uses bounded backoff, same event ID and fresh signatures; 410/413 stop retries',async()=>{
 await subscribe();await queue();globalThis.fetch=async()=>new Response(null,{status:503});await runtime.mcpDeliver(env);
 let d=sql.prepare('SELECT * FROM atha_mcp_delivery').get();assert.equal(d.attempts,1);assert.equal(d.state,'pending');assert.ok(d.next_at>now());
 sql.prepare('UPDATE atha_mcp_delivery SET next_at=0').run();globalThis.fetch=async()=>new Response(null,{status:413});await runtime.mcpDeliver(env);d=sql.prepare('SELECT * FROM atha_mcp_delivery').get();assert.equal(d.state,'failed');assert.equal(d.attempts,2);
 await queue('evt_gone');globalThis.fetch=async()=>new Response(null,{status:410});await runtime.mcpDeliver(env);assert.equal(sql.prepare('SELECT active FROM atha_mcp_subscriptions').get().active,0);
});
test('A client-supplied reply is stored once, with ChatGPT identity, in the correct room',async()=>{
 await subscribe();await queue();await runtime.mcpDeliver(env);
 const args={room_id:room,event_id:'evt_test',content:'This text is supplied by the test client; it is not an actual model response.'};
 const call=()=>rpc('tools/call',{name:'council_reply',arguments:args});assert.equal((await call()).result.structuredContent.speakerId,'chatgpt');assert.ok((await call()).result);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_sync_replies').get().n,1);
 assert.ok((await rpc('tools/call',{name:'council_reply',arguments:{...args,content:'different'}})).error);
 assert.ok((await rpc('tools/call',{name:'council_reply',arguments:{...args,event_id:'evt_foreign'}})).error);
 const status=await runtime.mcpStatus(env,owner,room);assert.ok(status.lastSuccessfulReplyAt);assert.equal(status.automaticParticipation,true);
 const unsub=subscription();delete unsub.delivery.secret;await rpc('events/unsubscribe',unsub);assert.ok((await call()).error);
});
test('Concurrent retry workers claim each delivery once',async()=>{
 await subscribe();await queue();await Promise.all([runtime.mcpDeliver(env),runtime.mcpDeliver(env)]);assert.equal(callbackCalls.filter(c=>c.body.name==='message.created').length,1);
});
test('Literal stop cancels subscriptions without responding to the stop message',async()=>{
 await subscribe();await queue('evt_stop','Durdur');await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,1);assert.equal(sql.prepare('SELECT mode FROM atha_mcp_participation').get().mode,'paused');
});
test('Existing GitHub login authorizes exactly one synced room, rejects CSRF and foreign selection',async()=>{
 const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):original(url,options);
 const registration=await (await request('/mcp/oauth/register','POST',{redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']})).json();
 const authUrl='/mcp/oauth/authorize?'+new URLSearchParams({client_id:registration.client_id,redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',response_type:'code',resource,state:'test_state',code_challenge:'k'.repeat(43),code_challenge_method:'S256',scope:'council:read council:reply council:events'});
 const page=await request(authUrl,'GET',undefined,null,{cookie});assert.equal(page.status,200);
 const html=await page.text();assert.match(html,/Test/);const form=html.match(/name="request" value="([^"]+)"/)[1];const csrf=page.headers.get('set-cookie').split(';')[0];
 const submit=(room_id,headers={})=>request('/mcp/oauth/authorize','POST',new URLSearchParams({request:form,room_id}).toString(),null,{cookie:cookie+'; '+csrf,origin,...headers});
 assert.equal((await submit('foreign_room')).status,403);assert.equal((await submit(room,{origin:'https://evil.example'})).status,403);
 const accepted=await submit(room);assert.equal(accepted.status,302);const redirect=new URL(accepted.headers.get('location'));assert.equal(redirect.origin,'https://chatgpt.com');assert.equal(redirect.searchParams.get('state'),'test_state');assert.equal(redirect.searchParams.get('iss'),origin);assert.ok(redirect.searchParams.get('code'));
 const latest=sql.prepare('SELECT * FROM atha_mcp_grants WHERE client_id=?').get(registration.client_id);assert.equal(latest.room_id,room);assert.equal(latest.owner_id,owner);
});
test('Authorized browser sync atomically creates event and delivery; next snapshot of AI reply does not trigger again',async()=>{
 await subscribe();const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):original(url,options);
 const old=JSON.parse(sql.prepare('SELECT snapshot FROM atha_sync_rooms').get().snapshot),items=[...old.items,{role:'user',name:'Sen',content:'Atha, bir test daha',speakerId:'human'}];
 const sync=(next)=>request('/api/atha-sync/rooms/'+room,'PUT',{consent:true,title:'Test',items:next},null,{cookie,origin,'x-atha-sync':'1'});
 const r=await sync(items);assert.equal(r.status,200);assert.equal((await r.json()).queuedEvents,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_delivery').get().n,1);
 assert.equal((await (await sync(items)).json()).queuedEvents,0);
 const model=[...items,{role:'assistant',name:'Atha / ChatGPT · MCP',speakerId:'chatgpt',content:'Only a fixture.'}];assert.equal((await (await sync(model)).json()).queuedEvents,0);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_delivery').get().n,1);
 const pause=await request('/api/atha-sync/rooms/'+room+'/participation','PUT',{mode:'paused'},null,{cookie,origin,'x-atha-sync':'1'});assert.equal(pause.status,200);const count=callbackCalls.length;await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,count);assert.equal(count,2);
});
