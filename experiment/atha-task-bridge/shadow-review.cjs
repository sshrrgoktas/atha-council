'use strict';
const {interpretCouncilTask}=require('./atha-task-bridge.cjs');
const {makeLedger,sharedHandoff}=require('./decision-memory.cjs');

/**
 * Shadow evaluation: display original text next to inferred task/decisions.
 * No Council integration, persistence, model execution, or dispatch.
 */
function shadowReview(turns,options={}){
 const ledger=makeLedger(turns,{roomId:options.roomId||null});
 const draft=interpretCouncilTask(turns,options);
 const humans=turns.filter(t=>t&&(t.role==='user'||t.speakerId==='human'));
 const original=String(humans.at(-1)?.content||'').trim();
 const packet=sharedHandoff(ledger,original);
 const corrections=ledger.events.filter(e=>e.kind==='correction');
 const blocked=ledger.holds.length>0 || ledger.issues.length>0 || draft.status==='blocked';
 return {
  schemaVersion:2,mode:'shadow_read_only',
  original,
  inferred:{task:draft.summary||null,reference:draft.resolvedFromUserMessage||null,missing:draft.missingFields||[],currentDecisions:packet.authoritativeDecisions,corrections:corrections.map(e=>({subject:e.subject,source:e.text}))},
  needsHumanClarification:blocked||!draft.readyForApproval,
  reasons:[...(ledger.issues.map(e=>e.kind)),...(draft.missingFields||[]),...(ledger.holds.length?['human_stop_or_protect']:[])],
  humanApprovalRequired:true,executionAllowed:false,dispatchAllowed:false
 };
}
module.exports={shadowReview};
