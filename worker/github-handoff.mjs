// Secure, short-lived GitHub OAuth handoff from the OAuth preview Worker
// to the production Atlas Council Worker. The GitHub token is never sent in
// plaintext to the user-agent. No external OAuth redirect URI is added.
const HANDOFF_PREVIEW="https://atlas-council-copilot-preview.sshrrgoktas.workers.dev";
const HANDOFF_PRODUCTION="https://atlas-council.sshrrgoktas.workers.dev";
const HANDOFF_COOKIE="atlas_gh_handoff_nonce";
function validChallenge(s){return typeof s==="string"&&/^[A-Za-z0-9_-]{43}$/.test(s)}
async function handoffChallenge(verifier){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
  return b64u(new Uint8Array(digest));
}
function validTicket(obj,target,challenge){
  return obj&&obj.v===1&&obj.issuer==="atlas-council-copilot-preview"&&obj.audience==="atlas-council"&&obj.target===target&&obj.challenge===challenge
     &&Number.isFinite(obj.expires)&&obj.expires>Date.now()&&obj.expires<=Date.now()+60000
     &&typeof obj.token==="string"&&/^(gho_|ghu_)[A-Za-z0-9_]{10,}$/.test(obj.token);
}
async function readHandoffTicket(ticket,env,target,challenge){
  if(typeof ticket!=="string"||ticket.length>7000||!ticket.includes("."))return null;
  if(!env.ATLAS_GITHUB_HANDOFF_SECRET)return null;
  const raw=await decrypt(ticket,env.ATLAS_GITHUB_HANDOFF_SECRET);
  if(!raw||raw.length>6000)return null;
  let obj;try{obj=JSON.parse(raw)}catch{return null}
  return validTicket(obj,target,challenge)?obj:null;
}
export async function handleProductionGithubHandoff(request,env){
  const u=new URL(request.url),p=u.pathname;
  if(!["/auth/github/start","/auth/github/finish","/auth/github/mobile-exchange","/auth/github/callback"].includes(p))return null;
  if(!env.GITHUB_SESSION_SECRET||!env.ATLAS_GITHUB_HANDOFF_SECRET)return failure(503,"GitHub handoff has not been configured");
  if(p==="/auth/github/callback")return failure(404,"GitHub OAuth callback is registered on the preview bridge");
  if(p==="/auth/github/start"&&request.method==="GET"){
    const mobile=u.searchParams.get("mobile")==="1";
    let challenge,verifier=null;
    if(mobile){
      challenge=u.searchParams.get("challenge");
      if(!validChallenge(challenge))return failure(400,"Invalid Android login challenge");
    }else{
      verifier=crypto.randomUUID()+crypto.randomUUID();
      challenge=await handoffChallenge(verifier);
    }
    const target=new URL(HANDOFF_PREVIEW+"/auth/github/start");
    target.searchParams.set("handoff",mobile?"mobile":"web");
    target.searchParams.set("challenge",challenge);
    const headers=new Headers({location:target.toString(),"cache-control":"no-store","referrer-policy":"no-referrer"});
    if(!mobile)headers.append("set-cookie",secureCookie(HANDOFF_COOKIE,verifier,600,"/auth/github"));
    return new Response(null,{status:302,headers});
  }
  if(p==="/auth/github/finish"&&request.method==="GET"){
    const verifier=cookie(request,HANDOFF_COOKIE);
    if(!verifier||verifier.length>200)return failure(403,"GitHub handoff browser verifier missing");
    const challenge=await handoffChallenge(verifier);
    const payload=await readHandoffTicket(u.searchParams.get("ticket"),env,"web",challenge);
    if(!payload)return failure(403,"GitHub handoff ticket invalid or expired");
    const session=await encrypt(payload.token,env.GITHUB_SESSION_SECRET);
    const headers=new Headers({location:"/council-v2?github=connected","cache-control":"no-store","referrer-policy":"no-referrer"});
    headers.append("set-cookie",secureCookie(COOKIE,session,3600));
    headers.append("set-cookie",secureCookie(HANDOFF_COOKIE,"",0,"/auth/github"));
    return new Response(null,{status:302,headers});
  }
  if(p==="/auth/github/mobile-exchange"&&request.method==="POST"){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))return failure(415,"JSON required");
    let body;try{body=await request.json()}catch{return failure(400,"Invalid JSON")}
    if(!body||typeof body.verifier!=="string"||body.verifier.length>200)return failure(400,"Invalid verifier");
    const challenge=await handoffChallenge(body.verifier);
    const payload=await readHandoffTicket(body.ticket,env,"mobile",challenge);
    if(!payload)return failure(403,"GitHub mobile ticket invalid or expired");
    const session=await encrypt(payload.token,env.GITHUB_SESSION_SECRET);
    return Response.json({connected:true,cookie:secureCookie(COOKIE,session,3600)},{headers:noStore});
  }
  return failure(405,"Method not allowed");
}
