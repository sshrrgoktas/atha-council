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

// Dedicated TEST task broker. All task records live ONLY in the isolated TASKS KV.
// Read-only OpenCode agent; no live repo edits, publishing, or shell commands from users.
const taskPrefix='opencode-lab:';
const validTaskId=id=>typeof id==='string'&&/^lab_[a-f0-9-]{36}$/.test(id);
const safeJson=async r=>{try{return await r.json()}catch{return null}};
const isOwner=(r,env)=>!!env.TEST_ACCESS_TOKEN&&r.headers.get('authorization')==='Bearer '+env.TEST_ACCESS_TOKEN;
const isAgent=(r,env)=>!!env.TEST_OPENCODE_AGENT_TOKEN&&r.headers.get('authorization')==='Agent '+env.TEST_OPENCODE_AGENT_TOKEN;
async function taskRoutes(request,env,path){
  if(!env.TASKS)return response({error:'test_queue_not_configured'},503);
  const owner=path.startsWith('/task/');
  if(owner?!isOwner(request,env):!isAgent(request,env))return response({error:'unauthorized_test_only'},401);
  if(Number(request.headers.get('content-length')||0)>3300)return response({error:'too_large'},413);
  const body=request.method==='POST'?await safeJson(request):null;
  if(request.method==='POST'&&!body)return response({error:'bad_json'},400);
  if(path==='/task/create'&&request.method==='POST'){
    const context=string(body.context),latest=string(body.latest);
    if(!body.ownerApproved||body.confirm!=='SEND_TO_TEST_OPENCODE'||!latest||latest.length>600||context.length>1000)
      return response({error:'approval_or_context_missing'},400);
    if(body.mode!=='read_only_plan')return response({error:'only_read_only_plan_supported'},400);
    // Never queue into any Council production room, repo or existing agent.
    const id='lab_'+crypto.randomUUID();
    const task={schemaVersion:1,id,mode:'read_only_plan',status:'queued',context,latest,scope:'separate-test-workspace-only',createdAt:new Date().toISOString(),ownerApproved:true};
    await env.TASKS.put(taskPrefix+id,JSON.stringify(task),{expirationTtl:86400});
    return response({id,status:'queued',mode:task.mode,agentStarted:false,productionTouched:false},201);
  }
  if(path==='/task/status'&&request.method==='POST'){
    const id=body.id;
    if(!validTaskId(id))return response({error:'invalid_task_id'},400);
    const task=await env.TASKS.get(taskPrefix+id,'json');
    if(!task)return response({error:'not_found'},404);
    const {context,latest,claimId,...publicTask}=task;
    return response(publicTask);
  }
  if(path==='/agent/claim'&&request.method==='POST'){
    const keys=await env.TASKS.list({prefix:taskPrefix,limit:30});
    for(const item of keys.keys){
      const task=await env.TASKS.get(item.name,'json');
      if(!task||task.status!=='queued'||task.mode!=='read_only_plan')continue;
      task.status='claimed';task.claimId=crypto.randomUUID();task.claimedAt=new Date().toISOString();
      await env.TASKS.put(item.name,JSON.stringify(task),{expirationTtl:86400});
      return response({task:{id:task.id,mode:task.mode,context:task.context,latest:task.latest,scope:task.scope,claimId:task.claimId}});
    }
    return response({task:null});
  }
  if(path==='/agent/report'&&request.method==='POST'){
    if(!validTaskId(body.id)||typeof body.claimId!=='string')return response({error:'invalid_claim'},400);
    const task=await env.TASKS.get(taskPrefix+body.id,'json');
    if(!task||task.status!=='claimed'||task.claimId!==body.claimId)return response({error:'not_claimed'},409);
    const exitCode=Number.isInteger(body.exitCode)?body.exitCode:null;
    task.status=exitCode===0?'reported_unverified':'agent_error';
    task.result={exitCode,summary:string(body.summary).slice(0,1200),evidence:string(body.evidence).slice(0,2000),
      verification:'Agent-reported only; no independent file verification or production changes'};
    task.reportedAt=new Date().toISOString();
    await env.TASKS.put(taskPrefix+task.id,JSON.stringify(task),{expirationTtl:86400});
    return response({accepted:true,id:task.id,status:task.status,verified:false});
  }
  return response({error:'not_found'},404);
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return response(status(env));
  if(url.pathname.startsWith('/task/')||url.pathname.startsWith('/agent/'))return taskRoutes(request,env,url.pathname);
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