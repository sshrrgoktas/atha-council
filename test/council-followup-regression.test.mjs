import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const api=await import('data:text/javascript;base64,'+Buffer.from(
 source+'\nexport {councilRecipientForTurn,councilFinalAnswer};').toString('base64'));
const html=JSON.parse(source.slice(source.indexOf('const HTML=')+11,source.lastIndexOf(';')));
const from=html.indexOf('function councilClientDirectedRecipient(value){');
const to=html.indexOf("document.getElementById('send').onclick=",from);
assert.ok(from>=0&&to>from);
const client=Function(html.slice(from,to)+'return councilClientRecipientForTurn')();
test('trusted output strips repeated Council transcript headers, not genuine answer text',()=>{
 for(const raw of [
  '[Konsey opencode] [Konsey qwen] Son teknik görevler açık.',
  '[Konsey meta] [Konsey opencode] Son teknik görevler açık.',
  '[gemini] [Konsey meta] Son teknik görevler açık.',
 ]){
  const result=api.councilFinalAnswer(raw);
  assert.equal(result.ok,true);
  assert.equal(result.text,'Son teknik görevler açık.');
 }
 assert.equal(api.councilFinalAnswer('[Konsey opencode]').ok,false);
});
test('Gemini plus elliptical user follow-up routes to Gemini on server AND browser',()=>{
 const history=[{role:'user',content:'Gemini'},{role:'assistant',speakerId:'gemini',content:'Açık işleri anlatayım.'},{role:'user',content:'O ne aşko'}];
 for(const fn of [api.councilRecipientForTurn,client]){
  assert.equal(fn('O ne aşko',history),'gemini');
  assert.equal(fn('O ne aşko',history.slice(0,-1)),'gemini');
  assert.equal(fn('Peki bunu yap',history),'gemini');
 }
});
test('specific addressee persists through two short turns but explicit group clears focus',()=>{
 const history=[{role:'user',content:'Gemini'},{role:'user',content:'O ne aşko'},{role:'assistant',speakerId:'gemini',content:'Bunu açıkladım.'},{role:'user',content:'Peki bu görev tamam mı'}];
 assert.equal(api.councilRecipientForTurn('Peki bu görev tamam mı',history),'gemini');
 assert.equal(client('Peki bu görev tamam mı',history),'gemini');
 const group=[...history,{role:'user',content:'Herkes görüş bildirsin'},{role:'user',content:'O ne aşko'}];
 assert.equal(api.councilRecipientForTurn('O ne aşko',group),null);
 assert.equal(client('O ne aşko',group),null);
});
test('explicit new target wins and no automatic model-to-model dialogue',()=>{
 const items=[{role:'user',content:'Gemini'},{role:'user',content:'O ne aşko'}];
 assert.equal(api.councilRecipientForTurn('OpenCode, incele',items),'opencode');
 assert.equal(client('OpenCode, incele',items),'opencode');
 assert.match(source,/const COUNCIL_HUMAN_TURNS_ONLY=true/);
 assert.equal(api.councilRecipientForTurn('İşler tamam mı',items),null);
});
