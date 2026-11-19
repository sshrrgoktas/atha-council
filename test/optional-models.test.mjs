import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const origin='https://atlas-council.sshrrgoktas.workers.dev';
const send=(model,messages=[{role:'user',content:'Selam'}],AI)=>worker.fetch(new Request(origin+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages})}),{AI},{});
test('retired QwQ cannot run or spend Workers AI inference',async()=>{
 let count=0;const response=await send('qwen',undefined,{run:async()=>{count++;throw Error('retired model must not run')}});
 assert.equal(response.status,410);
 assert.deepEqual(await response.json(),{error:'MODEL_RETIRED',retired:true,replacement:'qwen3.8'});
 assert.equal(count,0);
});
test('Llama remains usable with its independent identity',async()=>{
 let call;const response=await send('llama',undefined,{run:async(model,input)=>{call={model,input};return {response:'Merhaba.'}}});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.identity,'Meta Llama 3.1 8B');
 assert.equal(data.text,'Merhaba.');
 assert.equal(call.model,'@cf/meta/llama-3.1-8b-instruct-fast');
});
test('existing Qwen 3.8 auto provider is preserved and old card is absent',async()=>{
 assert.match(source,/QWEN_AUTO_MODEL='@cf\/qwen\/qwen3\.8-27b'/);
 const response=await worker.fetch(new Request(origin+'/api/status'),{AI:{},GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'},{});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.ok(data.models.some(m=>m.includes('Qwen 3.8')));
 assert.doesNotMatch(source,/QwQ|qwq-32b|toggleQwen|qwenStatus|qwenMemberInfo/);
 assert.match(source,/async function handleCouncilTasks/);
 assert.match(source,/async function handleOpenCodeAgent/);
});


test('Llama refuses to echo a role-labelled chat transcript as its answer',async()=>{
 const response=await send('llama',[{role:'user',content:'Selam'}],{run:async()=>({response:'[İNSAN / SEHER] Selam!\n[DİĞER KATILIMCI] Merhaba'})});
 assert.equal(response.status,502);
 const body=await response.json();
 assert.equal(body.error,'MODEL_TRANSCRIPT_ECHO');
});
test('Qwen response cleaning strips repeated [Qwen] display prefixes',()=>{
 assert.match(source,/replace\(\/\^\(\?:\\s\*\\\[\(\?:qwen\|assistant\|model\)/);
});
