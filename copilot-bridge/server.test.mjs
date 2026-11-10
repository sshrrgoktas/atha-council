import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createBridgeServer } from "./server.mjs";
import { signature, makeCouncilAnswer } from "./protocol.mjs";

const SECRET="AthaCouncilTests-bridge-secret-1234567890abcdefghijklmnopqrstuvwxyz";
const gitHubToken="gho_abcdefghijklmnopqrstuvwxyz12345";
const postJson=(port,raw,headers={},splitAt=null)=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:"127.0.0.1",port,path:"/v1/copilot",method:"POST",
    headers:{"content-type":"application/json",...headers}},res=>{
    const chunks=[];
    res.on("data",b=>chunks.push(b));
    res.on("end",()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));
  });
  req.on("error",reject);
  const b=Buffer.from(raw);
  if(splitAt!==null){req.write(b.subarray(0,splitAt));req.end(b.subarray(splitAt))}
  else req.end(b);
});

test("Atha Copilot bridge is deny-by-default, validates HMAC over split UTF-8 and blocks replay",async()=>{
  let calls=0;
  const srv=createBridgeServer({secret:SECRET,answer:async data=>{
    calls++;return makeCouncilAnswer(data.requestId,"Merhaba, gerçek SDK yerine test yanıtı.");
  }});
  srv.listen(0,"127.0.0.1");await once(srv,"listening");
  const port=srv.address().port;
  try{
    const raw=JSON.stringify({requestId:"request12345",gitHubToken,
      message:"İyi günler, çiçek 🌷, doğru mu?",context:[{speakerId:"human",text:"Merhaba"}]});
    const time=String(Date.now()),nonce="nonce_abcdefghijklmnop123";
    const sig=signature(SECRET,time,nonce,raw);
    const wrong=await postJson(port,raw);
    assert.equal(wrong.status,401);
    assert.equal(calls,0);
    const headers={"x-atlas-timestamp":time,"x-atlas-nonce":nonce,"x-atlas-signature":sig};
    const bytes=Buffer.from(raw,"utf8");
    const special=bytes.indexOf(Buffer.from("İ"));
    assert.ok(special>0);
    const ok=await postJson(port,raw,headers,special+1); // UTF-8 code point split across TCP writes.
    assert.equal(ok.status,200);
    assert.equal(ok.body.source,"github-copilot-sdk");
    assert.equal(ok.body.speakerId,"copilot");
    assert.equal(calls,1);
    assert.ok(!JSON.stringify(ok.body).includes(gitHubToken));
    const replay=await postJson(port,raw,headers);
    assert.equal(replay.status,409);
    assert.equal(calls,1);
    const altered=await postJson(port,raw+" ",{"x-atlas-timestamp":time,"x-atlas-nonce":"nonce_otherabcdefghijklmnop","x-atlas-signature":sig});
    assert.equal(altered.status,401);
  }finally{await new Promise(resolve=>srv.close(resolve))}
});

test("Atha bridge health is honest and unprivileged",async()=>{
  const srv=createBridgeServer({secret:SECRET,answer:async()=>{throw Error("should not call")}});
  srv.listen(0,"127.0.0.1");await once(srv,"listening");
  try{
    const url="http://127.0.0.1:"+srv.address().port;
    const health=await fetch(url+"/health"),body=await health.json();
    assert.equal(health.status,200);
    assert.equal(body.modelVerified,false);
    assert.equal(body.ready,true);
    assert.equal((await fetch(url+"/does-not-exist")).status,404);
  }finally{await new Promise(resolve=>srv.close(resolve))}
});
