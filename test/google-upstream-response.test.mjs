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

test("Google model listing HTML failures still trigger safe candidate retries and JSON errors",async()=>{
  const realFetch=globalThis.fetch;
  let attempted=0;
  globalThis.fetch=async url=>{if(!String(url).includes("pageSize=100"))attempted++;return htmlError()};
  try{
    const response=await ask();
    assert.equal(response.status,502);
    assert.match(response.headers.get("content-type")||"",/application\/json/);
    const body=await response.json();
    assert.equal(body.stage,"generateContent");
    assert.equal(body.retryable,true);
    assert.equal(attempted,3);
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
test("When the fastest Gemini model is unavailable, another authorized fast model answers",async()=>{
  const realFetch=globalThis.fetch;
  const attempts=[];
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.includes("pageSize=100"))return Response.json({models:[
      {name:"models/gemini-3.8-flash",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-3.5-flash-lite",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-3.5-flash",supportedGenerationMethods:["generateContent"]},
      {name:"models/gemini-3.5-flash-preview",supportedGenerationMethods:["generateContent"]}
    ]});
    attempts.push(u);
    if(attempts.length===1)return Response.json({error:{status:"NOT_FOUND",message:"No access"}},{status:404});
    return Response.json({candidates:[{content:{parts:[{text:"Merhaba, buradayım! 💚"}]}}]});
  };
  try{
    const response=await ask();
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.text,"Merhaba, buradayım! 💚");
    assert.equal(result.model,"gemini-3.8-flash");
    assert.equal(attempts.length,2);
    assert.ok(attempts[0].includes("gemini-3.5-flash-lite"));
    assert.ok(attempts[1].includes("gemini-3.8-flash"));
  }finally{globalThis.fetch=realFetch}
});
test("Gemini model list failure does not block successful direct model response",async()=>{
  const realFetch=globalThis.fetch;
  let count=0;
  globalThis.fetch=async url=>{
    if(String(url).includes("pageSize=100"))return htmlError();
    count++;
    return Response.json({candidates:[{content:{parts:[{text:"Yedek hızlı model çalıştı."}]}}]});
  };
  try{
    const response=await ask();
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.text,"Yedek hızlı model çalıştı.");
    assert.equal(count,1);
  }finally{globalThis.fetch=realFetch}
});
test("Browser catches HTML responses before attempting JSON parse",()=>{
  const k=source.indexOf("const HTML="),html=JSON.parse(source.slice(k+11,source.lastIndexOf(";")));
  assert.match(html,/if\(!\/json\/i\.test\(contentType\)\)/);
  assert.match(html,/Atha Council sunucusu beklenmeyen yanıt döndürdü/);
  assert.match(html,/Atha Council sunucusunun yanıtı okunamadı/);
});
