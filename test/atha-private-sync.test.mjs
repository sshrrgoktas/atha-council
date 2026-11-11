import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const ORIGIN="https://atha-sync-test.example";
const secret="test-sync-GitHub-session-secret-random-64-characters-long";
const oldFetch=globalThis.fetch;

class FakeD1 {
 constructor(){this.rows=new Map();this.replies=new Map();this.events=new Map();this.monitor=null}
 prepare(sql){
  let args=[];
  return {
   bind(...params){args=params;return this},
   all: async()=>({results:[...thisDb.rows.values()].filter(r=>r.owner_id===args[0]).sort((a,b)=>b.updated_at-a.updated_at).map(({room_id,title,updated_at})=>({room_id,title,updated_at}))}),
   first: async()=>{const r=thisDb.rows.get(args[0]+"|"+args[1]);return r?{title:r.title,snapshot:r.snapshot,updated_at:r.updated_at}:null},
   run:async()=>{
    if(sql.startsWith("DELETE")){thisDb.rows.delete(args[0]+"|"+args[1]);return {success:true}}
    if(sql.startsWith("INSERT")){const [owner_id,room_id,title,snapshot,updated_at]=args;thisDb.rows.set(owner_id+"|"+room_id,{owner_id,room_id,title,snapshot,updated_at});return {success:true}}
    throw Error("Unexpected SQL")
   }
  };
  const thisDb=this; // this is captured by methods above.
 }
}
// Use a standard captured reference: FakeD1#prepare accessor uses a patched closure.
FakeD1.prototype.prepare=function(sql){
 const database=this;let args=[];
 const stmt={
  bind(...values){args=values;return stmt},
  all:async()=>({results:sql.includes("FROM atha_sync_events")?[...database.events.values()].filter(e=>e.owner_id===args[0]&&e.room_id===args[1]&&String(e.message_excerpt||'').startsWith('{"kind":"dialogue",')):sql.includes("FROM atha_sync_replies")?
   [...database.replies.values()].filter(r=>r.owner_id===args[0]&&r.room_id===args[1])
    .sort((a,b)=>b.created_at-a.created_at).slice(0,40).map(r=>({reply_id:r.reply_id,content:r.content,created_at:r.created_at})):
   [...database.rows.values()].filter(r=>r.owner_id===args[0])
    .sort((a,b)=>b.updated_at-a.updated_at).map(r=>({room_id:r.room_id,title:r.title,updated_at:r.updated_at}))}),
  first:async()=>{
   if(sql.includes("FROM atha_sync_monitor"))return database.monitor?{last_tick_at:database.monitor.last_tick_at}:null;
   if(sql.includes("FROM atha_sync_events"))return {count:[...database.events.values()].filter(e=>e.state==="pending"&&(!sql.includes("owner_id=?")||e.owner_id===args[0])).length};
   const r=database.rows.get(args[0]+"|"+args[1]);
   return r?sql.includes("SELECT room_id")?{room_id:r.room_id}:{title:r.title,snapshot:r.snapshot,updated_at:r.updated_at}:null;
  },
  run:async()=>{
   if(sql.startsWith("DELETE FROM atha_sync_events")){
    for(const [k,v] of database.events)if(v.owner_id===args[0]&&v.room_id===args[1])database.events.delete(k);
   }else if(sql.startsWith("DELETE FROM atha_sync_replies")){
    for(const [k,v] of database.replies)if(v.owner_id===args[0]&&v.room_id===args[1])database.replies.delete(k);
   }else if(sql.startsWith("DELETE"))database.rows.delete(args[0]+"|"+args[1]);
   else if(sql.startsWith("INSERT OR IGNORE INTO atha_sync_events")){
    const [owner_id,room_id,event_id,created_at]=args;
    const key=owner_id+"|"+room_id+"|"+event_id;
    if(!database.events.has(key))database.events.set(key,{owner_id,room_id,event_id,created_at,state:"pending"});
   }
   else if(sql.startsWith("INSERT INTO atha_sync_monitor")){
    database.monitor={last_tick_at:args[0],pending_event_count:args[1]};
   }
   else if(sql.startsWith("INSERT")){const [owner_id,room_id,title,snapshot,updated_at]=args;database.rows.set(owner_id+"|"+room_id,{owner_id,room_id,title,snapshot,updated_at})}
   else throw Error("Unexpected SQL");
   return {success:true};
  }
 };
 return stmt;
};
FakeD1.prototype.batch=async function(statements){
 const results=[];for(const statement of statements)results.push(await statement.run());return results;
};
async function cookie(id){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret)),{name:"AES-GCM"},false,["encrypt"]);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode("gho_user"+id+"_abcdefghijklmnopqrstuvwxyz")));
 return "atlas_copilot_session="+Buffer.from(iv).toString("base64url")+"."+Buffer.from(ciphertext).toString("base64url");
}
const d1=new FakeD1();
const env={GITHUB_SESSION_SECRET:secret,ATHA_SYNC_DB:d1};
const fetchMock=async(url,opts)=>{
 if(String(url)!=="https://api.github.com/user")throw Error("Unexpected external request");
 const bearer=String(opts?.headers?.authorization||"");
 const identity=bearer.includes("user1_")?101:bearer.includes("user2_")?202:null;
 if(!identity)return Response.json({error:"bad token"},{status:401});
 return Response.json({id:identity,login:"sync-test-user"});
};
async function request(path,{method="GET",user=null,origin=ORIGIN,header="1",body}={},database=env.ATHA_SYNC_DB){
 const headers={};
 if(user)headers.cookie=await cookie(user);
 if(method!=="GET"){
  headers.origin=origin;
  if(header)headers["x-atha-sync"]=header;
 }
 if(body!==undefined){headers["content-type"]="application/json"}
 const opts={method,headers};
 if(body!==undefined)opts.body=typeof body==="string"?body:JSON.stringify(body);
 const previous=globalThis.fetch;globalThis.fetch=fetchMock;
 try{return await worker.fetch(new Request(ORIGIN+path,opts),{GITHUB_SESSION_SECRET:secret,ATHA_SYNC_DB:database})}
 finally{globalThis.fetch=previous}
}

