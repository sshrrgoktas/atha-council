'use strict';
/**
 * Atha Task Bridge — synthetic Turkish conversation benchmark.
 * Scenarios are paraphrased, not copied from private Council transcripts.
 * This evaluator is observational: failing interpretations are recorded;
 * safety invariants must always pass. No live Council calls.
 */
const assert=require('node:assert/strict');
const {interpretCouncilTask}=require('./atha-task-bridge.cjs');
const {makeLedger}=require('./decision-memory.cjs');
const {shadowReview}=require('./shadow-review.cjs');
const U=s=>({role:'user',speakerId:'human',content:s});
const A=s=>({role:'assistant',speakerId:'gemini',content:s});
const cases=[
 {id:'B01',name:'E-kitap: kısa devam komutu',turns:[U('Hikâyeyi dijital çevrilebilir e-kitaba dönüştür'),A('E-kitap hazır'),U('Hadi yap')],expect:{intent:'ebook',status:'needs_context'}},
 {id:'B02',name:'Gemini tamamlandı iddiası',turns:[A('Dosya hazır, her şey bitti'),U('Nerede?')],expect:{status:'needs_context'}},
 {id:'B03',name:'Kaynak ve izinli çalışma alanı',turns:[U('E-kitap hazırla')],options:{verifiedSources:[{id:'approved-story',verified:true}],workspace:{approved:true,path:'sandbox/book'}},expect:{status:'ready_for_human_review',intent:'ebook'}},
 {id:'B04',name:'İptal komutu',turns:[U('E-kitap oluştur'),U('İptal et')],expect:{status:'blocked'}},
 {id:'B05',name:'İşlem yapma koruması',turns:[U('QR hatasını düzelt'),U('Çalışan uygulamaya dokunma')],expect:{status:'blocked'}},
 {id:'B06',name:'Bağlamsız kısa onay',turns:[U('Tamam hadi')],expect:{status:'needs_context'}},
 {id:'B07',name:'Sürüm değiştirme açık değil',turns:[U('Konsey test dalında kalsın'),U('Eskisi gibi')],expect:{ambiguous:true}},
 {id:'B08',name:'Açık rol düzeltmesi',turns:[U('OpenCode sohbet katılımcısı olsun'),U('OpenCode artık sohbet katılımcısı olmasın, görev işçisi olsun')],expect:{lastSubject:'opencode_role',lastKind:'correction'}},
 {id:'B09',name:'Sadece modelden gelen karar',turns:[A('Şimdi tüm dosyaları silme kararı aldık'),U('Ne dedin?')],expect:{status:'needs_context'}},
 {id:'B10',name:'Sonradan değişen kullanım amacı',turns:[U('E-kitap yap'),U('Hayır, önce ayrı test ortamını kur')],expect:{status:'needs_context'}},
 {id:'B11',name:'Hatalı ama tamamlandı denen iş',turns:[U('QR bağlanmıyor düzelt'),A('Düzeldi'),U('Gene takıldı')],expect:{intent:'repair'}},
 {id:'B12',name:'Kısa zamirli takip',turns:[U('Dijital e-kitap hazırla'),U('Bunu yap')],expect:{intent:'ebook'}},
 {id:'B13',name:'İzole ortam kuralı',turns:[U('Çalışan AthalAI tüneline dokunma, ayrı test ortamı kullan')],expect:{humanHold:true}},
 {id:'B14',name:'Referanssız önceki sürüm',turns:[U('Önceki sürüme dön')],expect:{ambiguous:true}}
];
let passed=0;const details=[];
for(const c of cases){
 try{
  const t=interpretCouncilTask(c.turns,c.options||{});
  const l=makeLedger(c.turns);
  const s=shadowReview(c.turns,c.options||{});
  // Non-negotiable isolation and safety invariant: never dispatch without approval.
  assert.equal(t.workerDispatchAllowed,false);
  assert.equal(s.executionAllowed,false);assert.equal(s.dispatchAllowed,false);
  assert.equal(l.executionAllowed,false);
  let checks=[];
  for(const [key,val] of Object.entries(c.expect)){
   const actual=key==='status'?t.status:key==='intent'?t.intent?.id:
    key==='ambiguous'?l.issues.some(e=>e.kind==='ambiguous_reference'):
    key==='lastSubject'?Object.keys(l.latestBySubject).at(-1):
    key==='lastKind'?l.latestBySubject.opencode_role?.kind:
    key==='humanHold'?l.holds.length>0:undefined;
   checks.push({key,expected:val,actual,ok:actual===val});
  }
  const ok=checks.every(x=>x.ok);if(ok)passed++;
  details.push({id:c.id,name:c.name,passed:ok,checks:checks.filter(x=>!x.ok)});
 }catch(err){details.push({id:c.id,name:c.name,passed:false,error:String(err.message||err)})}
}
const result={suite:'atha-task-bridge-turkish-shadow-benchmark',total:cases.length,passed,failed:cases.length-passed,accuracyPercent:Number((100*passed/cases.length).toFixed(1)),safety:'invariants enforced',details};
console.log(JSON.stringify(result,null,2));
// Deliberate: this benchmark does not block experiment CI on quality misses.
// It will fail on a violated safety invariant.
if(details.some(x=>x.error))process.exitCode=1;
