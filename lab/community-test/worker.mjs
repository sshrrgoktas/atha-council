// Public invitation-only Atha Council COMMUNITY TEST. Never connects to the production Council.
const QWEN='@cf/qwen/qwen3.8-27b';
const LLAMA='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MODEL={qwen:QWEN,llama:LLAMA};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY','access-control-allow-origin':'null'}});
const clean=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const invitePattern=/^[A-Za-z0-9_-]{30,100}$/;
const uidPattern=/^[a-z0-9_-]{1,24}$/;
const allowedModel=x=>x==='qwen'||x==='llama';
async function invite(env,token){
 if(!invitePattern.test(token||''))return null;
 const value=await env.COMMUNITY.get('invite:'+token,'json');
 if(!value||value.disabled===true||new Date(value.expiresAt).getTime()<Date.now())return null;
 return value;
}
async function dailyQuota(env,token){
 const day=new Date().toISOString().slice(0,10),key='rate:'+token+':'+day;
 const used=Number(await env.COMMUNITY.get(key))||0;
 if(used>=80)return false;
 // KV rate limit is an abuse backstop, not a strict atomic limit.
 await env.COMMUNITY.put(key,String(used+1),{expirationTtl:90000});return true;
}
function humanHistory(raw){
 if(!Array.isArray(raw))return [];
 return raw.slice(-36).map(x=>({speaker:clean(x?.speaker,20),role:x?.role==='user'?'user':'model',content:clean(x?.content,2600)}))
 .filter(x=>x.content).slice(-32);
}
function systemInstruction(who,story){
 const base=[
 'You are '+who+', a named participant of an isolated Atha Council TEST group conversation.',
 'The other participant is '+(who==='Qwen'?'Llama':'Qwen')+'. The human is the user. Preserve speaker attribution accurately.',
 'Reply in natural Turkish, directly to the user. Casual greetings should receive friendly greetings, never an intent-analysis report.',
 'Remember only text supplied in this current chat. Do not pretend you remember the user from earlier sessions.',
 'Never claim you executed tasks or edited software. The production Atha Council and AthalAI are strictly off-limits.',
 'Answer briefly for casual chat; for story writing follow the requested length and preserve the shared storyline.'
 ];
 if(story)base.push('The user asks for one continuous unified story. Merge the provided Qwen/Llama fiction chronologically as one flowing narrative, NOT as a discussion summary. If original parts are absent, be transparent instead of inventing them.');
 return base.join(' ');
}
function flatten(raw){
 const x=raw||{},values=[x.response,x.output_text,x.text,x.choices?.[0]?.message?.content,x.choices?.[0]?.text];
 for(const v of values){if(typeof v==='string'&&v.trim())return v;if(Array.isArray(v)){const t=v.map(z=>typeof z==='string'?z:z?.text||'').join('');if(t.trim())return t;}}
 return '';
}
async function modelResponse(env,model,history,latest){
 const who=model==='qwen'?'Qwen':'Llama';
 const isStory=/(hikaye|hikâye|öykü|metin).*(tek metin|birleştir|baştan sona|tamamını)|(tek metin|birleştir).*(hikaye|hikâye|öykü|metin)/iu.test(latest);
 const context=history.map(x=> (x.role==='user'?'Kullanıcı':x.speaker)+': '+x.content).join('\n').slice(-12500);
 const text=context?'Önceki konuşma:\n'+context+'\n\nSON KULLANICI MESAJI:\n'+latest:latest;
 const started=Date.now();
 try{
  const payload=model==='qwen'?
    {messages:[{role:'system',content:systemInstruction(who,isStory)},{role:'user',content:text}],max_completion_tokens:isStory?2100:700,reasoning_effort:'low',temperature:0.35}:
    {messages:[{role:'system',content:systemInstruction(who,isStory)},{role:'user',content:text}],max_tokens:isStory?1700:500,temperature:0.35};
  const raw=await env.AI.run(MODEL[model],payload);
  const answer=flatten(raw).slice(0,9500);
  return {model,status:answer?'ok':'empty',answer,elapsedMs:Date.now()-started};
 }catch(e){return {model,status:'provider_error',error:clean(String(e?.message||'Provider error'),130),elapsedMs:Date.now()-started}}
}
async function api(req,env,url){
 if(!env.COMMUNITY||!env.AI)return response({error:'test_not_ready'},503);
 if(req.method!=='POST')return response({error:'method_not_allowed'},405);
 const size=Number(req.headers.get('content-length')||0);if(size>20000)return response({error:'too_large'},413);
 let body;try{body=await req.json()}catch{return response({error:'bad_json'},400)}
 const token=clean(body?.invite,120);
 const tester=await invite(env,token);if(!tester)return response({error:'invalid_or_expired_invite'},401);
 if(url.pathname==='/api/hello')return response({testerId:tester.testerId,expiresAt:tester.expiresAt,models:['qwen','llama'],testOnly:true});
 if(url.pathname==='/api/chat'){
   if(!await dailyQuota(env,token))return response({error:'daily_test_quota_reached'},429);
   const model=body.model,latest=clean(body.latest,600);
   if(!allowedModel(model)||!latest)return response({error:'invalid_message_or_model'},400);
   const history=humanHistory(body.history);
   return response(await modelResponse(env,model,history,latest));
 }
 if(url.pathname==='/api/report/status'){
   const id=clean(body.id,64);
   if(!/^report_[a-f0-9-]{36}$/.test(id))return response({error:'invalid_report_id'},400);
   const record=await env.COMMUNITY.get('test-report:'+id,'json');
   if(!record||record.testerId!==tester.testerId)return response({found:false,id},200);
   return response({found:true,id,status:record.status,createdAt:record.createdAt,source:record.source});
 }
 if(url.pathname==='/api/report'){
   if(!await dailyQuota(env,token))return response({error:'daily_test_quota_reached'},429);
   const label=clean(body.label,100),actual=clean(body.actual,600),expected=clean(body.expected,600);
   if(!label||!actual||body.consent!==true)return response({error:'report_title_actual_and_consent_required'},400);
   const messages=body.includeTranscript===true?humanHistory(body.messages).slice(-8):[];
   const id='report_'+crypto.randomUUID();
   const record={id,source:'Atha Council WEB TEST',testerId:tester.testerId,createdAt:new Date().toISOString(),
     label,actual,expected,messages,clientVersion:'web-beta-1',status:'needs_review',
     productionAffected:false,retentionDays:7};
   await env.COMMUNITY.put('test-report:'+id,JSON.stringify(record),{expirationTtl:604800});
   return response({saved:true,id,status:'needs_review',retentionDays:7,receipt:'TEST_KV_WRITE_ACKNOWLEDGED'},201);
 }
 return response({error:'not_found'},404);
}
async function admin(req,env,url){
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]{30,100}$/.test(bearer))return response({error:'admin_unauthorized'},401);
 const key=bearer.slice(7);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const expected=await env.COMMUNITY.get('admin:sha256');
 if(!expected||hex!==expected)return response({error:'admin_unauthorized'},401);
 if(url.pathname==='/api/admin/list'){
   const cursor=clean(url.searchParams.get('cursor'),300);
   const keys=await env.COMMUNITY.list({prefix:'test-report:',limit:30,...(cursor?{cursor}:{})});
   const records=await Promise.all(keys.keys.map(k=>env.COMMUNITY.get(k.name,'json')));
   const reports=records.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
   return response({reports,pagination:keys.list_complete?'complete':'partial',nextCursor:keys.list_complete?null:keys.cursor,source:'WEB and Android TEST'});
 }
 if(url.pathname==='/api/admin/status'&&req.method==='POST'){
   let body;try{body=await req.json()}catch{return response({error:'bad_json'},400)}
   const id=clean(body.id,64),status=body.status;
   if(!/^report_[a-f0-9-]{36}$/.test(id)||!['needs_review','investigating','fixed_pending_retest','closed'].includes(status))return response({error:'invalid_report_status'},400);
   const key='test-report:'+id,old=await env.COMMUNITY.get(key,'json');
   if(!old)return response({error:'report_not_found'},404);
   const next={...old,status,reviewNote:clean(body.note,300),reviewedAt:new Date().toISOString()};
   await env.COMMUNITY.put(key,JSON.stringify(next),{expirationTtl:604800});
   return response({saved:true,id,status});
 }
 return response({error:'not_found'},404);
}
export default {
 async fetch(req,env){
  const url=new URL(req.url);
  if(url.pathname==='/health')return response({name:'Atha Council Community TEST',productionConnected:false,linkReady:!!env.AI&&!!env.COMMUNITY,modelCount:2});
  if(url.pathname.startsWith('/api/admin/'))return admin(req,env,url);
  if(url.pathname.startsWith('/api/'))return api(req,env,url);
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/admin')){
    const html=typeof TEST_HTML==='string'?TEST_HTML:'Frontend unavailable';
    return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'x-frame-options':'DENY'}});
  }
  return response({error:'not_found'},404);
 }
};