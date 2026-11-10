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
test("OAuth start is disabled until GitHub OAuth App is configured",async()=>{
  const r=await get("/auth/github/start");
  assert.equal(r.status,503);
  const d=await r.json();
  assert.match(d.error,/not configured/i);
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
