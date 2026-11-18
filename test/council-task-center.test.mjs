// Atha Council Task Centre: real owner-checked persistence and signed PC worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';

const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+Buffer.from(source+
 '\nexport {handleCouncilTasks,handleOpenCodeAgent,COUNCIL_HUMAN_TURNS_ONLY};').toString('base64'));
const origin='https://atlas-council.sshrrgoktas.workers.dev';
const owner='github:101',room='room_task_one';
const cfg={GITHUB_SESSION_SECRET:'test-secret-which-is-more-than-thirty-two-chars-long'};
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE atha_sync_rooms(owner_id TEXT,room_id TEXT,title TEXT,snapshot TEXT,updated_at INTEGER,PRIMARY KEY(owner_id,room_id));');
sqlite.exec('CREATE TABLE atha_opencode_agents(agent_id TEXT,owner_id TEXT,room_id TEXT,public_key TEXT,created_at INTEGER,expires_at INTEGER,enabled INTEGER);');
sqlite.exec('CREATE TABLE atha_mcp_participation(owner_id TEXT,room_id TEXT,mode TEXT);');
sqlite.exec(readFileSync(new URL('../worker/atha-sync/council-tasks.sql',import.meta.url),'utf8'));
sqlite.prepare('INSERT INTO atha_sync_rooms VALUES(?,?,?,?,?)').run(owner,room,'Test room',JSON.stringify({items:[]}),Date.now());
const pair=generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64url');
const agent_id='ocag_'+('b'.repeat(32));
sqlite.prepare('INSERT INTO atha_opencode_agents VALUES(?,?,?,?,?,?,?)').run(agent_id,owner,room,publicKey,Date.now()-60000,Date.now()+86400000,1);
function d1(){
 return {prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {
  first:async()=>statement.get(...args)||null,
  all:async()=>({results:statement.all(...args)}),
  run:async()=>({meta:{changes:statement.run(...args).changes}})
 }}}}};
}
const env={...cfg,ATHA_SYNC_DB:d1()};
async function userCookie(){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const k=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cfg.GITHUB_SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt']);
 const crypt=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode('gho_test_owner_token_abcdefghijklmnopqrstuvwxyz')));
 return 'atlas_copilot_session='+Buffer.from(iv).toString('base64url')+'.'+Buffer.from(crypt).toString('base64url');
}
async function user(method,path,body=null,auth=true,from=origin){
 const headers={};if(auth)headers.cookie=await userCookie();
 if(method!=='GET'){headers.origin=from;headers['x-atha-sync']='1';headers['content-type']='application/json'}
 const r=new Request(origin+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 const previous=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.equal(String(url),'https://api.github.com/user');return Response.json({id:101,login:'owner'})};
 try{return await runtime.handleCouncilTasks(r,env)}
 finally{globalThis.fetch=previous}
}
function agent(method,verb,body){
 const path='/api/atha-opencode/'+verb,raw=JSON.stringify(body),stamp=String(Date.now());
 const digest=createHash('sha256').update(raw).digest('base64url');
 const signature=sign(null,Buffer.from([method,path,stamp,digest].join('\n')),pair.privateKey).toString('base64url');
 return runtime.handleOpenCodeAgent(new Request(origin+path,{method,headers:{
  'content-type':'application/json','x-atha-agent-id':agent_id,'x-atha-agent-ts':stamp,'x-atha-agent-sig':signature
 },body:raw}),env);
}
const id='ct_2d8f670e-1198-4515-8450-1a253356a104';
test('draft requires owner login and same-origin and cannot execute on creation',async()=>{
 const payload={id,roomId:room,request:'Improve the Council response checks and record tests',assignee:'opencode',repo:'sshrrgoktas/atha-council'};
 assert.equal((await user('POST','/api/atha-tasks',payload,false)).status,401);
 assert.equal((await user('POST','/api/atha-tasks',payload,true,'https://bad.example')).status,403);
 const response=await user('POST','/api/atha-tasks',payload);
 assert.equal(response.status,200);
 assert.equal((await response.json()).status,'draft');
 assert.equal((await user('POST','/api/atha-tasks',{...payload,repo:'other/repo'})).status,400);
});
test('no Council OpenCode chat poll runs inference or gets an event',async()=>{
 const r=await agent('POST','poll',{room_id:room,since_ms:0});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).events,[]);
 assert.equal(runtime.COUNCIL_HUMAN_TURNS_ONLY,true);
});
test('task is dispatched exactly once, only after explicit approval',async()=>{
 let r=await agent('POST','work-poll',{room_id:room});
 assert.deepEqual((await r.json()).tasks,[]);
 assert.equal((await user('PUT','/api/atha-tasks/'+id,{state:'done'})).status,409);
 assert.equal((await user('PUT','/api/atha-tasks/'+id,{state:'approved'})).status,200);
 r=await agent('POST','work-poll',{room_id:room});assert.equal(r.status,200);
 let task=(await r.json()).tasks[0];
 assert.equal(task.id,id);assert.equal(task.repo,'sshrrgoktas/atha-council');
 assert.deepEqual((await (await agent('POST','work-poll',{room_id:room})).json()).tasks,[]);
 assert.equal((await user('PUT','/api/atha-tasks/'+id,{state:'blocked'})).status,409);
});
test('signed agent can save bounded evidence for review, but cannot self-approve completion',async()=>{
 const payload={room_id:room,task_id:id,outcome:'review',summary:'A controlled file diff was prepared; unit tests not run.',files:['worker/production.js'],checks:['git diff --check: passed'],branch:'work/'+id};
 let r=await agent('POST','work-result',{...payload,files:['../../private.env']});assert.equal(r.status,400);
 r=await agent('POST','work-result',payload);assert.equal(r.status,200);
 assert.equal((await r.json()).review_required,true);
 assert.equal((await agent('POST','work-result',payload)).status,409);
 const list=await user('GET','/api/atha-tasks?room_id='+room);
 const tasks=(await list.json()).tasks;
 assert.equal(tasks[0].status,'review');
 assert.deepEqual(tasks[0].evidence.files,['worker/production.js']);
 assert.equal((await user('PUT','/api/atha-tasks/'+id,{state:'done'})).status,200);
 assert.equal((await user('PUT','/api/atha-tasks/'+id,{state:'approved'})).status,409);
});
test('mobile UI exposes Council to task draft and explicit approval',()=>{
 const i=source.indexOf('const HTML='),html=JSON.parse(source.slice(i+11,source.lastIndexOf(';')));
 for(const needle of ['id="councilTaskCreate"','id="councilTaskFromChat"','id="councilTasksList"','AthalAI Görev Merkezi','function refreshCouncilTaskCentre','İş emrini onayla']){
  assert.ok(html.includes(needle),needle);
 }
 assert.match(html,/if\(addressed==='opencode'\)\{councilTaskInput\.value=t;show\('tasks'\)/);
 assert.doesNotMatch(html,/if\(addressed==='opencode'\)\{[^}]+sendAthaSyncRoom/);
});
