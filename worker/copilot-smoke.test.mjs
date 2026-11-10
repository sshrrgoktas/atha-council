import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_WORKER_URL || "https://atlas-council-copilot-preview.sshrrgoktas.workers.dev";
const timeout = 20000;
async function get(path, options={}) {
  return fetch(new URL(path,base),{redirect:"manual",signal:AbortSignal.timeout(timeout),...options});
}
test("Preview HTTP status explicitly reports no real Copilot connection",async()=>{
  const r=await get("/api/copilot/status");
  assert.equal(r.status,200,"Preview needs an isolated session secret but not an OAuth App");
  assert.match(r.headers.get("content-type")||"",/json/i);
  const d=await r.json();
  assert.equal(d.speakerId,"copilot");
  assert.equal(d.oauthConnected,false);
  assert.equal(d.bridgeConfigured,false);
  assert.equal(d.verified,false);
});
test("Unauthenticated Copilot chat never reaches a model",async()=>{
  const r=await get("/api/copilot/chat",{method:"POST",headers:{"content-type":"application/json","origin":base},body:JSON.stringify({message:"Hello"})});
  assert.equal(r.status,401);
  const d=await r.json();
  assert.equal(d.verified,false);
});
test("GitHub OAuth start issues an authorization redirect with no repo scopes",async()=>{
  const r=await get("/auth/github/start");
  assert.equal(r.status,302, "Expected GitHub OAuth flow after secrets configured");
  const dest = new URL(r.headers.get("location"));
  assert.equal(dest.origin, "https://github.com");
  assert.equal(dest.pathname, "/login/oauth/authorize");
  assert.equal(dest.searchParams.get("scope"), "read:user");
  assert.equal(dest.searchParams.get("redirect_uri"), base+"/auth/github/callback");
  assert.equal(typeof dest.searchParams.get("client_id"), "string");
  assert.ok(dest.searchParams.get("state")?.length >= 32);
  assert.match(r.headers.get("set-cookie") || "", /Secure; HttpOnly; SameSite=Lax/);
});
test("Preview serves existing Council interface plus explicit Copilot status",async()=>{
  const r=await get("/council-v2");
  assert.equal(r.status,200);
  const html=await r.text();
  assert.match(html,/<title>Atlas Council<\/title>/);
  assert.match(html,/GitHub Copilot Free/);
  assert.match(html,/id="copilotStatus"/);
  assert.match(html,/id="geminiStatus"/);
  assert.match(html,/id="send"/);
});
