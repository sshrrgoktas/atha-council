import test from "node:test";
import assert from "node:assert/strict";
const prod="https://atlas-council.sshrrgoktas.workers.dev";
const preview="https://atlas-council-copilot-preview.sshrrgoktas.workers.dev";
async function request(path,opt={}){return fetch(new URL(path,prod),{redirect:"manual",signal:AbortSignal.timeout(15000),...opt})}
test("production preserves Cloudflare AI and Google configuration",async()=>{
 const r=await request("/api/status");
 assert.equal(r.status,200);
 const json=await r.json();
 assert.equal(json.ready,true);
 assert.equal(json.ai,true);
 assert.equal(json.googleConfigured,true);
 assert.equal(json.copilotBridgeConfigured,false);
});
test("production preserves Google OAuth status without claiming user session",async()=>{
 const r=await request("/auth/google/status");
 assert.equal(r.status,200);
 const json=await r.json();
 assert.equal(json.connected,false);
});
test("production GitHub OAuth begins with a secure, PKCE-bound handoff",async()=>{
 const r=await request("/auth/github/start");
 assert.equal(r.status,302);
 const location=new URL(r.headers.get("location"));
 assert.equal(location.origin,preview);
 assert.equal(location.pathname,"/auth/github/start");
 assert.equal(location.searchParams.get("handoff"),"web");
 assert.match(location.searchParams.get("challenge"),/^[a-zA-Z0-9_-]{43}$/);
 assert.match(r.headers.get("set-cookie")||"",/atlas_gh_handoff_nonce=/);
});
test("production rejects unbound or expired token transfer",async()=>{
 const r=await request("/auth/github/finish?ticket=bad");
 assert.equal(r.status,403);
 const result=await r.json();
 assert.equal(result.verified,false);
});
test("production displays both Gemini and Copilot with no fake model replies",async()=>{
 const r=await request("/council-v2");
 assert.equal(r.status,200);
 const h=await r.text();
 assert.match(h,/Google Gemini/);
 assert.match(h,/GitHub Copilot Free/);
 assert.match(h,/id="copilotStatus"/);
 assert.match(h,/id="geminiStatus"/);
});
