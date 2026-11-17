// Council reply/approved-Handoff regression tests. No external inference or DB mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+Buffer.from(
  source+'\nexport {councilFinalAnswer,councilHandoffPrompt,councilContextPacket};'
).toString('base64'));

test('all final-answer routes remove copied speaker labels without dropping the answer',()=>{
  for(const [raw,expected] of [
    ['[gemini] Biz Handoff bağlamını düzeltiyoruz.','Biz Handoff bağlamını düzeltiyoruz.'],
    ['[qwen] [META LLAMA] Son kararları doğrulayacağız.','Son kararları doğrulayacağız.'],
    ['[İNSAN / SEHER] Testler bekliyor.','Testler bekliyor.'],
    ['Normal bir cevap.','Normal bir cevap.']
  ]){
    const result=runtime.councilFinalAnswer(raw);
    assert.equal(result.ok,true,raw);
    assert.equal(result.text,expected);
  }
});
test('final text is blocked if it only contains a speaker label, internal analysis or unverified action',()=>{
  assert.equal(runtime.councilFinalAnswer('[gemini]').ok,false);
  assert.equal(runtime.councilFinalAnswer('<think>unfinished').reason,'INCOMPLETE_REASONING');
  assert.equal(runtime.councilFinalAnswer('Şimdi video oluşturuyorum.').reason,'UNVERIFIED_ACTION');
});
const handoff={
  project_id:'atha-council',version:2,
  source_page:'https://chatgpt.com/space/page_76c42313455881919ee0242109385919',
  reviewed_at:'2026-11-17',
  approved_decisions:Array.from({length:7},(_,i)=>({id:'D'+i,text:'Yalnız insan mesajı tur açar; onaylı konsey düzenini koru. '+('A'.repeat(270))})),
  open_tasks:Array.from({length:5},(_,i)=>({id:'TASK'+i,text:i===0?'Ortak Handoff bağlamını ve modellerin görev sınırlarını düzelt':('Modelin gerçek görevini doğrula '+i)})),
  verified_changes:Array.from({length:4},(_,i)=>({id:'PR'+i,text:'PR kod değişikliği CI ile sınandı'}))
};
test('technical open tasks survive long approved decision lists and are not mixed with verified completion',()=>{
  const prompt=runtime.councilHandoffPrompt(handoff);
  assert.match(prompt,/Handoff sürümü 2/);
  assert.match(prompt,/TASK0: Ortak Handoff bağlamını/);
  assert.match(prompt,/D6: Yalnız insan mesajı tur açar/);
  assert.match(prompt,/PR3: PR kod değişikliği CI ile sınandı/);
  assert.ok(prompt.indexOf('ÖNCELİKLİ, HENÜZ AÇIK TEKNİK GÖREVLER')<prompt.indexOf('KULLANICININ ONAYLADIĞI KARARLAR'));
  assert.ok(prompt.length<=4500);
});
test('frozen packet changes hash on Handoff version change and keeps authorization context',async()=>{
  const items=[{role:'user',speakerId:'human',content:'En son hangi sorunu düzeltiyorduk?'}];
  const a=await runtime.councilContextPacket(items,'room_a','evt_1',handoff);
  const b=await runtime.councilContextPacket(items,'room_a','evt_1',{...handoff,version:3});
  assert.notEqual(a.snapshot_hash,b.snapshot_hash);
  assert.deepEqual(a.approved_decision_ids,handoff.approved_decisions.map(x=>x.id));
  assert.equal(a.project_memory.open_tasks.length,5);
});
