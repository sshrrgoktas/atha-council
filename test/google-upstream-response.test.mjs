import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
// The Worker is self-contained, so load it without altering the repo's package/module format.
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const ORIGIN="https://example.workers.dev";
const SECRET="local-test-secret-for-crypto-only-never-use-in-production";
const env={GOOGLE_CLIENT_ID:"test-client",GOOGLE_CLIENT_SECRET:SECRET};
async function makeCookie(){
  const key=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(SECRET)),"AES-GCM",false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const session={access_token:"access-in-test-not-real",exp:Date.now()+600000};
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(session))));
  return "atlas_google="+Buffer.concat([Buffer.from(iv),Buffer.from(encrypted)]).toString("base64url");
}
async function ask(){
  return worker.fetch(new Request(ORIGIN+"/api/google/chat",{
    method:"POST",
    headers:{"content-type":"application/json","origin":ORIGIN,"cookie":await makeCookie()},
    body:JSON.stringify({messages:[{role:"user",content:"Selam, nasılsın?"}]})
  }),env);
}
const htmlError=()=>new Response("<!DOCTYPE html><title>upstream unavailable</title>",{status:503,headers:{"content-type":"text/html"}});
const modelList=()=>Response.json({models:[{name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]}]});

test("Google model listing HTML failures produce sanitized JSON API errors",async()=>{
  const realFetch=globalThis.fetch;
  globalThis.fetch=async()=>htmlError();
  try{
    const response=await ask();
    assert.equal(response.status,502);
    assert.match(response.headers.get("content-type")||"",/application\/json/);
    const body=await response.json();
    assert.equal(body.code,"GEMINI_UPSTREAM_UNAVAILABLE");
    assert.equal(body.stage,"listModels");
    assert.equal(body.retryable,true);
    assert.doesNotMatch(JSON.stringify(body),/DOCTYPE|access-in-test-not-real|local-test-secret/i);
  }finally{globalThis.fetch=realFetch}
});
test("Gemini generateContent HTML failures never leak HTML or malformed JSON",async()=>{
  const realFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>String(url).includes("pageSize=100")?modelList():htmlError();
  try{
    const response=await ask();
    assert.equal(response.status,502);
    assert.match(response.headers.get("content-type")||"",/application\/json/);
    const body=await response.json();
    assert.equal(body.stage,"generateContent");
    assert.doesNotMatch(JSON.stringify(body),/DOCTYPE|access-in-test-not-real/i);
  }finally{globalThis.fetch=realFetch}
});
test("Valid Gemini JSON replies are still delivered with real provider identity",async()=>{
  const realFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>String(url).includes("pageSize=100")?modelList():Response.json({candidates:[{content:{parts:[{text:"Merhaba! 🌷"}]}}]});
  try{
    const response=await ask();
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.identity,"Google Gemini");
    assert.equal(result.text,"Merhaba! 🌷");
    assert.equal(result.complete,true);
  }finally{globalThis.fetch=realFetch}
});
test("Browser catches HTML responses before attempting JSON parse",()=>{
  const k=source.indexOf("const HTML="),html=JSON.parse(source.slice(k+11,source.lastIndexOf(";")));
  assert.match(html,/if\(!\/json\/i\.test\(contentType\)\)/);
  assert.match(html,/Atha Council sunucusu beklenmeyen yanıt döndürdü/);
  assert.match(html,/Atha Council sunucusunun yanıtı okunamadı/);
});
