'use strict';
// Experimental isolated Council dispatch adapter. No host bridge, no networking or persistence.
// Upstream token/room validation must be provided by a trusted server in future.
const {prepareOpenCodeHandoff,simulatedQueueAcceptance}=require('./opencode-handoff-contract.cjs');
const {shadowReview}=require('./shadow-review.cjs');

function councilLabTrial(turns,options={}){
 const shadow=shadowReview(turns,options);
 const handoff=prepareOpenCodeHandoff(turns,options);
 const review=simulatedQueueAcceptance(handoff);
 return {
  lab:true,councilIsolated:true,mode:'offline_mock',
  shadow,workOrder:handoff,
  queue:review,
  audit:{
   requestedByHuman:true,
   validatedByRealCouncilServer:false,
   claimReceivedByRealOpenCode:false,
   workerExecuted:false,
   fileArtifactVerified:false,
   liveCouncilModified:false,
   athalAIModified:false,
   tunnelModified:false
  }
 };
}
module.exports={councilLabTrial};
