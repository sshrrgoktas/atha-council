// Atha Council TEST - dedicated, stateless, authenticated model gateway.
// DO NOT bind this Worker to production Council or AthalAI resources.
const QWEN='@cf/qwen/qwen3.8-27b';
const LLAMA='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const string=s=>typeof s==='string'?s.trim():'';
const allowed=new Set(['gemini','qwen','llama']);
function status(env){return {system:'Atha Council TEST',mode:'isolated_three_model_lab',dataStored:!!env.TASKS,storageScope:'separate_TEST_KV_24h',productionConnected:false,models:{gemini:{configured:!!env.GEMINI_API_KEY,provider:'Google AI Studio - new TEST key only'},qwen:{configured:!!env.AI,provider:'Cloudflare Workers AI'},llama:{configured:!!env.AI,provider:'Cloudflare Workers AI'}}};}
function messages(body,kind){
  const context=string(body.context).slice(0,1000);
  const latest=string(body.latest).slice(0,600);
  // Task Bridge stays backstage. The models are conversational Council members,
  // NOT prompt evaluators, intent classifiers or OpenCode task runners.
  const identity=kind==='qwen'?'Qwen':kind==='llama'?'Llama':'Gemini';
  const system=[
    'Your name is '+identity+'. You are NOT any of the other models. The human interlocutor is the user, other model messages are authored by their own named speakers.',
    'Never refer to yourself as a different model, thank yourself as a third person, or attribute another model\'s words to yourself.',
    'If another model is mentioned, distinguish their name from yours; do not claim to be them.',
    'You are a friendly, natural member of an isolated Atha Council TEST group chat.',
    'Speak Turkish conversationally and directly as the person being addressed, not as an analyst.',
    'If the user says hello, greet them naturally. If they joke or complain, respond naturally with empathy or gentle humour.',
    'Do NOT output numbered analysis, intent reports, checklists, sections like "Kullanıcı ne istiyor?" or "Belirsizlikler", unless explicitly requested.',
    'Use the preceding chat only to understand context; address the LATEST user message.',
    'Follow the user\'s latest corrections, and preserve explicit instructions such as not changing the main Council or AthalAI.',
    'Do not claim to have performed tool calls, code changes, or OpenCode work.',
    'For an ambiguous consequential task, ask one brief clarifying question rather than assuming approval.',
    'Keep casual replies short (usually one to three sentences), without stock disclaimers.'
  ].join(' ');
  const user=context?
    'Önceki konuşma (yalnızca bağlam; yeni bir görev değil):\n'+context+
    '\n\nSon kullanıcı mesajı (buna doğal biçimde yanıt ver):\n'+latest:
    latest;
  return [{role:'system',content:system},{role:'user',content:user}];
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
  const msg=messages(body,kind);
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
// Public-key verification avoids copying any Council or TEST owner secret to the PC agent.
// This public key belongs only to C:/Users/seher/Documents/AthaCouncil-TaskBridge-TEST/agent-private.pem.
const labAgentPublicX='kwPy4-ddR0lkIMgnwQ8Kd5Elal0cxfPH6E4BUOcFx6o';
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const base64url=arr=>btoa(String.fromCharCode(...new Uint8Array(arr))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function isAgent(r,env,path){
 if(!env.TASKS)return false;
 const when=r.headers.get('x-test-time')||'',nonce=r.headers.get('x-test-nonce')||'',sig=r.headers.get('x-test-signature')||'';
 if(!/^\d{13}$/.test(when)||Math.abs(Date.now()-Number(when))>90000||!/^[a-f0-9-]{36}$/.test(nonce)||!sig)return false;
 const data=await r.clone().text();
 if(data.length>3200)return false;
 const digest=base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)));
 const signed='POST\n'+path+'\n'+when+'\n'+nonce+'\n'+digest;
 try{
   const key=await crypto.subtle.importKey('jwk',{kty:'OKP',crv:'Ed25519',x:labAgentPublicX},'Ed25519',false,['verify']);
   const ok=await crypto.subtle.verify('Ed25519',key,bytes(sig),new TextEncoder().encode(signed));
   if(!ok)return false;
   const replay='test-agent-nonce:'+nonce;
   if(await env.TASKS.get(replay))return false;
   await env.TASKS.put(replay,'1',{expirationTtl:180});
   return true;
 }catch{return false}
}
async function taskRoutes(request,env,path){
  if(!env.TASKS)return response({error:'test_queue_not_configured'},503);
  const owner=path.startsWith('/task/');
  if(owner?!isOwner(request,env):!(await isAgent(request,env,path)))return response({error:'unauthorized_test_only'},401);
  if(Number(request.headers.get('content-length')||0)>4200)return response({error:'too_large'},413);
  const body=request.method==='POST'?await safeJson(request):null;
  if(request.method==='POST'&&!body)return response({error:'bad_json'},400);
  if(path==='/task/create'&&request.method==='POST'){
    const context=string(body.context),latest=string(body.latest);
    if(!body.ownerApproved||body.confirm!=='SEND_TO_TEST_OPENCODE'||!latest||latest.length>600||context.length>1000)
      return response({error:'approval_or_context_missing'},400);
    if(body.mode!=='read_only_plan')return response({error:'only_read_only_plan_supported'},400);
    // Never queue into any Council production room, repo or existing agent.
    const id='lab_'+crypto.randomUUID();
    const proposed=body.review&&typeof body.review==='object'?body.review:{};
    const review={inferredTask:string(proposed.inferredTask).slice(0,230),
      sourceReference:string(proposed.sourceReference).slice(0,230),
      humanDecisions:Array.isArray(proposed.humanDecisions)?proposed.humanDecisions.slice(0,2).map(d=>string(d).slice(0,150)):[]};
    const task={schemaVersion:1,id,mode:'read_only_plan',status:'queued',context,latest,review,scope:'separate-test-workspace-only',createdAt:new Date().toISOString(),ownerApproved:true};
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
      return response({task:{id:task.id,mode:task.mode,context:task.context,latest:task.latest,scope:task.scope,review:task.review,claimId:task.claimId}});
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


const OPEN_CODE_PROBE='Atha Council TEST connection probe. Do not open, create, edit, or delete files. Do not use tools. Reply with exactly ATHA_LAB_OPENCODE_OK.';
const authAgent=(request,env)=>!!env.LAB_AGENT_TOKEN&&request.headers.get('x-lab-agent-token')===env.LAB_AGENT_TOKEN;
async function agentEndpoint(request,env,url) {
 if(!authAgent(request,env))return response({error:'agent_unauthorized'},401);
 if(!env.LAB_DB)return response({error:'lab_db_missing'},503);
 const path=url.pathname;
 if(path==='/opencode/heartbeat') {
  await env.LAB_DB.prepare('INSERT INTO agent_status(name,state,last_seen,detail) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET state=excluded.state,last_seen=excluded.last_seen,detail=excluded.detail').bind('opencode','online',Date.now(),'LAB-only safe agent').run();
  return response({ok:true});
 }
 if(path==='/opencode/poll') {
  const task=await env.LAB_DB.prepare("SELECT id,prompt FROM lab_tasks WHERE state='pending' AND approved=1 ORDER BY created_at LIMIT 1").first();
  if(!task)return response({task:null});
  const updated=await env.LAB_DB.prepare("UPDATE lab_tasks SET state='claimed',claimed_at=? WHERE id=? AND state='pending' AND approved=1").bind(Date.now(),task.id).run();
  if((updated.meta?.changes||0)!==1)return response({task:null});
  return response({task:{id:task.id,kind:'probe',prompt:OPEN_CODE_PROBE}});
 }
 if(path==='/opencode/result') {
  let body;try{body=await request.json()}catch{return response({error:'bad_json'},400);}
  if(typeof body.id!=='string'||!/^lab_[a-f0-9-]{36}$/.test(body.id))return response({error:'bad_id'},400);
  const state=body.success===true?'succeeded':'failed';
  const output=string(body.output).slice(0,1200);
  const updated=await env.LAB_DB.prepare("UPDATE lab_tasks SET state=?,finished_at=?,result=?,error=? WHERE id=? AND state='claimed'").bind(state,Date.now(),output,state==='failed'?string(body.error).slice(0,300):null,body.id).run();
  return response({accepted:(updated.meta?.changes||0)===1});
 }
 return response({error:'not_found'},404);
}
async function ownerTaskEndpoint(request,env,url) {
 if(!env.LAB_DB)return response({error:'lab_db_missing'},503);
 const path=url.pathname;
 if(path==='/opencode/status'){
  const state=await env.LAB_DB.prepare("SELECT state,last_seen FROM agent_status WHERE name='opencode'").first();
  const online=!!state&&Date.now()-state.last_seen<60000;
  return response({connected:online,agent:online?'online':'offline',lastSeen:state?.last_seen||null,prodCouncilConnected:false,mode:'test_only'});
 }
 if(path==='/opencode/probe'){
  const pending=await env.LAB_DB.prepare("SELECT count(1) n FROM lab_tasks WHERE state IN ('pending','claimed')").first();
  if(Number(pending?.n||0)>=1)return response({error:'one_task_at_a_time'},409);
  const id='lab_'+crypto.randomUUID();
  await env.LAB_DB.prepare('INSERT INTO lab_tasks(id,state,prompt,created_at,approved) VALUES(?,?,?,?,1)').bind(id,'pending',OPEN_CODE_PROBE,Date.now()).run();
  return response({id,state:'pending',approvedFor:'read_only_connection_probe',taskExecuted:false});
 }
 if(path==='/opencode/job'){
  const id=url.searchParams.get('id')||'';
  if(!/^lab_[a-f0-9-]{36}$/.test(id))return response({error:'bad_id'},400);
  const task=await env.LAB_DB.prepare('SELECT id,state,created_at,claimed_at,finished_at,result,error FROM lab_tasks WHERE id=?').bind(id).first();
  return task?response({task}):response({error:'not_found'},404);
 }
 return response({error:'not_found'},404);
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return response(status(env));
  if(url.pathname==='/report/create'&&request.method==='POST'){
    if(!isOwner(request,env))return response({error:'unauthorized_test_only'},401);
    if(!env.TASKS)return response({error:'test_report_storage_unavailable'},503);
    if(Number(request.headers.get('content-length')||0)>7000)return response({error:'report_too_large'},413);
    const report=await safeJson(request);
    if(!report||report.consent!==true)return response({error:'explicit_report_consent_required'},400);
    const label=string(report.label).slice(0,100);
    const expected=string(report.expected).slice(0,600);
    const actual=string(report.actual).slice(0,600);
    const messages=Array.isArray(report.messages)?report.messages.slice(-8).map(m=>({
      role:m?.role==='user'?'user':m?.role==='model'?'model':'system',
      speaker:string(m?.speaker).slice(0,30),
      content:string(m?.content).slice(0,380)
    })):[];
    if(!label||!actual)return response({error:'report_requires_label_and_actual'},400);
    const id='report_'+crypto.randomUUID();
    const record={id,source:'Atha Council TEST only',createdAt:new Date().toISOString(),
      label,expected,actual,messages,clientVersion:string(report.clientVersion).slice(0,70),
      bridgeStatus:string(report.bridgeStatus).slice(0,100),productionAffected:false,
      status:'needs_review'};
    await env.TASKS.put('test-report:'+id,JSON.stringify(record),{expirationTtl:604800});
    return response({id,saved:true,status:'needs_review',retentionDays:7,autoNotifiedAssistant:false},201);
  }
  if(url.pathname.startsWith('/opencode/')){
    if(!['POST','GET'].includes(request.method))return response({error:'method'},405);
    if(['/opencode/heartbeat','/opencode/poll','/opencode/result'].includes(url.pathname)){
      if(request.method!=='POST')return response({error:'method'},405);
      return agentEndpoint(request,env,url);
    }
    const bearer='Bearer '+string(env.TEST_ACCESS_TOKEN);
    if(!string(env.TEST_ACCESS_TOKEN)||request.headers.get('authorization')!==bearer)return response({error:'owner_unauthorized'},401);
    if(url.pathname==='/opencode/status'&&request.method!=='GET')return response({error:'method'},405);
    if(url.pathname==='/opencode/job'&&request.method!=='GET')return response({error:'method'},405);
    if(url.pathname==='/opencode/probe'&&request.method!=='POST')return response({error:'method'},405);
    return ownerTaskEndpoint(request,env,url);
  }

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
  const requested=Array.isArray(body?.models)?body.models:['qwen','llama'];
  if(!requested.length||requested.length>3||new Set(requested).size!==requested.length||requested.some(x=>!allowed.has(x)))return response({error:'invalid_models'},400);
  // No automatic retries, task execution, database, production workers, or Council credentials.
  const start=Date.now();
  const settled=await Promise.all(requested.map(async key=>[key,await ask(key,body,env)]));
  return response({mode:'isolated_test',liveProduction:false,realModelCalls:true,taskExecuted:false,durationMs:Date.now()-start,results:Object.fromEntries(settled)});
 }
};