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
