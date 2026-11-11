import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {mcpHash,mcpSeal,mcpOpen,mcpDeliver,mcpQueueEvents,mcpStatus,encrypt,beginCouncilDialogue,finishCouncilDialogue,councilShortReply,rememberCouncilDialogue,runCouncilDialogue,resumeCouncilDialogues};').toString('base64'));
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
 for(const path of ['schema.sql','replies.sql','events.sql','mcp.sql','mcp-diagnostics.sql','mcp-account.sql','dialogue.sql'])sql.exec(readFileSync(new URL('../worker/atha-sync/'+path,import.meta.url),'utf8'));
 db=new D1(sql);env={ATHA_SYNC_DB:db,GITHUB_SESSION_SECRET:'test-only-session-secret-with-more-than-32-characters',ATHA_MCP_CALLBACK_ORIGINS:'https://callbacks.openai.com'};
 sql.prepare('INSERT INTO atha_sync_rooms VALUES(?,?,?,?,?)').run(owner,room,'Test',JSON.stringify({version:1,title:'Test',items:[{role:'user',name:'Sen',content:'Atha selam',speakerId:'human'},{role:'assistant',name:'Google Gemini',content:'Merhaba',speakerId:'gemini'}]}),now());
 sql.prepare('INSERT INTO atha_mcp_grants(grant_id,owner_id,room_id,client_id,expires_at) VALUES(?,?,?,?,?)').run('grant_test',owner,room,'client_test',now()+86400000);
 who=sql.prepare('SELECT * FROM atha_mcp_grants').get();access='a'.repeat(43);
 sql.prepare('INSERT INTO atha_mcp_tokens VALUES(?,?,?,?)').run(await runtime.mcpHash(access),'grant_test','access',now()+3600000);
 callbackCalls=[];
 globalThis.fetch=async(url,options={})=>{
  assert.equal(String(url),'https://callbacks.openai.com/test');assert.equal(options.redirect,'manual');
  const h=options.headers,b=JSON.parse(options.body),sig=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(h['webhook-id']+'.'+h['webhook-timestamp']+'.'+options.body).digest('base64');
  assert.ok(h['webhook-signature'].split(' ').includes('v1,'+sig),'standard webhook signature must cover exact bytes');
  assert.ok(Math.abs(Number(h['webhook-timestamp'])-Date.now()/1000)<5);
  callbackCalls.push({body:b,headers:h});
  return b.type==='verification'?Response.json({challenge:b.challenge}):new Response(null,{status:204});
 };
});
afterEach(()=>{globalThis.fetch=oldFetch;sql.close()});
async function dialogueSetup(){
 await subscribe();
 const providerFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):providerFetch(url,options);
 const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const req=new Request(origin+'/api/google/chat',{headers:{cookie}});
 sql.prepare('INSERT INTO atha_mcp_participation VALUES(?,?,?,?)').run(owner,room,'dialogue',now()-1000);
 sql.prepare('INSERT INTO atha_sync_replies VALUES(?,?,?,?,?)').run(owner,room,'mcp_evt_current','Gemini, ne düşünüyorsun?',now());
 return {req,body:{dialogue:{room_id:room,parent_reply_id:'mcp_evt_current'}}};
}
test('Controlled real-model dialogue is owner-scoped, current-parent-only and idempotent',async()=>{
 const {req,body}=await dialogueSetup();
 await assert.rejects(runtime.beginCouncilDialogue(new Request(origin),env,body),/GitHub/);
 await assert.rejects(runtime.beginCouncilDialogue(req,env,{dialogue:{room_id:'foreign',parent_reply_id:'mcp_evt_current'}}),/inactive/);
 await assert.rejects(runtime.beginCouncilDialogue(req,env,{dialogue:{room_id:room,parent_reply_id:'mcp_evt_old'}}),/current/);
 const turn=await runtime.beginCouncilDialogue(req,env,body);
 await assert.rejects(runtime.beginCouncilDialogue(req,env,body),/claimed/);
 assert.equal(callbackCalls.length,1,'reservation must not call a model or webhook');
 assert.equal(await runtime.finishCouncilDialogue(env,turn,'Bence kısa yanıtlar iyi. Sıra sende.',null),true);
 assert.equal(await runtime.finishCouncilDialogue(env,turn,'Tekrar.',null),false);
 await runtime.mcpDeliver(env);
 assert.equal(callbackCalls.length,2);
 assert.equal(callbackCalls[1].body.data.source,'controlled-dialogue');
 const read=await rpc('tools/call',{name:'council_read',arguments:{room_id:room}});
 assert.equal(read.result.structuredContent.events[0].controlledDialogue.speakerId,'gemini');
});
test('Dialogue stops after three Gemini turns, expires and suppresses replies after pause',async()=>{
 const {req,body}=await dialogueSetup();
 for(let i=0;i<3;i++){
  const parent='mcp_evt_round_'+i;
  sql.prepare('INSERT INTO atha_sync_replies VALUES(?,?,?,?,?)').run(owner,room,parent,'Gerçek Atha yanıtı',now()+i+1);
  const turn=await runtime.beginCouncilDialogue(req,env,{dialogue:{room_id:room,parent_reply_id:parent}});
  await runtime.finishCouncilDialogue(env,turn,'Kısa bir Gemini yanıtı '+i+'.',null);
 }
 sql.prepare('INSERT INTO atha_sync_replies VALUES(?,?,?,?,?)').run(owner,room,'mcp_evt_fourth','Sıradaki',now()+10);
 await assert.rejects(runtime.beginCouncilDialogue(req,env,{dialogue:{room_id:room,parent_reply_id:'mcp_evt_fourth'}}),/limit/);
 sql.prepare('UPDATE atha_mcp_participation SET updated_at=?').run(now()-21*60000);
 await assert.rejects(runtime.beginCouncilDialogue(req,env,body),/expired/);
});
test('An intervening user turn or stop cancels a reserved dialogue; short text stays bounded',async()=>{
 const {req,body}=await dialogueSetup();const turn=await runtime.beginCouncilDialogue(req,env,body);
 sql.prepare('UPDATE atha_mcp_participation SET updated_at=updated_at+1').run();
 await assert.rejects(runtime.finishCouncilDialogue(env,turn,'Geç kalan yanıt.',null),/superseded/);
 sql.prepare("UPDATE atha_mcp_participation SET mode='paused'").run();
 await assert.rejects(runtime.finishCouncilDialogue(env,turn,'Durduktan sonra.',null),/stopped/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM atha_mcp_delivery').get().n,0);
 assert.equal(runtime.councilShortReply('Bir. İki! Üç?'),'Bir. İki!');
 assert.ok(runtime.councilShortReply('Kelime '.repeat(150)).length<=500);
});
test('Manual Atha calls are authenticated, room-scoped, CSRF-protected and deduplicated',async()=>{
 const {req}=await dialogueSetup();
 const headers={cookie:req.headers.get('cookie'),origin,'x-atha-sync':'1'};
 const body={request_id:'request_once_1234567890'};
 const path='/api/atha-sync/rooms/'+room+'/call';
 assert.equal((await request(path,'PUT',body,null)).status,403);
 assert.equal((await request(path,'PUT',body,null,{...headers,origin:'https://foreign.example'})).status,403);
 assert.equal((await request('/api/atha-sync/rooms/foreign/call','PUT',body,null,headers)).status,409);
 const first=await request(path,'PUT',body,null,headers);assert.equal(first.status,200);const event=await first.json();
 assert.equal((await (await request(path,'PUT',body,null,headers)).json()).event_id,event.event_id);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM atha_sync_events').get().n,1);
 const read=await rpc('tools/call',{name:'council_read',arguments:{room_id:room}});
 assert.equal(read.result.structuredContent.events[0].manualRequest.kind,'call');
 assert.equal(callbackCalls.filter(c=>c.body.name==='message.created').length,1);
});
test('Retry creates a fresh real-model event for the latest reply; it never overwrites content',async()=>{
 const {req}=await dialogueSetup();const headers={cookie:req.headers.get('cookie'),origin,'x-atha-sync':'1'};
 const path='/api/atha-sync/rooms/'+room+'/retry',body={request_id:'retry_request_1234567890',parent_reply_id:'mcp_evt_current'};
 assert.equal((await request(path,'PUT',{...body,parent_reply_id:'mcp_evt_old'},null,headers)).status,409);
 const r=await request(path,'PUT',body,null,headers);assert.equal(r.status,200);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM atha_sync_replies').get().n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM atha_sync_events').get().n,1);
 sql.prepare("UPDATE atha_mcp_participation SET mode='paused'").run();
 assert.equal((await request(path,'PUT',{...body,request_id:'different_retry_1234567890'},null,headers)).status,409);
});
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
 // no-referrer makes Chrome form navigations send Origin:null, which the strict CSRF guard must reject.
 assert.equal(page.headers.get('referrer-policy'),'same-origin');
 assert.match(page.headers.get('content-security-policy'),/form-action 'self' https:\/\/chatgpt\.com\/connector_platform_oauth_redirect https:\/\/chatgpt\.com\/connector\/oauth\//);
 const html=await page.text();assert.match(html,/Eşitlemesi açık tüm sohbetlerime izin ver/);assert.doesNotMatch(html,/<select/);const form=html.match(/name="request" value="([^"]+)"/)[1];const csrf=page.headers.get('set-cookie').split(';')[0];
 const submit=(room_id,headers={})=>request('/mcp/oauth/authorize','POST',new URLSearchParams({request:form,room_id}).toString(),null,{cookie:cookie+'; '+csrf,origin,...headers});
 assert.equal((await submit('foreign_room')).status,403);assert.equal((await submit(room,{origin:'https://evil.example'})).status,403);
 const accepted=await submit(room);assert.equal(accepted.status,302);const redirect=new URL(accepted.headers.get('location'));assert.equal(redirect.origin,'https://chatgpt.com');assert.equal(redirect.searchParams.get('state'),'test_state');assert.equal(redirect.searchParams.get('iss'),origin);assert.ok(redirect.searchParams.get('code'));
 const latest=sql.prepare('SELECT * FROM atha_mcp_grants WHERE client_id=?').get(registration.client_id);assert.equal(latest.room_id,room);assert.equal(latest.owner_id,owner);
 const accountAccepted=await request('/mcp/oauth/authorize','POST',new URLSearchParams({request:form,account_scope:'all'}).toString(),null,{cookie:cookie+'; '+csrf,origin});assert.equal(accountAccepted.status,302);assert.equal(sql.prepare('SELECT enabled FROM atha_mcp_account_access WHERE owner_id=?').get(owner).enabled,1);
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
test('Event diagnostics distinguish an arriving subscription without storing callback secrets or paths',async()=>{
 env.ATHA_MCP_CALLBACK_ORIGINS='';
 const r=await rpc('events/subscribe',subscription('https://callbacks.openai.com/private-path?secret=never-store'));
 assert.equal(r.error.data.reason,'origin_not_approved');
 const diagnostic=sql.prepare('SELECT * FROM atha_mcp_event_diagnostics').get();
 assert.equal(diagnostic.callback_origin,'https://callbacks.openai.com');assert.equal(diagnostic.reason,'origin_not_approved');assert.equal(diagnostic.attempt_count,1);
 const text=JSON.stringify(diagnostic);assert.doesNotMatch(text,/private-path|never-store|whsec_/);
 assert.equal((await runtime.mcpStatus(env,owner,room)).eventDiagnostic.callback_origin,'https://callbacks.openai.com');
 sql.prepare('DELETE FROM atha_sync_rooms').run();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_event_diagnostics').get().n,0);
});

