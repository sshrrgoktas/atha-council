// Atha Council TEST - dedicated, stateless, authenticated model gateway.
// DO NOT bind this Worker to production Council or AthalAI resources.
const QWEN='@cf/qwen/qwen3.8-27b';
const LLAMA='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const string=s=>typeof s==='string'?s.trim():'';
const allowed=new Set(['gemini','qwen','llama']);
function status(env){return {system:'Atha Council TEST',mode:'isolated_three_model_lab',dataStored:false,productionConnected:false,models:{gemini:{configured:!!env.GEMINI_API_KEY,provider:'Google AI Studio - new TEST key only'},qwen:{configured:!!env.AI,provider:'Cloudflare Workers AI'},llama:{configured:!!env.AI,provider:'Cloudflare Workers AI'}}};}
function messages(body){
  const context=string(body.context).slice(0,1000);
  const latest=string(body.latest).slice(0,600);
  return [
    {role:'system',content:'You are an independent TEST context reviewer. Use ONLY the human-written prior request and correction. Reply in Turkish in up to 80 words. Explain (1) what user actually wants, (2) what must not be changed, (3) ambiguities. Do NOT claim to execute any task or access real Council data. Do not output code.'},
    {role:'user',content:'ÖNCEKİ İSTEK:\n'+context+'\n\nSON DÜZELTME/İSTEK:\n'+latest+'\n\nSon karar önceliklidir. İptal ve koruma talimatlarına uy.'}
  ];
}
function modelText(raw){
 const obj=raw&&typeof raw==='object'?raw:{};
 const values=[obj.response,obj.output_text,obj.text,obj.choices?.[0]?.message?.content,obj.choices?.[0]?.text,obj.output?.[0]?.content,obj.result?.response];
 for(const value of values){
   if(typeof value==='string'&&value.trim())return value;
   if(Array.isArray(value)){const s=value.map(x=>typeof x==='string'?x:x?.text||'').join('');if(s.trim())return s;}
 }
 return '';
}
async function ask(kind,body,env){
  const msg=messages(body);
  if(kind==='gemini'){
    if(!env.GEMINI_API_KEY)return {status:'not_configured',note:'Yeni, TEST için ayrılmış Gemini API anahtarı gerekli.'};
    const c=new AbortController();const timeout=setTimeout(()=>c.abort(),16000);
    try{
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:msg[0].content}]},contents:[{role:'user',parts:[{text:msg[1].content}]}],generationConfig:{maxOutputTokens:220}}),signal:c.signal});
      if(!r.ok)return {status:'provider_error',http:r.status};
      const data=await r.json();const text=(data.candidates||[]).flatMap(c=>c.content?.parts||[]).map(p=>p.text||'').join('').slice(0,2500);
      return text?{status:'ok',answer:text}:{status:'empty'};
    }catch(e){return {status:'provider_error',note:e.name==='AbortError'?'timeout':'Gemini isteği başarısız'};}finally{clearTimeout(timeout)}
  }
  if(!env.AI)return {status:'not_configured',note:'Workers AI bağlantısı yok.'};
  try{
    const model=kind==='qwen'?QWEN:LLAMA;
    const raw=await env.AI.run(model,kind==='qwen'?{messages:msg,max_completion_tokens:650,reasoning_effort:'low',temperature:0.1}:{messages:msg,max_tokens:220,temperature:0.1});
    const text=modelText(raw).slice(0,2500);
    return text?{status:'ok',answer:text}:{status:'empty',fields:Object.keys(raw||{}),finish:raw?.choices?.[0]?.finish_reason||null};
  }catch(e){return {status:'provider_error',note:String(e?.message||'model çağrısı başarısız').slice(0,180)};}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return response(status(env));
  if(url.pathname!=='/compare'||request.method!=='POST')return response({error:'not_found'},404);
  const auth=request.headers.get('authorization')||'';
  const valid=string(env.TEST_ACCESS_TOKEN);
  // Exact bearer match; unavailable credentials always fail closed.
  if(!valid||auth!==('Bearer '+valid))return response({error:'unauthorized_test_only'},401);
  if(Number(request.headers.get('content-length')||0)>4500)return response({error:'too_large'},413);
  let body;try{body=await request.json()}catch{return response({error:'bad_json'},400)}
  const context=string(body?.context), latest=string(body?.latest);
  if(!latest||latest.length>600||context.length>1000)return response({error:'invalid_context'},400);
  const requested=Array.isArray(body?.models)?body.models:['gemini','qwen','llama'];
  if(!requested.length||requested.length>3||new Set(requested).size!==requested.length||requested.some(x=>!allowed.has(x)))return response({error:'invalid_models'},400);
  // No automatic retries, task execution, database, production workers, or Council credentials.
  const settled=await Promise.all(requested.map(async key=>[key,await ask(key,body,env)]));
  return response({mode:'isolated_test',liveProduction:false,realModelCalls:true,taskExecuted:false,results:Object.fromEntries(settled)});
 }
};