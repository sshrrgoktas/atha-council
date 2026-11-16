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

test('QwQ does not display its English planning paragraphs, only the natural final Turkish answer',async()=>{
 const leaked=[
  'Okay, the user said "Selam" which is Turkish for "Hello". I need to respond appropriately.',
  'First, I need to respond to their greeting. I should keep it short and avoid other model names.',
  'So, first sentence: Greet them back in Turkish. Second: Offer help with open-source code.',
  '',
  'Merhaba! Open-source projeleri veya kod konularında nasıl yardımcı olabilirim?'
 ].join('\n\n');
 const response=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'qwen',messages:[{role:'user',content:'OpenCode?'}]})
 }),{AI:{run:async()=>({response:leaked})}},{});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.text,'Merhaba! Open-source projeleri veya kod konularında nasıl yardımcı olabilirim?');
 assert.doesNotMatch(data.text,/first sentence|user said|I need to/i);
});
test('QwQ does not publish unfinished or exclusively internal reasoning',async()=>{
 for(const raw of [
  'Okay, the user said "Selam". I should answer briefly.',
  '<think>I need to consider how to respond...',
  'So, first sentence: Greet them back in Turkish. Second: be concise.'
 ]){
  const response=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'qwen',messages:[{role:'user',content:'Selam'}]})
  }),{AI:{run:async()=>({response:raw})}},{});
  assert.equal(response.status,502,'must refuse instead of showing thinking: '+raw);
 }
});
test('A message directly addressed to OpenCode does not summon Qwen or Llama',()=>{
 const pos=source.indexOf('const HTML=');
 const html=JSON.parse(source.slice(pos+11,source.lastIndexOf(';')));
 assert.ok(html.includes("/^(?:open\\s*code|opencode)(?=$|[\\s,.:!?])/i.test(directCall)?'opencode':null"));
 assert.ok(html.includes("if(addressed==='opencode')"));
 assert.ok(html.includes('await sendAthaSyncRoom(chats.find(c=>c.id===currentChatId))'));
});
