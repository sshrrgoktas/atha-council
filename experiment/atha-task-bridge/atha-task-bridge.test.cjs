'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {interpretCouncilTask}=require('./atha-task-bridge.cjs');
const user=content=>({role:'user',speakerId:'human',content});
const ai=content=>({role:'assistant',speakerId:'gemini',content});
test('vague follow-up resolves earlier human intent, not Gemini claims',()=>{
 const t=interpretCouncilTask([user('Bana kısa hikaye yaz'),ai('Hazırladım'),user('Dijital çevrilebilir sayfada e kitap yapsın'),ai('E kitap tamamlandı'),user('Hayır canım bunu yap yapınca yaptım diye dön')]);
 assert.equal(t.intent.id,'ebook');assert.equal(t.status,'needs_context');
 assert.ok(t.missingFields.includes('verified_story_text'));assert.equal(t.workerDispatchAllowed,false);
 assert.equal(t.evidence.unverifiedModelClaims,2);
});
test('with verified story and approved workspace it is still a draft until human approval',()=>{
 const t=interpretCouncilTask([user('Dijital çevrilebilir e-kitap yap'),user('Hadi yap')],{verifiedSources:[{id:'story-1',verified:true}],workspace:{approved:true,path:'sandbox/ebook'},acceptanceCriteria:['Sayfa değiştirme çalışıyor']});
 assert.equal(t.status,'ready_for_human_review');assert.equal(t.readyForApproval,true);assert.equal(t.workerDispatchAllowed,false);
});
test('only model claim does not create concrete user intent',()=>{
 const t=interpretCouncilTask([ai('E-kitap hazır'),user('Nerede?')]);assert.equal(t.status,'needs_context');
});
test('stop and protect instruction outranks older intention',()=>{
 const t=interpretCouncilTask([user('E-kitap oluştur'),user('Sakın yapma, dokunma')]);assert.equal(t.status,'blocked');assert.equal(t.workerDispatchAllowed,false);
});
test('ambiguous deictic command without context cannot be dispatched',()=>{
 const t=interpretCouncilTask([user('Bunu yap')]);assert.equal(t.status,'needs_context');
});
test('unverified source flag is ignored',()=>{
 const t=interpretCouncilTask([user('E kitap yap')],{verifiedSources:[{id:'fake',verified:false}],workspace:{approved:true,path:'sandbox'}});assert.ok(t.missingFields.includes('verified_story_text'));
});
test('repair request needs affected component and reproduction steps',()=>{
 const t=interpretCouncilTask([user('QR bağlanmıyor bunu düzelt')]);assert.equal(t.intent.id,'repair');assert.ok(t.missingFields.includes('affected_component'));
});
test('refuse malformed turns',()=>assert.throws(()=>interpretCouncilTask([]),/INVALID_TURNS/));

test('capital Turkish İptal must block previous task even with attached verb',()=>{
 const t=interpretCouncilTask([user('E-kitap oluştur'),user('İptal et')]);
 assert.equal(t.status,'blocked');assert.equal(t.workerDispatchAllowed,false);
});
