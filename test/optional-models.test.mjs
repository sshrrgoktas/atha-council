import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
for(const [id,identity] of [['qwen','Qwen QwQ 32B'],['llama','Meta Llama 3.1 8B']])test(`${id} inference keeps its own identity`,async()=>{
 let call;
 const response=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:id,messages:[{role:'user',content:'Selam'}]})}),{AI:{run:async(model,input)=>{call={model,input};return {response:'Merhaba.'}}}},{});
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.identity,identity);assert.ok(call.input.messages[0].content.startsWith('Sen '+identity+' modelisin.'));assert.equal(data.text,'Merhaba.');
});
