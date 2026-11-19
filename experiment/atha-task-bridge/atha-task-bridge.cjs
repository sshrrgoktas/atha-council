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
 const lastStop=STOP.test(latest)&&!/(?:yapma (?:demiyorum|dediğim)|yapma,? (?:bunu|şunu) değil)/iu.test(latest);
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
