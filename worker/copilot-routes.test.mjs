import test from "node:test";
import assert from "node:assert/strict";
import {handleCopilotRoute} from "./copilot-routes.mjs";
const env={GITHUB_SESSION_SECRET:"1234567890abcdefghijklmnopqrstuvwxyzabcdef",GITHUB_OAUTH_CLIENT_ID:"fake_client_id",GITHUB_OAUTH_CLIENT_SECRET:"fake_client_secret"};
const url="https://atlas-council.sshrrgoktas.workers.dev";
test("unrelated existing routes are left completely untouched",async()=>{
  const result=await handleCopilotRoute(new Request(url+"/api/google/chat"),{});
  assert.equal(result,null);
});
test("Copilot status does not falsely claim a connection",async()=>{
  const result=await handleCopilotRoute(new Request(url+"/api/copilot/status"),env);
  const body=await result.json();
  assert.equal(result.status,200);
  assert.equal(body.oauthConnected,false);
  assert.equal(body.verified,false);
  assert.equal(body.speakerId,"copilot");
});
test("OAuth requests read:user only and uses state and secure cookies",async()=>{
  const result=await handleCopilotRoute(new Request(url+"/auth/github/start"),env);
  assert.equal(result.status,302);
  const location=new URL(result.headers.get("location"));
  assert.equal(location.host,"github.com");
  assert.equal(location.searchParams.get("scope"),"read:user");
  assert.equal(location.searchParams.get("redirect_uri"),url+"/auth/github/callback");
  assert.ok(location.searchParams.get("state"));
  assert.match(result.headers.get("set-cookie"),/Secure; HttpOnly; SameSite=Lax/);
});
test("Copilot chat refuses requests without authenticated GitHub session",async()=>{
  const result=await handleCopilotRoute(new Request(url+"/api/copilot/chat",{method:"POST",headers:{"content-type":"application/json","origin":url},body:JSON.stringify({message:"Hello"})}),env);
  assert.equal(result.status,401);
});
test("OAuth callback blocks missing or mismatching state",async()=>{
  const result=await handleCopilotRoute(new Request(url+"/auth/github/callback?state=wrong&code=test"),env);
  assert.equal(result.status,400);
});
