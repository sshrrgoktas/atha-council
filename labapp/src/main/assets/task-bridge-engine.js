(function(){'use strict';
const units={};
units["./atha-task-bridge.cjs"]=function(module,require){
'use strict';

/**
 * Atha Task Bridge v1: pure, offline Council intent interpreter.
 * NO networking, database writes, model calls, worker dispatch or filesystem access.
 * AI messages are contextual suggestions, NEVER approval or proof of completion.
 */
const VAGUE=/^(?:(?:hadi|tamam|evet|olur|lütfen|canım|aşkım|balım|şimdi|artık|bi|bir|de|da|onu|bunu|şunu|oraya|oradan|yine|aynı|eskisi|gibi|hemen|yap|et|başla|devam|geri|dön|düzelt|aktar|kaydet|gönder|istiyorum|sen|bana|da|bari|hayır|yok|yapınca|yaptım|diye|söyle|gel|git|bekliyorum|nerde|nerede|nereye|olsun|olsunlar|bunu|onları|yapma|dokunma|sakın|sadece|önce|sonra|biraz|aynen|çalıştır|test|et|edelim|yapalım|yapın)[\s.,!?]*)+$/iu;
const STOP=/(?:^|[\s.,!?])(?:dur|durdur|iptal|vazgeç|silme|dokunma|yapma|bozma)(?=$|[\s.,!?])/iu;
const ACTION=/\b(?:oluştur|hazırla|yap|dönüştür|ekle|düzelt|geliştir|kur|test et|çalıştır|aktar|kaydet|yayınla|sil|kaldır|güncelle)\b/iu;
const TASK_SIGNALS=[
 {id:'ebook',regex:/e[ -]?kitap|sayfa(?:ları)? (?:çevir|çevril)|kitab[ıa] dönüştür/iu,objective:'Kaynak hikâyeden çevrilebilir sayfalı dijital e-kitap hazırla',deliverables:['Mobil uyumlu HTML/CSS/JavaScript e-kitap','İleri/geri sayfa kontrolleri ve sayfa numarası','Kaynak metne sadık içerik'],missing:['verified_story_text','target_workspace']},
 {id:'repair',regex:/\b(?:bozuk|hata|çalışmıyor|düzelt|onar|bağlanmıyor)\b/iu,objective:'Belirtilen hatayı mevcut çalışan özellikleri koruyarak incele ve düzeltme taslağı hazırla',deliverables:['Tekrarlanabilir hata açıklaması','Hedefe yönelik düzeltme taslağı','Geri alma ve regresyon testleri'],missing:['affected_component','reproduction_steps']},
 {id:'generic',regex:ACTION,objective:'Açıkça belirtilen kullanıcı isteği için uygulanabilir görev taslağı oluştur',deliverables:['Görev tanımı','Hedef dosyalar ve kapsam','Doğrulama planı'],missing:['target_workspace','acceptance_criteria']}
];
function clean(s){return typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,4000):''}
function human(t){return t && (t.role==='user'||t.speakerId==='human')}
function model(t){return t && (t.role==='assistant'||t.role==='model')&&!human(t)}
function meaningful(s){return s.length>=18&&!VAGUE.test(s)}
function findIntent(turns){
 const humans=turns.filter(human).map(t=>clean(t.content)).filter(Boolean);
 const latest=humans.at(-1)||'';
 const explicit=[...humans].reverse().find(s=>meaningful(s)&&TASK_SIGNALS.some(p=>p.regex.test(s)));
 return {latest,anchor:explicit||null,history:humans};
}
function interpretCouncilTask(turns,options={}){
 if(!Array.isArray(turns)||turns.length===0||turns.length>200)throw Error('INVALID_TURNS');
 const records=turns.filter(t=>t&&typeof t==='object').slice(-80);
 const {latest,anchor}=findIntent(records);
 if(!latest)return {schemaVersion:1,status:'needs_context',reason:'NO_HUMAN_REQUEST',readyForApproval:false};
 const lastStop=STOP.test(latest.toLocaleLowerCase('tr-TR'))&&!/(?:yapma (?:demiyorum|dediğim)|yapma,? (?:bunu|şunu) değil)/iu.test(latest);
 if(lastStop)return {schemaVersion:1,status:'blocked',reason:'USER_STOP_OR_PROTECTION',latestUserMessage:latest,readyForApproval:false,workerDispatchAllowed:false};
 const source=anchor||latest;
 const profile=TASK_SIGNALS.find(p=>p.id!=='generic'&&p.regex.test(source))||TASK_SIGNALS.find(p=>p.id==='generic'&&p.regex.test(source));
 if(!profile)return {schemaVersion:1,status:'needs_context',reason:'NO_CONCRETE_ACTION',latestUserMessage:latest,readyForApproval:false,workerDispatchAllowed:false};
 const modelClaims=records.filter(model).map(t=>clean(t.content)).filter(Boolean).slice(-8);
 const sourceRefs=Array.isArray(options.verifiedSources)?options.verifiedSources.filter(s=>s&&s.verified===true&&typeof s.id==='string').map(s=>s.id.slice(0,120)):[];
 const workspace=options.workspace && options.workspace.approved===true ? clean(options.workspace.path):null;
 const missing=profile.missing.filter(x=>
  x==='verified_story_text'?!sourceRefs.length:
  x==='target_workspace'?!workspace:
  x==='affected_component'?!clean(options.affectedComponent):
  x==='reproduction_steps'?!clean(options.reproductionSteps):
  x==='acceptance_criteria'?!Array.isArray(options.acceptanceCriteria)||!options.acceptanceCriteria.length:true);
 const intentProfile={id:profile.id,objective:profile.objective,deliverables:profile.deliverables};
 const accepted=Array.isArray(options.acceptanceCriteria)?options.acceptanceCriteria.map(clean).filter(Boolean).slice(0,12):[];
 const confidence=anchor?0.85:0.6;
 const task={
  schemaVersion:1,taskType:'draft_only',intent:intentProfile,
  originalUserMessage:latest,resolvedFromUserMessage:source,
  evidence:{humanMessages:records.filter(human).length,unverifiedModelClaims:modelClaims.length,verifiedSourceIds:sourceRefs},
  constraints:['Do not modify live Council, AthalAI, mobile apps or active tunnel','Only owner-approved isolated workspaces','No automatic deploy, merge, push or paid API use','Do not claim tests were executed without test evidence'],
  workspace:workspace||null,acceptanceCriteria:accepted.length?accepted:profile.deliverables.map(x=>'Doğrula: '+x),
  missingFields:missing,
  interpretationConfidence:confidence,
  status:missing.length?'needs_context':'ready_for_human_review',
  readyForApproval:missing.length===0,
  workerDispatchAllowed:false,
  summary:profile.objective,
  agentHandoffPrompt:'Amaç: '+profile.objective+'\nBağlam (kullanıcının mesajı): '+source+'\nKabul kriterleri: '+(accepted.length?accepted:profile.deliverables).join('; ')+'\nEksikler: '+(missing.join(', ')||'yok')+'\nÇalışma alanı: '+(workspace||'DOĞRULANMADI')+'\nÖNEMLİ: Bu yalnız taslaktır. Kullanıcı onayı olmadan görev yürütme. Diğer modellerin tamamlandı iddialarını çıktı kanıtı sayma.'
 };
 return task;
}
module.exports={interpretCouncilTask};

};
units["./decision-memory.cjs"]=function(module,require){
'use strict';

/**
 * Experimental in-memory Council decision reconciliation.
 * Pure function: no database, network, tools, worker execution, or persistent memory.
 * Only human turns may set preferences, corrections, or constraints.
 * Assistant turns are NEVER promoted to human decisions.
 */
const NORMALIZE=s=>typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,2000):'';
const HUMAN=t=>t&&(t.role==='user'||t.speakerId==='human');
const STOP=/(?:^|[\s,.!?])(?:dur|durdur|vazgeç|iptal|sakın|dokunma|bozma|silme|yapma)(?=$|[\s,.!?])/iu;
const REPLACEMENT=/(?:onu değil|bunu değil|öyle değil|yanlış|vazgeçtim|fikrimi değiştirdim|yerine|önceki sürüm|eskisi gibi|son kararım|bundan sonra|olmasın|istemiyorum)/iu;
const GENERIC=/^(?:tamam|evet|hadi|yap|yapalım|aynı|eskisi gibi|olur|peki|hayır|onu değil|bunu değil)[.!?\s]*$/iu;
const PROTECTED=/(?:canlı|mevcut|çalışan|tünel|apk|athalai|uygulama|eski sürüm|önceki sürüm)/iu;
const ISOLATION=/(?:ayrı|izole|test ortamı|test dalı|dokunma|bozma|değiştirme|koru)/iu;
const SUBJECTS=[
 {key:'opencode_role',match:/(?:opencode)/iu},
 {key:'council',match:/(?:konsey|council)/iu},
 {key:'athalai',match:/(?:athalai|tünel|apk|qr|pc uygulama)/iu},
 {key:'ebook',match:/(?:e[ -]?kitap|sayfa çevir|hikaye)/iu},
 {key:'bridge',match:/(?:task bridge|köprü|prompt|istem|bağlam)/iu}
];
const REFS=/(?:onu|bunu|şunu|öyle|eskisi|önceki|aynı)/iu;
function identify(s){return SUBJECTS.filter(a=>a.match.test(s)).map(a=>a.key)}
function makeLedger(turns,{roomId=null}={}){
 if(!Array.isArray(turns)||turns.length>200)throw Error('INVALID_TURNS');
 const humanTurns=turns.map((t,index)=>({...t,_index:index})).filter(HUMAN)
  .map(t=>({index:t._index,id:typeof t.id==='string'?t.id:null,text:NORMALIZE(t.content)})).filter(x=>x.text);
 const events=[],issues=[];
 let previousScope=null;
 for(const msg of humanTurns){
  const subjects=identify(msg.text),correction=REPLACEMENT.test(msg.text), stop=STOP.test(msg.text.toLocaleLowerCase('tr-TR'));
  const vague=GENERIC.test(msg.text) || (REFS.test(msg.text)&&subjects.length===0);
  let scope=subjects;
  if(!scope.length && (correction||stop) && previousScope)scope=[previousScope];
  const needsClarification=(correction||vague)&&(!scope.length||GENERIC.test(msg.text));
  if(needsClarification){
   issues.push({messageIndex:msg.index,kind:'ambiguous_reference',messageId:msg.id,detail:'Human referent or requested replacement is not explicit'});
  }
  if(!scope.length)continue;
  if(subjects.length===1)previousScope=subjects[0];
  const kind=stop?'hold':correction?'correction':ISOLATION.test(msg.text)&&PROTECTED.test(msg.text)?'constraint':'request';
  for(const subject of scope)events.push({
   kind,subject,text:msg.text,messageIndex:msg.index,messageId:msg.id,
   requiresClarification:needsClarification,provenance:'human',
   ...(kind==='constraint'?{protectsLiveSystem:true}:{})
  });
 }
 const latestBySubject={};
 for(const ev of events){
  if(ev.requiresClarification)continue;
  latestBySubject[ev.subject]=ev;
 }
 const holds=[...new Set(events.filter(e=>e.kind==='hold').map(e=>e.subject))];
 const pendingCorrections=events.filter(e=>e.kind==='correction'&&e.requiresClarification);
 return {
  schemaVersion:2,roomId:typeof roomId==='string'?roomId:null,
  source:'human_turns_only',events,latestBySubject,
  issues,pendingCorrections,
  protectedScopes:events.filter(e=>e.kind==='constraint'&&e.protectsLiveSystem).map(e=>e.subject),
  holds,
  executionAllowed:false,requiresHumanApproval:true
 };
}
function sharedHandoff(ledger,latestRequest){
 if(!ledger||ledger.source!=='human_turns_only')throw Error('INVALID_LEDGER');
 const safe=Object.entries(ledger.latestBySubject).map(([subject,e])=>({subject,kind:e.kind,decision:e.text,messageIndex:e.messageIndex,source:'human'}));
 const ambiguous=ledger.issues.map(i=>({kind:i.kind,messageIndex:i.messageIndex}));
 return {
  schemaVersion:2,originalRequest:NORMALIZE(latestRequest),
  authoritativeDecisions:safe,unresolvedReferences:ambiguous,
  warning:'This packet is a context interpretation, not an instruction to execute; AI messages are unverified. Ask user when ambiguous.',
  dispatchAllowed:false,
  mustNot:['modify live AthalAI or Council','execute tools without explicit task approval','interpret model assertions as completion evidence']
 };
}
module.exports={makeLedger,sharedHandoff};

};
units["./shadow-review.cjs"]=function(module,require){
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

};
units["./opencode-handoff-contract.cjs"]=function(module,require){
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

};
const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(units,name))throw Error('MODULE_NOT_ALLOWED');if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;units[name](m,require);return m.exports;}
window.AthaLab=Object.assign({},require('./atha-task-bridge.cjs'),require('./decision-memory.cjs'),require('./shadow-review.cjs'),require('./opencode-handoff-contract.cjs'));})();