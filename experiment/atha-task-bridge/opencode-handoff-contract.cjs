'use strict';
/**
 * Test-only OpenCode work-order contract. Never sends network requests or runs OpenCode.
 * This checks whether a Council interpretation can become a reviewable task packet.
 * Only a separately verified user approval may authorize a future real dispatch.
 */
const {interpretCouncilTask}=require('./atha-task-bridge.cjs');
const {makeLedger}=require('./decision-memory.cjs');

function prepareOpenCodeHandoff(turns,options={}){
 const draft=interpretCouncilTask(turns,options);
 const ledger=makeLedger(turns,{roomId:options.roomId||null});
 const blockers=[];
 if(draft.status!=='ready_for_human_review')blockers.push('DRAFT_NOT_READY');
 if(ledger.holds.length)blockers.push('HUMAN_HOLD');
 if(ledger.issues.length)blockers.push('AMBIGUOUS_DECISION');
 if(typeof options.roomId!=='string'||!/^c[\w-]{8,}$/.test(options.roomId))blockers.push('ROOM_NOT_VERIFIED');
 if(typeof options.repo!=='string'||options.repo!=='sshrrgoktas/atha-council')blockers.push('REPO_NOT_APPROVED');
 if(typeof options.verifiedApprovalId!=='string'||!/^approval_[A-Za-z0-9_-]{8,}$/.test(options.verifiedApprovalId))blockers.push('APPROVAL_NOT_VERIFIED');
 const safe=blockers.length===0;
 return {
  schemaVersion:1,mode:'offline_mock',status:safe?'eligible_for_server_validation':'blocked',
  taskSummary:draft.summary||null,roomId:options.roomId||null,
  approvalId:safe?options.verifiedApprovalId:null,
  proposedPayload:safe?{room_id:options.roomId,repo:options.repo,
   request:draft.agentHandoffPrompt,approval_receipt:options.verifiedApprovalId}:null,
  blockers,actualDispatch:false,workerStarted:false,networkUsed:false
 };
}
function simulatedQueueAcceptance(handoff){
 if(handoff?.mode!=='offline_mock'||handoff.status!=='eligible_for_server_validation'||!handoff.proposedPayload){
  return {accepted:false,reason:'BLOCKED',executed:false};
 }
 return {accepted:true,reason:'MOCK_ACCEPTED_NOT_SENT',executed:false,
  artifactCreated:false,taskStatus:'simulated_queue_only'};
}
module.exports={prepareOpenCodeHandoff,simulatedQueueAcceptance};
