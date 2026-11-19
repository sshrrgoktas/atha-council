'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {shadowReview}=require('./shadow-review.cjs');
const user=content=>({role:'user',speakerId:'human',content});
const ai=content=>({role:'assistant',speakerId:'gemini',content});
test('shadow output compares shorthand with source and cannot dispatch',()=>{
 const r=shadowReview([user('Dijital çevrilebilir e-kitap oluştur'),ai('E-kitap hazır'),user('Hadi yap')]);
 assert.equal(r.mode,'shadow_read_only');assert.equal(r.original,'Hadi yap');
 assert.equal(r.inferred.task,'Kaynak hikâyeden çevrilebilir sayfalı dijital e-kitap hazırla');
 assert.equal(r.dispatchAllowed,false);assert.equal(r.executionAllowed,false);
 assert.ok(r.reasons.includes('verified_story_text'));
});
test('ambiguous correction requires clarification',()=>{
 const r=shadowReview([user('Konseyi test ortamında kur'),user('Eskisi gibi')]);
 assert.equal(r.needsHumanClarification,true);assert.ok(r.reasons.includes('ambiguous_reference'));
});
test('protect live app in shadow mode',()=>{
 const r=shadowReview([user('AthalAI tüneline dokunma')]);
 assert.equal(r.executionAllowed,false);assert.ok(r.reasons.includes('human_stop_or_protect'));
});
