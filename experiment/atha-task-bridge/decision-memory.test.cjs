'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeLedger,sharedHandoff}=require('./decision-memory.cjs');
const user=(content,id)=>({role:'user',speakerId:'human',content,id});
const ai=content=>({role:'assistant',speakerId:'gemini',content});
test('human corrections are favored over model claims',()=>{
 const l=makeLedger([user('OpenCode konsey sohbetinde konuşsun'),ai('OpenCode eklendi'),user('OpenCode sohbet katılımcısı olmasın, görev işçisi olsun','h2')]);
 assert.equal(l.latestBySubject.opencode_role.kind,'correction');
 assert.equal(l.latestBySubject.opencode_role.messageId,'h2');
 assert.equal(l.source,'human_turns_only');assert.equal(l.executionAllowed,false);
});
test('ambiguous "eskisi gibi" does not silently overwrite a decision',()=>{
 const l=makeLedger([user('Konseyi ayrı test ortamında kur'),user('Eskisi gibi')]);
 assert.ok(l.issues.some(i=>i.kind==='ambiguous_reference'));assert.equal(l.latestBySubject.council.text,'Konseyi ayrı test ortamında kur');
});
test('protection guard for current tunnel',()=>{
 const l=makeLedger([user('Çalışan AthalAI tüneline dokunma, ayrı test ortamı kullan')]);
 assert.ok(l.holds.includes('athalai'));assert.equal(l.executionAllowed,false);
});
test('newer explicit correction supersedes older request without deleting it',()=>{
 const l=makeLedger([user('OpenCode sohbet katılımcısı olsun'),user('OpenCode sohbet katılımcısı olmasın, sadece görev işçisi')]);
 assert.equal(l.events.filter(e=>e.subject==='opencode_role').length,2);
 assert.match(l.latestBySubject.opencode_role.text,/olmasın/);
});
test('only Gemini statement has no binding decision',()=>{
 const l=makeLedger([ai('E-kitap tamamlandı')]);
 assert.equal(l.events.length,0);assert.deepEqual(l.latestBySubject,{});
});
test('shared packet is not executable',()=>{
 const l=makeLedger([user('Task Bridge benim belirsiz promptlarımı çözümlesin')]);
 const p=sharedHandoff(l,'Bunu yap');
 assert.equal(p.dispatchAllowed,false);
 assert.ok(p.authoritativeDecisions.some(e=>e.subject==='bridge'));
});
test('rooms are input-scoped metadata and not inferred from model replies',()=>{
 const l=makeLedger([user('Konseyi test et'),ai('Başka odaya taşıdım')],{roomId:'room-1'});
 assert.equal(l.roomId,'room-1');assert.equal(l.source,'human_turns_only');
});
test('empty ledger allowed, malformed rejected',()=>{
 assert.equal(makeLedger([]).events.length,0);
 assert.throws(()=>makeLedger('hi'),/INVALID_TURNS/);
});
