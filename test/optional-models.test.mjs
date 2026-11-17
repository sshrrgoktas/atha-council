import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
test('Meta Llama inference keeps its own identity and model',async()=>{
 let call;
 const response=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'llama',messages:[{role:'user',content:'Selam'}]})
 }),{AI:{run:async(model,input)=>{call={model,input};return {response:'Merhaba.'}}}},{});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.identity,'Meta Llama 3.1 8B');
 assert.equal(call.model,'@cf/meta/llama-3.1-8b-instruct-fast');
 assert.ok(call.input.messages[0].content.startsWith('Sen Meta Llama 3.1 8B modelisin.'));
 assert.equal(data.text,'Merhaba.');
});
test('Retired QwQ 32B endpoint cannot spend inference, cloud Qwen 3.8 remains available',async()=>{
 let calls=0;
 const response=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'qwen',messages:[{role:'user',content:'Merhaba'}]})
 }),{AI:{run:async()=>{calls++;return {response:'never'};}}},{});
 assert.equal(response.status,410);
 const data=await response.json();
 assert.equal(data.retired,true);assert.equal(data.replacement,'qwen3.8');assert.equal(calls,0);
 assert.doesNotMatch(source,/@cf\/qwen\/qwq-32b/);
 assert.match(source,/const QWEN_AUTO_MODEL='@cf\/qwen\/qwen3\.8-27b'/);
});
test('Only the working Qwen 3.8 is selectable in Council',()=>{
 const pos=source.indexOf('const HTML=');
 const html=JSON.parse(source.slice(pos+11,source.lastIndexOf(';')));
 assert.match(html,/id="qwen3MemberCard"/);
 assert.match(html,/Qwen 3\.8 · Workers AI/);
 assert.doesNotMatch(html,/id="toggleQwen"|id="qwenStatus"|<strong>Qwen QwQ 32B<\/strong>/);
 assert.match(html,/if\(id==='meta'\)optionalCouncilModels\.add\(id\)/);
 assert.match(html,/if\(addressed==='qwen'\)\{if\(!enabledAthaSyncRooms\.has\(currentChatId\)\)/);
 assert.match(html,/document\.getElementById\('qwen3Manage'\)\.onclick=\(\)=>show\('help'\)/);
});
test('A message directly addressed to OpenCode does not summon Qwen or Llama',()=>{
 const pos=source.indexOf('const HTML=');
 const html=JSON.parse(source.slice(pos+11,source.lastIndexOf(';')));
 assert.ok(html.includes("/^(?:open\\s*code|opencode)(?=$|[\\s,.:!?])/i.test(directCall)?'opencode':"));
 assert.ok(html.includes("if(addressed==='opencode')"));
 assert.ok(html.includes('await sendAthaSyncRoom(chats.find(c=>c.id===currentChatId))'));
});

test('direct Council address recognizes first- and last-position names without matching ordinary mentions',()=>{
 const start=source.indexOf('function councilDirectedRecipient(value){');
 const end=source.indexOf('function councilStopIntent(value){',start);
 assert.ok(start>0&&end>start,'server routing helper exists');
 const getRecipient=Function(source.slice(start,end)+'; return councilDirectedRecipient')();
 for(const [message,expected] of [
  ['OpenCode, beni duyuyor musun?','opencode'],
  ['Open Code: yanıtla','opencode'],
  ['Ne hatırlıyorsun Opencode','opencode'],
  ['Ne hatırlıyorsun, OpenCode?','opencode'],
  ['@OpenCode, bir şey soracağım','opencode'],
  ['Gemini, sen ne diyorsun?','gemini'],
  ['Bana söyle Gemini!','gemini'],
  ['Qwen, bunu açıkla','qwen'],
  ['Atha, ne dersin?','chatgpt'],
  ['Llama, sıradaki sensin','meta'],
  ['Merhaba Konsey, herkes konuşsun',null],
  ['Bugün OpenCode hakkında konuşalım',null],
  ['Gemini ve OpenCode birbirinden bağımsız', 'gemini']
 ])assert.equal(getRecipient(message),expected,message);
});

test('directed turns do not call unrelated Qwen/Gemini/Atha auto-routes or OpenCode poll',()=>{
 assert.match(source,/if\(addressed&&addressed!=='qwen'\)return false;/);
 assert.match(source,/const COUNCIL_HUMAN_TURNS_ONLY=true;/);
 assert.match(source,/source!=='human'/);
 assert.doesNotMatch(source,/if\(saved\.meta\?\.changes===1&&source==='human'&&!addressed\)/);
 assert.match(source,/if\(councilRecipientForTurn\(latestHuman\?\.content,items\)&&councilRecipientForTurn\(latestHuman\?\.content,items\)!=='chatgpt'\)return;/);
 assert.match(source,/if\(!controlled&&addressed&&addressed!=='chatgpt'&&!turns\[i\]\?\.manualRequest\)continue;/);
 assert.match(source,/const target=v\.recipient\|\|councilDirectedRecipient\(v\.content\)/);
 assert.match(source,/turn\.recipient\|\|councilDirectedRecipient\(turn\.content\)/);
});

test('Android WebView send handler isolates both prefix and suffix direct addresses',()=>{
 const pos=source.indexOf('const HTML=');
 const html=JSON.parse(source.slice(pos+11,source.lastIndexOf(';')));
 const start=html.indexOf('const directCall=t.trim().replace');
 const end=html.indexOf(';if(!start)start=Date.now();',start);
 assert.ok(start>=0&&end>start,'client-side recipient detector exists');
 const helperStart=html.indexOf('function councilClientDirectedRecipient(value){');
 const helperEnd=html.indexOf("document.getElementById('send').onclick=",helperStart);
 assert.ok(helperStart>=0&&helperEnd>helperStart);
 const detect=Function('t','chats','currentChatId',html.slice(helperStart,helperEnd)+html.slice(start,end+1)+'return addressed;');
 for(const [message,speaker] of [
  ['OpenCode, beni duyuyor musun?','opencode'],
  ['Ne hatırlıyorsun Opencode','opencode'],
  ['Ne dersin Gemini?','gemini'],
  ['Qwen, ne düşünüyorsun?','qwen'],
  ['Atha, bir şey soracağım','chatgpt'],
  ['Konsey, hepiniz yanıtlayın',null]
 ])assert.equal(detect(message,[],null),speaker,message);
});

test('Llama response strips the echoed human role label but keeps the genuine answer',async()=>{
 for(const [raw,expected] of [
  ['[İNSAN / SEHER] Llama, burada Atha Council\'de.',"Llama, burada Atha Council'de."],
  ['[qwen] [qwen] Merhaba, ben Qwen.','Merhaba, ben Qwen.'],
  ['Llama burada ve dinliyor.','Llama burada ve dinliyor.']
 ]){
  const resp=await worker.fetch(new Request('https://atlas-council.sshrrgoktas.workers.dev/api/chat',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'llama',messages:[{role:'user',content:'Llama nerde'}]})
  }),{AI:{run:async()=>({response:raw})}},{});
  assert.equal(resp.status,200,raw);
  assert.equal((await resp.json()).text,expected);
 }
});
test('One-to-one follow-up targets the previously addressed Llama and not the whole Council',()=>{
 const a=source.indexOf('function councilDirectedRecipient(value){'),b=source.indexOf('function councilStopIntent(value){',a);
 const recipient=Function(source.slice(a,b)+'return councilRecipientForTurn')();
 const items=[{role:'user',content:'Llama nerde'},{role:'assistant',speakerId:'meta',content:'Llama burada.'},{role:'user',content:'Sen niye bişi demiyosun'}];
 assert.equal(recipient('Sen niye bişi demiyosun',items),'meta');
 assert.equal(recipient('Sen niye bişi demiyosun',items.slice(0,-1)),'meta');
 assert.equal(recipient('Millet ne durumdasınız',items),null);
 assert.equal(recipient('Qwen, sen de konuş',items),'qwen');
 const pos=source.indexOf('const HTML='),html=JSON.parse(source.slice(pos+11,source.lastIndexOf(';')));
 const begin=html.indexOf('function councilClientDirectedRecipient(value){'),end=html.indexOf("document.getElementById('send').onclick=",begin);
 const fn=Function(html.slice(begin,end)+'return councilClientRecipientForTurn')();
 assert.equal(fn('Sen niye bişi demiyosun',items.slice(0,-1)),'meta');
});
test('Explicitly targeted follow-up is carried into signed server event metadata',()=>{
 assert.match(source,/appended\[appended\.length-1\]=\{\.\.\.last,recipient:councilRecipientForTurn\(last\.content,items\)\}/);
 assert.match(source,/recipient:appended\[i\]\.recipient/);
 assert.match(source,/turns\[i\]\?\.recipient\|\|councilDirectedRecipient\(text\)/);
 assert.match(source,/const target=v\.recipient\|\|councilDirectedRecipient\(v\.content\)/);
});