test("Opt-in sync defaults to disabled without binding or GitHub auth",async()=>{
 const unconfigured=await request("/api/atha-sync/status",{},undefined);
 // undefined parameter retains default env binding, so test separately below.
 const noDb=await request("/api/atha-sync/status",{},null);
 assert.equal(noDb.status,503);
 assert.equal((await noDb.json()).enabled,false);
 assert.equal(unconfigured.status,200);
 const unauth=await request("/api/atha-sync/rooms");
 assert.equal(unauth.status,401);
 assert.equal((await unauth.json()).error,"GitHub girişi gerekli.");
});
test("Consent, same-origin header, owner isolation, read, list and delete",async()=>{
 const room="/api/atha-sync/rooms/c88888333";
 const snapshot={consent:true,title:"Atha özel konsey",items:[{role:"user",name:"Sen",content:"Merhaba 🌷",speakerId:"human"},{role:"assistant",name:"Gemini",content:"Selam",speakerId:"gemini"}]};
 const rejected=await request(room,{method:"PUT",user:"1",body:{...snapshot,consent:false}});
 assert.equal(rejected.status,400);
 const noHeader=await request(room,{method:"PUT",user:"1",body:snapshot,header:""});
 assert.equal(noHeader.status,403);
 const crossOrigin=await request(room,{method:"PUT",user:"1",body:snapshot,origin:"https://evil.example"});
 assert.equal(crossOrigin.status,403);
 const ok=await request(room,{method:"PUT",user:"1",body:snapshot});
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).synced,true);
 const other=await request(room,{user:"2"});
 assert.equal(other.status,404);
 const own=await request(room,{user:"1"});
 assert.equal(own.status,200);
 assert.equal((await own.json()).snapshot.items[0].content,"Merhaba 🌷");
 const listed=await request("/api/atha-sync/rooms",{user:"1"});
 assert.equal((await listed.json()).rooms.length,1);
 const deniedDelete=await request(room,{method:"DELETE",user:"2"});
 assert.equal(deniedDelete.status,200);
 assert.equal((await request(room,{user:"1"})).status,200);
 const erased=await request(room,{method:"DELETE",user:"1"});
 assert.equal((await erased.json()).deleted,true);
 assert.equal((await request(room,{user:"1"})).status,404);
});
test("Invalid IDs, huge body and missing consent never persist",async()=>{
 const invalid=await request("/api/atha-sync/rooms/invalid..",{method:"PUT",user:"1",body:{consent:true,title:"x",items:[]}});
 assert.equal(invalid.status,404);
 const tooLong=await request("/api/atha-sync/rooms/c123",{method:"PUT",user:"1",body:{consent:true,title:"x",items:[{role:"user",content:"x".repeat(2500),name:"a"}]}});
 assert.equal(tooLong.status,400);
 const malformed=await request("/api/atha-sync/rooms/c123",{method:"PUT",user:"1",body:"{not-json"});
 assert.equal(malformed.status,400);
});
test("Client default is off, requires permission, keeps history, and supports delete",()=>{
 const k=source.indexOf("const HTML="),html=JSON.parse(source.slice(k+11,source.lastIndexOf(";")));
 assert.match(html,/id="athaSyncEnable"/);
 assert.match(html,/id="athaSyncDelete"/);
 assert.match(html,/enabledAthaSyncRooms=new Set/);
 assert.match(html,/function confirmAthaSyncAction\(title,message,approveLabel\)/);
 assert.match(html,/if\(!await confirmAthaSyncAction\("Özel sohbet eşitleme izni"/);
 assert.match(html,/if\(!await confirmAthaSyncAction\("Buluttaki kopyayı sil"/);
 assert.doesNotMatch(html,/if\(!confirm\("Yalnızca/);
 assert.match(html,/panel\.setAttribute\("aria-modal","true"\)/);
 assert.match(html,/accept\.onclick=\(\)=>finish\(true\)/);
 assert.match(html,/cancel\.onclick=\(\)=>finish\(false\)/);
 assert.match(html,/await fetch\("\/api\/atha-sync\/status\?room_id="/);
 assert.match(html,/method:"DELETE",credentials:"same-origin"/);
 assert.match(html,/scheduleAthaSync\(c\.id\)/);
 assert.match(html,/ChatGPT OAuth bağlantısı/);
 assert.match(html,/Olay aboneliği/);
});


test("Private response inbox is owner-scoped, read-only and deleted with room",async()=>{
 const room="/api/atha-sync/rooms/c99993333";
 const snapshot={consent:true,title:"Test room",items:[{role:"user",name:"Sen",content:"Bir soru",speakerId:"human"}]};
 const wrote=await request(room,{method:"PUT",user:"1",body:snapshot});
 assert.equal(wrote.status,200);
 const owner="github:101",roomId="c99993333",replyId="atha_response_123456789";
 d1.replies.set(owner+"|"+roomId+"|"+replyId,{owner_id:owner,room_id:roomId,reply_id:replyId,content:"Atha cevabı 🌷",created_at:Date.now()});
 const other=await request(room+"/replies",{user:"2"});
 assert.equal(other.status,404);
 const unauth=await request(room+"/replies");
 assert.equal(unauth.status,401);
 const denied=await request(room+"/replies",{method:"PUT",user:"1",body:{content:"Sahte yanıt"}});
 assert.equal(denied.status,405);
 const valid=await request(room+"/replies",{user:"1"});
 assert.equal(valid.status,200);
 const body=await valid.json();
 assert.equal(body.verifiedModel,false);
 assert.equal(body.replies.length,1);
 assert.equal(body.replies[0].content,"Atha cevabı 🌷");
 const erased=await request(room,{method:"DELETE",user:"1"});
 assert.equal((await erased.json()).deleted,true);
 assert.equal(d1.replies.size,0);
 assert.equal((await request(room+"/replies",{user:"1"})).status,404);
});
test("Invitation uses authorized calls and reply inbox deduplicates source IDs",()=>{
 const k=source.indexOf("const HTML="),html=JSON.parse(source.slice(k+11,source.lastIndexOf(";")));
 assert.match(html,/id="athaSyncCheckReplies"/);
 assert.match(html,/function receiveAthaReplies/);
 assert.match(html,/async function openAthaInvitation/);
 assert.match(html,/await sendAthaCall\(\)/);
 assert.doesNotMatch(html,/buildAthaHandoffContext/);
 assert.match(html,/setInterval\(\(\)=>\{if\(!document\.hidden\)receiveAthaReplies/);
 assert.match(html,/stored\.has\(reply\.replyId\)/);
 assert.match(html,/source:"cloudflare-connector-user-approved"/);
 assert.match(html,/scheduleAthaSync\(roomId\)/);
});

test("Human messages are queued immediately, deduplicated and deleted with room",async()=>{
 const path="/api/atha-sync/rooms/c99990000";
 const base={consent:true,title:"Atha events test",items:[{role:"user",name:"Sen",content:"Selam",speakerId:"human"}]};
 const first=await request(path,{method:"PUT",user:"1",body:base});
 assert.equal(first.status,200);
 assert.equal((await first.json()).queuedEvents,0,"First sync must not replay historic messages");
 const withUser={...base,items:[...base.items,{role:"assistant",name:"Gemini",content:"Merhaba",speakerId:"gemini"},
     {role:"user",name:"Sen",content:"Atha, nasılsın?",speakerId:"human"}]};
 const next=await request(path,{method:"PUT",user:"1",body:withUser});
 assert.equal((await next.json()).queuedEvents,1);
 assert.equal(d1.events.size,1);
 const retry=await request(path,{method:"PUT",user:"1",body:withUser});
 assert.equal((await retry.json()).queuedEvents,0);
 assert.equal(d1.events.size,1);
 const model={...withUser,items:[...withUser.items,{role:"assistant",name:"Gemini",content:"Ben de buradayım",speakerId:"gemini"}]};
 const modelResult=await request(path,{method:"PUT",user:"1",body:model});
 assert.equal((await modelResult.json()).queuedEvents,0,"AI response cannot trigger another event");
 assert.equal(d1.events.size,1);
 const erase=await request(path,{method:"DELETE",user:"1"});
 assert.equal(erase.status,200);
 assert.equal(d1.events.size,0,"Revoked room consent removes queued events");
});

test("Minute scheduler persists a heartbeat without impersonating an AI response",async()=>{
 const eventId="evt_scheduler_test";
 const key="github:101|test_room|"+eventId;
 d1.events.set(key,{owner_id:"github:101",room_id:"test_room",event_id:eventId,state:"pending"});
 const originalReplyCount=d1.replies.size;
 await worker.scheduled({cron:"* * * * *"},env,{});
 assert.ok(d1.monitor?.last_tick_at>0);
 assert.equal(d1.monitor.pending_event_count,1);
 assert.equal(d1.replies.size,originalReplyCount,"Heartbeat must not create fake ChatGPT messages");
 const status=await request("/api/atha-sync/status",{user:"1"});
 assert.equal(status.status,200);
 const details=await status.json();
 assert.ok(details.monitor.lastTickAt>0);
 assert.equal(details.monitor.pendingEvents,1);
 assert.equal(details.monitor.modelDeliveryConnected,false);
 d1.events.delete(key);
});
