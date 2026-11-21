'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {councilLabTrial}=require('./council-lab-adapter.cjs');
const U=content=>({role:'user',speakerId:'human',content});
const approved={roomId:'c1795047764294qkem1',repo:'sshrrgoktas/atha-council',verifiedApprovalId:'approval_lab123456789',verifiedSources:[{id:'verified-story',verified:true}],workspace:{approved:true,path:'sandbox/isolated-book'}};
test('approved isolated ebook becomes a mock queue item, never a real dispatch',()=>{
 const r=councilLabTrial([U('Dijital çevrilebilir e-kitap yap'),U('Hadi yap')],approved);
 assert.equal(r.queue.accepted,true);
 assert.equal(r.queue.taskStatus,'simulated_queue_only');
 assert.equal(r.audit.claimReceivedByRealOpenCode,false);
 assert.equal(r.audit.workerExecuted,false);
 assert.equal(r.audit.liveCouncilModified,false);
 assert.equal(r.audit.athalAIModified,false);
});
test('no explicit verified approval blocks mocked submission',()=>{
 const r=councilLabTrial([U('Dijital çevrilebilir e-kitap yap')],{...approved,verifiedApprovalId:null});
 assert.equal(r.queue.accepted,false);
});
test('user cancellation blocks even after a prior approved task',()=>{
 const r=councilLabTrial([U('Dijital çevrilebilir e-kitap yap'),U('İptal et')],approved);
 assert.equal(r.queue.accepted,false);assert.ok(r.workOrder.blockers.includes('HUMAN_HOLD'));
});
test('AthalAI repository never accepted as target',()=>{
 const r=councilLabTrial([U('Dijital çevrilebilir e-kitap yap')],{...approved,repo:'sshrrgoktas/athalai'});
 assert.equal(r.queue.accepted,false);assert.ok(r.workOrder.blockers.includes('REPO_NOT_APPROVED'));
});
