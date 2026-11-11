import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const ORIGIN="https://atha-sync-test.example";
const secret="test-sync-GitHub-session-secret-random-64-characters-long";
const oldFetch=globalThis.fetch;

class FakeD1 {
 constructor(){this.rows=new Map()}
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
  all:async()=>({results:[...database.rows.values()].filter(r=>r.owner_id===args[0])
    .sort((a,b)=>b.updated_at-a.updated_at).map(r=>({room_id:r.room_id,title:r.title,updated_at:r.updated_at}))}),
  first:async()=>{const r=database.rows.get(args[0]+"|"+args[1]);return r?{title:r.title,snapshot:r.snapshot,updated_at:r.updated_at}:null},
  run:async()=>{
   if(sql.startsWith("DELETE"))database.rows.delete(args[0]+"|"+args[1]);
   else if(sql.startsWith("INSERT")){const [owner_id,room_id,title,snapshot,updated_at]=args;database.rows.set(owner_id+"|"+room_id,{owner_id,room_id,title,snapshot,updated_at})}
   else throw Error("Unexpected SQL");
   return {success:true};
  }
 };
 return stmt;
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
 assert.match(html,/if\(!confirm\("Yalnızca/);
 assert.match(html,/await fetch\("\/api\/atha-sync\/status"/);
 assert.match(html,/method:"DELETE",credentials:"same-origin"/);
 assert.match(html,/scheduleAthaSync\(c\.id\)/);
 assert.match(html,/GitHub hesabınla giriş gerekir/);
 assert.match(html,/ChatGPT'nin bu alana doğrudan erişimi henüz bağlanmadı/);
});