test('Worker-compatible manual mode refuses callback redirects without following them',async()=>{
 let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://evil.example/steal'}})};
 const r=await rpc('events/subscribe',subscription());assert.equal(r.error.data.reason,'challenge_failed');assert.equal(calls,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_subscriptions').get().n,0);
});
test('Owner-only live probe uses the real sync/event path, labels tests, rejects CSRF and deduplicates',async()=>{
 await subscribe();const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):original(url,options);
 assert.equal((await request('/mcp/check?room_id='+room,'GET',undefined,null)).status,401);
 assert.equal((await request('/mcp/check?room_id=foreign_room','GET',undefined,null,{cookie})).status,404);
 const page=await request('/mcp/check?room_id='+room,'GET',undefined,null,{cookie});assert.equal(page.status,200);const html=await page.text();assert.match(html,/Test 1 mesajını gönder/);
 const proof=html.match(/name="proof" value="([^"]+)"/)[1],csrf=page.headers.get('set-cookie').split(';')[0];
 const send=(site=origin)=>request('/mcp/check','POST',new URLSearchParams({proof,probe:'1'}).toString(),null,{cookie:cookie+'; '+csrf,origin:site});
 assert.equal((await send('https://evil.example')).status,403);assert.equal((await send()).status,303);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_sync_events').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_mcp_delivery').get().n,1);
 const snapshot=JSON.parse(sql.prepare('SELECT snapshot FROM atha_sync_rooms').get().snapshot);assert.match(snapshot.items.at(-1).name,/kullanıcı onaylı/);assert.equal(snapshot.items[1].speakerId,'gemini');
 assert.equal((await send()).status,303);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM atha_sync_events').get().n,1);
});

