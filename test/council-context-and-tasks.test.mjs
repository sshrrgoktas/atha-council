import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const origin='https://atha-sync-test.example',secret='test-owner-scoped-Council-task-authentication-key-56-characters-long';

function extract(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,start);
 return source.slice(i,j);
}
const classify=new Function(extract('function councilRequestKind','function councilShortReply')+
  ';return {councilRequestKind,councilExplicitRecipient}')();
const finalCheck=new Function(extract('function councilFinalAnswer','function councilRequestKind')+
  ';return councilFinalAnswer')();
const hIdx=source.indexOf('const HTML=');
const html=JSON.parse(source.slice(hIdx+11,source.lastIndexOf(';')));

test('explicit addressee, task and analysis are recognized instead of spamming all agents',()=>{
 assert.equal(classify.councilExplicitRecipient('Gemini bu iki modelin cevabını analiz et'),'gemini');
 assert.equal(classify.councilExplicitRecipient('@OpenCode, hatayı incele'),'opencode');
 assert.equal(classify.councilExplicitRecipient('Herkes yorumlasın'),'all');
 assert.equal(classify.councilExplicitRecipient('Şimdi dediğimi yap'),null);
 assert.equal(classify.councilRequestKind('Şimdi dediğimi yap'),'task');
 assert.equal(classify.councilRequestKind('Diğerlerinin cevaplarını analiz et'),'analysis');
 assert.equal(classify.councilRequestKind('Merhaba!'),'greeting');
 assert.match(html,/id="councilRecipient"/);
 assert.match(html,/const chosenTarget=explicitTarget\|\|activeChat\?\.focusRecipient/);
 assert.match(html,/const ongoing=activeChat\?\.activeGoal\?\.target===speaker/);
 assert.match(html,/const rounds=1;/);
 assert.match(html,/const context=transcript\.slice\(-14\)/);
 assert.doesNotMatch(html,/En fazla iki kısa cümleyle yanıt ver/);
});
test('verified text rejects fake inter-agent transfers and unproven work',()=>{
 assert.equal(finalCheck('Şimdi diğer modellere aktarıyorum.').reason,'UNVERIFIED_COORDINATION');
 assert.equal(finalCheck('Şimdi video oluşturuyorum.').reason,'UNVERIFIED_ACTION');
 assert.equal(finalCheck('Henüz diğer modellere iletemedim. Bunu uygulama aracımız olmadığı için burada yapamam.').ok,true);
});
test('task board explicitly distinguishes approved plan from execution',()=>{
 for(const marker of ['id="councilTaskCreate"','id="councilTaskFromChat"','id="councilTasksList"','function councilTaskRequest','function refreshCouncilTasksCloud','function updateCouncilTaskState','function renderCouncilTasks','id="councilRecipient"'])assert.ok(html.includes(marker),marker);
 assert.match(html,/Kullanıcı onayladı · henüz çalıştırılmadı/);
 assert.match(source,/executionEnabled:false/);
 assert.doesNotMatch(html,/OpenCode dosyayı değiştirdi|Görev tamamlandı/);
});
test('optional Qwen fallback is bounded to two real calls and returns final text only',async()=>{
 const calls=[];
 const response=await worker.fetch(new Request(origin+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'qwen',messages:[{role:'user',content:'Selam'}]})}),{AI:{run:async(model,input)=>{calls.push(model);return calls.length===1?{response:'Okay, the user said "Selam". I should answer briefly.'}:{response:'Merhaba! Nasılsın?'}}}},{});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.text,'Merhaba! Nasılsın?');
 assert.equal(data.fallbackUsed,true);
 assert.equal(calls.length,2);
});
class FakeTasksD1 {
 constructor(){this.rooms=new Map([['github:101|c12345',{owner_id:'github:101',room_id:'c12345'}],['github:202|c67890',{owner_id:'github:202',room_id:'c67890'}]]);this.tasks=new Map()}
 prepare(sql){const db=this;let a=[];const stmt={
   bind(...v){a=v;return stmt},
   first:async()=>{
    if(sql.includes('FROM atha_sync_rooms'))return db.rooms.get(a[0]+'|'+a[1])||null;
    if(sql.includes('FROM atha_council_tasks')){const t=db.tasks.get(a[0]);return t&&(sql.includes('owner_id=?')?t.owner_id===a[1]:true)?t:null}
    throw Error('Unexpected task SQL first: '+sql.slice(0,60))
   },
   all:async()=>{
    if(sql.includes('FROM atha_council_tasks'))return {results:[...db.tasks.values()].filter(t=>t.owner_id===a[0]&&t.room_id===a[1]).sort((x,y)=>y.updated_at-x.updated_at)};
    throw Error('Unexpected task SQL all')
   },
   run:async()=>{
    if(sql.startsWith('INSERT OR IGNORE INTO atha_council_tasks')){
     const [task_id,owner_id,room_id,request_text,assignee,created_at,updated_at]=a;
     if(!db.tasks.has(task_id))db.tasks.set(task_id,{task_id,owner_id,room_id,request_text,assignee,state:'draft',created_at,updated_at});
     return {meta:{changes:1}}
    }
    if(sql.startsWith('UPDATE atha_council_tasks')){
     const [state,updated_at,id,owner_id]=a,t=db.tasks.get(id);
     if(t&&t.owner_id===owner_id){t.state=state;t.updated_at=updated_at}
     return {meta:{changes:t&&t.owner_id===owner_id?1:0}}
    }
    throw Error('Unexpected task SQL run')
   }
 };return stmt}
}
async function login(userId){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('gho_user'+userId+'_abcdefghijklmnopqrstuvwxyz')));
 return 'atlas_copilot_session='+Buffer.from(iv).toString('base64url')+'.'+Buffer.from(encrypted).toString('base64url');
}
const db=new FakeTasksD1();
async function call(url,{method='GET',user=null,body=null,from=origin}={}){
 const headers={};
 if(user)headers.cookie=await login(user);
 if(method!=='GET'){headers.origin=from;headers['x-atha-sync']='1';headers['content-type']='application/json'}
 const req=new Request(origin+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{assert.equal(String(url),'https://api.github.com/user');const token=opts.headers.authorization||'';return Response.json({id:token.includes('user1_')?101:202,login:'test-user'})};
 try{return await worker.fetch(req,{GITHUB_SESSION_SECRET:secret,ATHA_SYNC_DB:db},{})}
 finally{globalThis.fetch=original}
}
test('cloud task drafts require owner auth, explicit consent and cannot report execution',async()=>{
 const id='ct_5fe5a0ec-2921-48d5-a18c-1223bb731ab2',body={id,roomId:'c12345',request:'Qwen cevap hatasını test et',assignee:'opencode'};
 assert.equal((await call('/api/atha-tasks?room_id=c12345')).status,401);
 assert.equal((await call('/api/atha-tasks',{method:'POST',user:'1',body,from:'https://evil.example'})).status,403);
 assert.equal((await call('/api/atha-tasks',{method:'POST',user:'2',body})).status,403);
 const create=await call('/api/atha-tasks',{method:'POST',user:'1',body});assert.equal(create.status,200);assert.equal((await create.json()).executionEnabled,false);
 const list1=await call('/api/atha-tasks?room_id=c12345',{user:'1'});assert.equal((await list1.json()).tasks.length,1);
 assert.equal((await call('/api/atha-tasks?room_id=c12345',{user:'2'})).status,403);
 const approve=await call('/api/atha-tasks/'+id,{method:'PUT',user:'1',body:{state:'approved'}});const approved=await approve.json();
 assert.equal(approved.status,'approved');assert.equal(approved.executionEnabled,false);
 assert.equal((await call('/api/atha-tasks/'+id,{method:'PUT',user:'2',body:{state:'blocked'}})).status,404);
 assert.equal((await call('/api/atha-tasks/'+id,{method:'PUT',user:'1',body:{state:'done'}})).status,400);
 assert.equal(db.tasks.get(id).state,'approved');
});
