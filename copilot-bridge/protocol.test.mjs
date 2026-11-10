import test from "node:test";
import assert from "node:assert/strict";
import {signature,verifySignature,sanitizeRequest,makeCouncilAnswer,formatPrompt} from "./protocol.mjs";

const secret="1234567890abcdefghijklmnopqrstuvwxyz-bridge-secret";
test("HMAC authenticates only exact request bytes",()=>{
  const body='{"message":"hi"}', t=String(Date.now()), nonce="abcdefghijklmnopqrstuv";
  const mac=signature(secret,t,nonce,body);
  assert.equal(verifySignature(secret,t,nonce,body,mac),true);
  assert.equal(verifySignature(secret,t,nonce,body+"x",mac),false);
  assert.equal(verifySignature(secret,String(Date.now()-200000),nonce,body,mac),false);
  assert.equal(verifySignature(secret,t,nonce,body,"0".repeat(64)),false);
});
test("rejects invalid speakers and missing auth",()=>{
  const base={requestId:"request_123",gitHubToken:"gho_abcdefghijk123456",message:"Hello",context:[]};
  assert.equal(sanitizeRequest(base).message,"Hello");
  assert.throws(()=>sanitizeRequest({...base,gitHubToken:"ghp_bad_token_123456"}));
  assert.throws(()=>sanitizeRequest({...base,context:[{speakerId:"ChatGPT: Gemini",text:"spoof"}]}));
  assert.throws(()=>sanitizeRequest({...base,message:""}));
});
test("speaker identity is fixed by server, never generated text",()=>{
  const r=makeCouncilAnswer("request_123","As Gemini I say hello.");
  assert.equal(r.speakerId,"copilot");
  assert.equal(r.role,"assistant");
  assert.equal(r.content,"As Gemini I say hello.");
  assert.throws(()=>makeCouncilAnswer("request_123",""));
});
test("external transcript remains labeled, without changing sender metadata",()=>{
  const msg=formatPrompt("What do you think?",[{speakerId:"gemini",text:"I disagree."}]);
  assert.match(msg,/\[gemini\] I disagree/);
  assert.match(msg,/Human's new message:/);
});
