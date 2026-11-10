// Optional route handler, NOT YET DEPLOYED. Integrate only after staging tests.
// Worker secrets: GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET,
// GITHUB_SESSION_SECRET, COPILOT_BRIDGE_SECRET, COPILOT_BRIDGE_URL.
const noStore={"cache-control":"no-store","x-content-type-options":"nosniff"};
const COOKIE="atlas_copilot_session", STATE="atlas_copilot_oauth_state", PREVIEW_HANDOFF_COOKIE="atlas_gh_handoff_target";
function validGHOAuthChallenge(value){return typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value)}
const failure=(status,error)=>Response.json({error,verified:false},{status,headers:noStore});
const random=()=>crypto.randomUUID().replaceAll("-","");
function cookie(request,name) {
  const pair=(request.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return pair ? pair.slice(name.length+1) : null;
}
function b64u(bytes) {
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decode64(s){
  const chars=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));
  return Uint8Array.from(chars,c=>c.charCodeAt(0));
}
function secureCookie(name,value,maxAge,path="/") {
  return name+"="+value+"; Path="+path+"; Max-Age="+maxAge+"; Secure; HttpOnly; SameSite=Lax";
}
async function key(secret,usage) {
  if(typeof secret!=="string"||secret.length<32)throw new Error("Missing session secret");
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw",hash,{name:"AES-GCM"},false,[usage]);
}
async function encrypt(token,secret){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(secret,"encrypt"),new TextEncoder().encode(token));
  return b64u(iv)+"."+b64u(new Uint8Array(cipher));
}
async function decrypt(value,secret){
  try{
    if(!value||value.length>8000)return null;
    const [a,b]=value.split(".");
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode64(a)},await key(secret,"decrypt"),decode64(b));
    return new TextDecoder().decode(plain);
  }catch{return null}
}
async function signedBridgeRequest(url,secret,body){
  if(typeof secret!=="string"||secret.length<32)throw new Error("Bridge secret missing");
  const endpoint=new URL(url);
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password)throw new Error("Bridge requires HTTPS");
  endpoint.pathname="/v1/copilot";endpoint.search="";
  const timestamp=String(Date.now()), nonce=random();
  const bytes=new TextEncoder().encode(timestamp+"."+nonce+"."+body);
  const macKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",macKey,bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
  return fetch(endpoint.toString(),{method:"POST",headers:{"content-type":"application/json","x-atlas-timestamp":timestamp,"x-atlas-nonce":nonce,"x-atlas-signature":signature},body,redirect:"manual",signal:AbortSignal.timeout(90000)});
}
export async function handleCopilotRoute(request,env) {
  const u=new URL(request.url), path=u.pathname, origin=u.origin;
  if(!["/auth/github/start","/auth/github/callback","/auth/github/logout","/api/copilot/status","/api/copilot/chat"].includes(path))return null;
  if(!env.GITHUB_SESSION_SECRET||String(env.GITHUB_SESSION_SECRET).length<32)return failure(503,"GitHub session not configured");
  if(path==="/auth/github/start"&&request.method==="GET"){
    if(!env.GITHUB_OAUTH_CLIENT_ID||!env.GITHUB_OAUTH_CLIENT_SECRET)return failure(503,"GitHub OAuth App not configured");
    const handoff=u.searchParams.get("handoff");
    const challenge=u.searchParams.get("challenge");
    if(handoff!==null&&(!["web","mobile"].includes(handoff)||!validGHOAuthChallenge(challenge)))return failure(400,"Invalid GitHub handoff challenge");
    if(handoff&&!env.ATLAS_GITHUB_HANDOFF_SECRET)return failure(503,"OAuth transfer not configured");
    const state=random()+random();
    const auth=new URL("https://github.com/login/oauth/authorize");
    auth.searchParams.set("client_id",env.GITHUB_OAUTH_CLIENT_ID);
    auth.searchParams.set("redirect_uri",origin+"/auth/github/callback");
    auth.searchParams.set("scope","read:user");
    auth.searchParams.set("state",state);
    const startHeaders=new Headers({location:auth.toString(),...noStore});
    startHeaders.append("set-cookie",secureCookie(STATE,state,600,"/auth/github"));
    if(handoff)startHeaders.append("set-cookie",secureCookie(PREVIEW_HANDOFF_COOKIE,handoff+"."+challenge,600,"/auth/github"));
    return new Response(null,{status:302,headers:startHeaders});
  }
  if(path==="/auth/github/callback"&&request.method==="GET"){
    const state=cookie(request,STATE);
    if(!state||state.length<32||state!==u.searchParams.get("state")||!u.searchParams.get("code"))return failure(400,"GitHub OAuth state invalid");
    // GitHub's documented token exchange. Keep phase diagnostics free of tokens and secrets.
    let phase="exchange-form";
    try {
      const form=new URLSearchParams({client_id:env.GITHUB_OAUTH_CLIENT_ID,client_secret:env.GITHUB_OAUTH_CLIENT_SECRET,code:u.searchParams.get("code"),redirect_uri:origin+"/auth/github/callback"});
      phase="exchange-fetch";
      const response=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json","user-agent":"Atlas-Council-OAuth"},body:form.toString(),redirect:"manual"});
      if(!response.ok)return Response.json({error:"GitHub token exchange HTTP error",stage:"exchange-http",verified:false},{status:502,headers:noStore});
      phase="exchange-decode";
      const data=await response.json();
      if(data.error||typeof data.access_token!=="string"||!/^(gho_|ghu_)/.test(data.access_token))return Response.json({error:"GitHub OAuth token was not granted",stage:"exchange-authorization",code:["bad_verification_code","incorrect_client_credentials","redirect_uri_mismatch","application_suspended"].includes(data.error)?data.error:"other",verified:false},{status:403,headers:noStore});
      const targetCookie=cookie(request,PREVIEW_HANDOFF_COOKIE);
      if(targetCookie){
        const pieces=targetCookie.split(".");
        const target=pieces[0],challenge=pieces[1];
        if(!env.ATLAS_GITHUB_HANDOFF_SECRET||pieces.length!==2||!["web","mobile"].includes(target)||!validGHOAuthChallenge(challenge))return failure(403,"GitHub session transfer invalid");
        phase="handoff-encrypt";
        const ticket=await encrypt(JSON.stringify({v:1,issuer:"atlas-council-copilot-preview",audience:"atlas-council",target,challenge,expires:Date.now()+60000,token:data.access_token}),env.ATLAS_GITHUB_HANDOFF_SECRET);
        const location=target==="mobile"?"atlascouncil://github-auth?ticket="+encodeURIComponent(ticket):"https://atlas-council.sshrrgoktas.workers.dev/auth/github/finish?ticket="+encodeURIComponent(ticket);
        const headers=new Headers({location,"cache-control":"no-store","referrer-policy":"no-referrer"});
        headers.append("set-cookie",secureCookie(COOKIE,await encrypt(data.access_token,env.GITHUB_SESSION_SECRET),3600));
        headers.append("set-cookie",secureCookie(STATE,"",0,"/auth/github"));
        headers.append("set-cookie",secureCookie(PREVIEW_HANDOFF_COOKIE,"",0,"/auth/github"));
        return new Response(null,{status:302,headers});
      }
      phase="session-encrypt";
      const token=await encrypt(data.access_token,env.GITHUB_SESSION_SECRET);
      phase="session-redirect";
      const headers=new Headers({"location":"/council-v2?github=connected",...noStore});
      headers.append("set-cookie",secureCookie(COOKIE,token,3600));
      headers.append("set-cookie",secureCookie(STATE,"",0,"/auth/github"));
      return new Response(null,{status:302,headers});
    } catch(error) {
      console.error("GitHub OAuth callback failure",phase,String(error?.name||"Error"));
      const type=String(error?.name||"Error");
      return Response.json({error:"GitHub OAuth callback could not be completed",stage:phase,reason:["TypeError","ReferenceError","SecurityError","NetworkError","OperationError","SyntaxError"].includes(type)?type:"OtherError",verified:false},{status:502,headers:noStore});
    }
  }
  if(path==="/auth/github/logout"&&request.method==="GET"){
    return new Response(null,{status:302,headers:{"location":"/council-v2","set-cookie":secureCookie(COOKIE,"",0),...noStore}});
  }
  const access=await decrypt(cookie(request,COOKIE),env.GITHUB_SESSION_SECRET);
  if(path==="/api/copilot/status"&&request.method==="GET"){
    let user=null;
    if(access)try{
      const r=await fetch("https://api.github.com/user",{headers:{"authorization":"Bearer "+access,"accept":"application/vnd.github+json","user-agent":"Atlas-Council"}});
      if(r.ok){const profile=await r.json();user={login:profile.login,id:profile.id};}
    }catch{}
    return Response.json({speakerId:"copilot",oauthConnected:!!user,githubUser:user?.login||null,bridgeConfigured:!!env.COPILOT_BRIDGE_URL&&!!env.COPILOT_BRIDGE_SECRET,verified:false},{headers:noStore});
  }
  if(path==="/api/copilot/chat"&&request.method==="POST"){
    if(!access)return failure(401,"GitHub login required");
    const requestOrigin=request.headers.get("origin");
    if(requestOrigin&&requestOrigin!==origin)return failure(403,"Cross-origin request blocked");
    if(request.headers.get("sec-fetch-site")==="cross-site")return failure(403,"Cross-site request blocked");
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))return failure(415,"JSON required");
    if(!env.COPILOT_BRIDGE_URL||!env.COPILOT_BRIDGE_SECRET)return failure(503,"Copilot bridge offline");
    let data;try{data=await request.json()}catch{return failure(400,"Invalid JSON")}
    if(typeof data?.message!=="string"||!data.message.trim()||data.message.length>4000)return failure(400,"Invalid message");
    const allowed=new Set(["human","chatgpt","gemini","copilot","claude","grok","deepseek","meta"]);
    if(data.context!==undefined&&(!Array.isArray(data.context)||data.context.length>20))return failure(400,"Invalid context");
    const context=[];
    for(const item of data.context||[]){
      if(!item||!allowed.has(item.speakerId)||typeof item.text!=="string"||item.text.length>1500)return failure(400,"Invalid context item");
      context.push({speakerId:item.speakerId,text:item.text});
    }
    const requestId=random(), payload=JSON.stringify({requestId,gitHubToken:access,message:data.message,context});
    try{
      const result=await signedBridgeRequest(env.COPILOT_BRIDGE_URL,env.COPILOT_BRIDGE_SECRET,payload);
      if(!result.ok)return failure(502,"Copilot bridge or entitlement rejected request");
      const body=await result.json();
      if(body.requestId!==requestId||body.speakerId!=="copilot"||body.role!=="assistant"||body.source!=="github-copilot-sdk"||typeof body.content!=="string"||!body.content.trim())return failure(502,"Bridge identity validation failed");
      return Response.json({requestId,speakerId:"copilot",role:"assistant",name:"GitHub Copilot",content:body.content,verified:true},{headers:noStore});
    }catch{return failure(502,"Copilot bridge not reachable")}
  }
  return failure(405,"Method not allowed");
}
