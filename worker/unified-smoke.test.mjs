import test from "node:test";
import assert from "node:assert/strict";

const origin="https://atlas-council-unified-test.sshrrgoktas.workers.dev";
const preview="https://atlas-council-copilot-preview.sshrrgoktas.workers.dev";
async function get(path,options={}){
 return fetch(new URL(path,origin),{redirect:"manual",signal:AbortSignal.timeout(20000),...options});
}
test("Unified worker serves the existing Council while retaining separate provider status",async()=>{
 const resp=await get("/council-v2");
 assert.equal(resp.status,200);
 const body=await resp.text();
 assert.match(body,/GitHub Copilot Free/);
 assert.match(body,/Google Gemini/);
 assert.match(body,/Önizleme çevrimiçi/);
});
test("Unified status reports available runtime without falsely claiming model connection",async()=>{
 const resp=await get("/api/status");
 assert.equal(resp.status,200);
 const data=await resp.json();
 assert.equal(data.ready,true);
 assert.equal(data.copilotBridgeConfigured,false);
 assert.equal(data.googleConfigured,false); // staged Worker intentionally has no Google keys
});
test("Web OAuth handoff sets a same-site HttpOnly nonce and starts only approved preview auth",async()=>{
 const resp=await get("/auth/github/start");
 assert.equal(resp.status,302);
 const dest=new URL(resp.headers.get("location"));
 assert.equal(dest.origin,preview);
 assert.equal(dest.pathname,"/auth/github/start");
 assert.equal(dest.searchParams.get("handoff"),"web");
 assert.match(dest.searchParams.get("challenge"),/^[A-Za-z0-9_-]{43}$/);
 assert.match(resp.headers.get("set-cookie")||"",/atlas_gh_handoff_nonce=/);
 assert.match(resp.headers.get("set-cookie")||"",/HttpOnly; SameSite=Lax/);
});
test("Android OAuth handoff accepts a PKCE challenge, never needs repository scopes",async()=>{
 const challenge="A".repeat(43);
 const r=await get("/auth/github/start?mobile=1&challenge="+challenge);
 assert.equal(r.status,302);
 const u=new URL(r.headers.get("location"));
 assert.equal(u.searchParams.get("handoff"),"mobile");
 assert.equal(u.searchParams.get("challenge"),challenge);
 const no=await get("/auth/github/start?mobile=1&challenge=bad");
 assert.equal(no.status,400);
});
test("Invalid callback, ticket and mobile exchange never issue a GitHub session",async()=>{
 const fin=await get("/auth/github/finish?ticket=garbage");
 assert.equal(fin.status,403);
 const mobile=await get("/auth/github/mobile-exchange",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:"garbage",verifier:"not-valid"})});
 assert.equal(mobile.status,403);
 const callback=await get("/auth/github/callback");
 assert.equal(callback.status,404);
 for(const resp of [fin,mobile,callback]){
  const body=await resp.json();
  assert.equal(body.verified,false);
  assert.ok(!(resp.headers.get("set-cookie")||"").includes("atlas_copilot_session"));
 }
});