function addRoom(id,roomOwner=owner){sql.prepare('INSERT INTO atha_sync_rooms VALUES(?,?,?,?,?)').run(roomOwner,id,'Selam',JSON.stringify({version:1,title:'Selam',items:[{role:'user',name:'Sen',content:'Merhaba',speakerId:'human'}]}),now())}
async function accountSubscription(){
 sql.prepare('INSERT INTO atha_mcp_account_access VALUES(?,1,?)').run(owner,now());
 const params={...subscription(),arguments:{room_id:'all'}};
 const response=await rpc('events/subscribe',params);assert.ok(response.result,JSON.stringify(response));return {params,id:response.result.id};
}
test('Account scope requires explicit permission and never reads another owner or an unsynced room',async()=>{
 addRoom('room_two');addRoom('room_foreign','github:202');
 assert.ok((await rpc('events/subscribe',{...subscription(),arguments:{room_id:'all'}})).error);
 assert.ok((await rpc('tools/call',{name:'council_read',arguments:{room_id:'room_two'}})).error);
 await accountSubscription();
 const read=await rpc('tools/call',{name:'council_read',arguments:{room_id:'room_two'}});assert.equal(read.result.structuredContent.room_id,'room_two');
 for(const id of ['room_foreign','unsynced_room'])assert.ok((await rpc('tools/call',{name:'council_read',arguments:{room_id:id}})).error);
 const status=await rpc('tools/call',{name:'council_connection_status',arguments:{room_id:'room_two'}});assert.equal(status.result.structuredContent.automaticParticipation,true);assert.equal(status.result.structuredContent.accountScope,true);
});
test('One verified account webhook delivers future synced rooms and saves only that event room reply',async()=>{
 await accountSubscription();addRoom('room_future');
 sql.prepare('INSERT INTO atha_sync_events(owner_id,room_id,event_id,created_at) VALUES(?,?,?,?)').run(owner,'room_future','evt_future',now());
 await runtime.mcpQueueEvents(env,owner,'room_future',['evt_future'],[{role:'user',content:'Merhaba'}]);await runtime.mcpDeliver(env);
 assert.equal(callbackCalls.length,2);assert.equal(callbackCalls[1].body.data.room_id,'room_future');assert.equal(sql.prepare('SELECT mode FROM atha_mcp_participation WHERE room_id=?').get('room_future').mode,'dialogue');
 const post=()=>rpc('tools/call',{name:'council_reply',arguments:{room_id:'room_future',event_id:'evt_future',content:'Merhaba.'}});
 assert.equal((await post()).result.structuredContent.reply_id,'mcp_evt_future');await post();assert.equal(sql.prepare('SELECT count(*) n FROM atha_sync_replies WHERE room_id=?').get('room_future').n,1);
 assert.ok((await rpc('tools/call',{name:'council_reply',arguments:{room_id:room,event_id:'evt_future',content:'Yanlış oda'}})).error);
});
test('Pausing one room keeps other account rooms subscribed, supports resume and does not replay',async()=>{
 const {id}=await accountSubscription();addRoom('room_two');
 await rpc('tools/call',{name:'council_participation',arguments:{room_id:room,mode:'paused'}});
 assert.equal(sql.prepare('SELECT active FROM atha_mcp_subscriptions WHERE subscription_id=?').get(id).active,1);
 await queue('evt_paused_one');await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,1);
 sql.prepare('INSERT INTO atha_sync_events(owner_id,room_id,event_id,created_at) VALUES(?,?,?,?)').run(owner,'room_two','evt_second_room',now());
 await runtime.mcpQueueEvents(env,owner,'room_two',['evt_second_room'],[{role:'user',content:'Merhaba'}]);await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,2);
 const resumed=await rpc('tools/call',{name:'council_participation',arguments:{room_id:room,mode:'all_user'}});assert.ok(resumed.result);await queue('evt_resumed','Merhaba');await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,3);
});
test('All-room unsubscribe and revoked account access cancel deliveries and forbid cross-room reads',async()=>{
 const {params}=await accountSubscription();addRoom('room_two');
 assert.ok((await rpc('events/unsubscribe',params)).result);await queue('evt_after_unsubscribe');await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,1);
 await rpc('events/subscribe',params);
 sql.prepare('INSERT INTO atha_sync_events(owner_id,room_id,event_id,created_at) VALUES(?,?,?,?)').run(owner,'room_two','evt_before_revoke',now());
 await runtime.mcpQueueEvents(env,owner,'room_two',['evt_before_revoke'],[{role:'user',content:'Merhaba'}]);
 sql.prepare('UPDATE atha_mcp_account_access SET enabled=0').run();await runtime.mcpDeliver(env);assert.equal(callbackCalls.length,2);
 assert.equal(sql.prepare('SELECT state FROM atha_mcp_delivery WHERE event_id=?').get('evt_before_revoke').state,'cancelled');assert.ok((await rpc('tools/call',{name:'council_read',arguments:{room_id:'room_two'}})).error);
});
test('Deleting the internal reference room preserves the account link for other synced rooms',async()=>{
 const {id}=await accountSubscription();addRoom('room_remaining');
 const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):original(url,options);
 const deleted=await request('/api/atha-sync/rooms/'+room,'DELETE',undefined,null,{cookie,origin,'x-atha-sync':'1'});assert.equal(deleted.status,200);
 assert.equal(sql.prepare('SELECT room_id FROM atha_mcp_grants WHERE grant_id=?').get('grant_test').room_id,'room_remaining');
 assert.equal(sql.prepare('SELECT room_id FROM atha_mcp_subscriptions WHERE subscription_id=?').get(id).room_id,'room_remaining');
 const status=await rpc('tools/call',{name:'council_connection_status',arguments:{room_id:'room_remaining'}});assert.equal(status.result.structuredContent.automaticParticipation,true);
 assert.equal(sql.prepare('SELECT room_id FROM atha_sync_rooms WHERE room_id=?').get(room),undefined);
});
test('Account status never calls an unsynced local chat automatically connected',async()=>{
 await accountSubscription();
 const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.github.com/user'?Response.json({id:101}):original(url,options);
 const status=await request('/api/atha-sync/status?room_id=local_only','GET',undefined,null,{cookie});const data=await status.json();
 assert.equal(data.accountScope,true);assert.equal(data.connection.oauthConnected,true);assert.equal(data.connection.eventSubscriptionActive,true);assert.equal(data.connection.privateCloudSync,false);assert.equal(data.connection.automaticParticipation,false);
 assert.equal(sql.prepare('SELECT room_id FROM atha_sync_rooms WHERE room_id=?').get('local_only'),undefined);
});

