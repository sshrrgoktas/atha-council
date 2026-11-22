'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareOpenCodeHandoff,simulatedQueueAcceptance}=require('./opencode-handoff-contract.cjs');
const user=content=>({role:'user',speakerId:'human',content});
const source={id:'ebook-approved-story',verified:true};
const base={roomId:'c1795047764294qkem1',repo:'sshrrgoktas/atha-council',verifiedApprovalId:'approval_test_123456789',verifiedSources:[source],workspace:{approved:true,path:'sandbox/ebook'}};
test('approved complete task produces a safe packet, not a real work action',()=>{
 const h=prepareOpenCodeHandoff([user('Çevrilebilir e-kitap yap')],base);
 assert.equal(h.status,'eligible_for_server_validation');assert.match(h.proposedPayload.request,/e-kitap/);
 assert.equal(h.actualDispatch,false);assert.equal(h.workerStarted,false);
 const q=simulatedQueueAcceptance(h);assert.equal(q.accepted,true);assert.equal(q.executed,false);assert.equal(q.artifactCreated,false);
});
test('without verified owner approval no OpenCode handoff',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap')],{...base,verifiedApprovalId:null});
 assert.ok(h.blockers.includes('APPROVAL_NOT_VERIFIED'));assert.equal(simulatedQueueAcceptance(h).accepted,false);
});
test('wrong Council room blocks',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap')],{...base,roomId:null});
 assert.ok(h.blockers.includes('ROOM_NOT_VERIFIED'));assert.equal(h.actualDispatch,false);
});
test('missing source prevents code assignment',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap')],{...base,verifiedSources:[]});
 assert.ok(h.blockers.includes('DRAFT_NOT_READY'));
});
test('stop takes precedence even when approval supplied',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap'),user('İptal et')],base);
 assert.ok(h.blockers.includes('DRAFT_NOT_READY'));assert.ok(h.blockers.includes('HUMAN_HOLD'));
});
test('ambiguous correction cannot be sent as executable work',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap'),user('Eskisi gibi')],base);
 assert.ok(h.blockers.includes('AMBIGUOUS_DECISION'));
});
test('different repository is disallowed even with all other approvals',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap')],{...base,repo:'sshrrgoktas/athalai'});
 assert.ok(h.blockers.includes('REPO_NOT_APPROVED'));
});
test('agent claims are not approvals',()=>{
 const h=prepareOpenCodeHandoff([user('E-kitap yap'),{role:'assistant',speakerId:'gemini',content:'onaylandı, dosya oluşturuldu'}],{...base,verifiedApprovalId:undefined});
 assert.ok(h.blockers.includes('APPROVAL_NOT_VERIFIED'));
});