async function serverDialogueSetup(){
 const {req}=await dialogueSetup();env.GOOGLE_CLIENT_ID='test';env.GOOGLE_CLIENT_SECRET='provider-test-secret-with-more-than-32-characters';
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.GOOGLE_CLIENT_SECRET)),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({access_token:'provider-test-access',exp:now()+3600000})));
 const google=Buffer.concat([Buffer.from(iv),Buffer.from(encrypted)]).toString('base64url');
 const request=new Request(origin+'/api/atha-sync/rooms/'+room,{headers:{cookie:req.headers.get('cookie')+'; atlas_google='+google}});
 const baseFetch=globalThis.fetch;let generations=0,unavailable=false;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('generativelanguage.googleapis.com')){
   if(unavailable)return new Response('unavailable',{status:503});
   if(String(url).includes('pageSize'))return Response.json({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]});
   generations++;return Response.json({candidates:[{content:{parts:[{text:'Gemini gerçek sağlayıcı turu '+generations+'.'}]}}]});
  }
  return baseFetch(url,options);
 };
 assert.equal(await runtime.rememberCouncilDialogue(request,env,owner,room),true);
 return {request,generations:()=>generations,setUnavailable:v=>{unavailable=v}};
}
test('Server hands Atha to Gemini and back for multiple turns without any browser polling',async()=>{
 const h=await serverDialogueSetup();
 // First real provider call is initiated by the server, with no UI involved.
 await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),1);
 let event=callbackCalls.at(-1).body.data;assert.equal(event.source,'controlled-dialogue');
 for(let n=0;n<2;n++){
  // A real authenticated ChatGPT client posts its own reply; that alone starts Gemini.
  const reply=await rpc('tools/call',{name:'council_reply',arguments:{room_id:room,event_id:event.event_id,content:'Atha yanıtı '+n}});
  assert.ok(reply.result,JSON.stringify(reply));assert.equal(h.generations(),n+2);
  event=callbackCalls.at(-1).body.data;
 }
 await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),3,'same parent is never called twice');
 const ciphertext=sql.prepare('SELECT cookie_cipher FROM atha_dialogue_sessions').get().cookie_cipher;
 assert.doesNotMatch(ciphertext,/provider-test-access|gho_test/);
 // Owner-scoped polling recovers both identities in chronological order.
 const response=await request('/api/atha-sync/rooms/'+room+'/replies','GET',undefined,null,{cookie:h.request.headers.get('cookie')});
 const data=await response.json();assert.equal(data.serverDialogue,true);assert.equal(data.replies.filter(r=>r.speakerId==='gemini').length,3);
 assert.ok(data.replies.every((r,i)=>!i||r.createdAt>=data.replies[i-1].createdAt));
});
test('Failed provider calls retry without a user message and concurrent runners never duplicate',async()=>{
 const h=await serverDialogueSetup();h.setUnavailable(true);
 await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),0);
 assert.equal(sql.prepare('SELECT attempts FROM atha_dialogue_sessions').get().attempts,1);
 assert.equal(JSON.parse(sql.prepare("SELECT message_excerpt FROM atha_sync_events WHERE event_id LIKE 'evt_dlg_%'").get().message_excerpt).phase,'failed');
 h.setUnavailable(false);sql.prepare('UPDATE atha_dialogue_sessions SET next_at=0').run();
 await Promise.all([runtime.runCouncilDialogue(env,owner,room),runtime.runCouncilDialogue(env,owner,room)]);
 assert.equal(h.generations(),1);assert.equal(callbackCalls.length,2);
});
test('Server dialogue respects pause, revoked subscriptions and expired authorization',async()=>{
 const h=await serverDialogueSetup();
 sql.prepare("UPDATE atha_mcp_participation SET mode='paused'").run();await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),0);
 sql.prepare("UPDATE atha_mcp_participation SET mode='dialogue'").run();sql.prepare('UPDATE atha_mcp_grants SET revoked=1').run();await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),0);
 sql.prepare('UPDATE atha_mcp_grants SET revoked=0').run();sql.prepare('UPDATE atha_dialogue_sessions SET expires_at=0').run();await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),0);
});
test('Repeated Gemini output stops the automatic chain instead of sending another event',async()=>{
 const {req,body}=await dialogueSetup();let turn=await runtime.beginCouncilDialogue(req,env,body);
 await runtime.finishCouncilDialogue(env,turn,'Aynı yanıt.',null);
 sql.prepare('INSERT INTO atha_sync_replies VALUES(?,?,?,?,?)').run(owner,room,'mcp_evt_followup','Yeni Atha yanıtı.',now()+1);
 turn=await runtime.beginCouncilDialogue(req,env,{dialogue:{room_id:room,parent_reply_id:'mcp_evt_followup'}});
 await assert.rejects(runtime.finishCouncilDialogue(env,turn,'Aynı yanıt.',null),/Repeating/);
 assert.equal(sql.prepare('SELECT count(*) n FROM atha_mcp_delivery').get().n,1);
});
test('Server cannot reuse another room provider session or execute an expired turn',async()=>{
 const h=await serverDialogueSetup();
 const wrong=await runtime.mcpSeal(JSON.stringify({owner:'github:999',room,google:'private',github:'private'}),env);
 sql.prepare('UPDATE atha_dialogue_sessions SET cookie_cipher=?').run(wrong);
 await runtime.runCouncilDialogue(env,owner,room);assert.equal(h.generations(),0);
 assert.equal(sql.prepare('SELECT last_error FROM atha_dialogue_sessions').get().last_error,'SESSION_SCOPE');
});
test('First live user send in a new synced room triggers Atha once; history-only sync does not',async()=>{
 await accountSubscription();
 const cookie='atlas_copilot_session='+await runtime.encrypt('gho_test_token_1234567890',env.GITHUB_SESSION_SECRET);
 const base=globalThis.fetch;globalThis.fetch=async(u,o)=>String(u)==='https://api.github.com/user'?Response.json({id:101}):base(u,o);
 const headers={cookie,origin,'x-atha-sync':'1'},newRoom='first_live_room';
 const body={consent:true,title:'Fresh',items:[{role:'user',name:'Sen',speakerId:'human',content:'Selam'}],live_turn:{request_id:'first_send_1234567890',content:'Selam'}};
 let r=await request('/api/atha-sync/rooms/'+newRoom,'PUT',body,null,headers);assert.equal(r.status,200);assert.equal(callbackCalls.length,2);
 await request('/api/atha-sync/rooms/'+newRoom,'PUT',body,null,headers);assert.equal(callbackCalls.length,2);
 delete body.live_turn;await request('/api/atha-sync/rooms/history_import_room','PUT',body,null,headers);assert.equal(callbackCalls.length,2);
});
