import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workerSource=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const {handleCopilotRoute,githubMobileHandoffPage}=await import('data:text/javascript;base64,'+
 Buffer.from(workerSource+'\nexport {handleCopilotRoute,githubMobileHandoffPage};').toString('base64'));

const preview='https://atlas-council-copilot-preview.sshrrgoktas.workers.dev';
const env={
 GITHUB_SESSION_SECRET:'test-only-github-preview-session-secret-56-chars',
 GITHUB_OAUTH_CLIENT_ID:'test-client-id',
 GITHUB_OAUTH_CLIENT_SECRET:'test-only-oauth-client',
 ATLAS_GITHUB_HANDOFF_SECRET:'test-only-ticket-encryption-secret-at-least-32-characters'
};
const fakeToken='gho_test_token_abcdefghijklmnopqrstuvwxyz';
const ticket='abcdefghijklmnop.abcdefghijklmnopqrstuvwxyz1234567890';

test('Android OAuth return page provides a user-clickable package-bound app intent and deep-link fallback',async()=>{
 const r=githubMobileHandoffPage(ticket);
 assert.equal(r.status,200);
 assert.match(r.headers.get('content-type'),/^text\/html/);
 assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.doesNotMatch(r.headers.get('set-cookie')||'',/atlas_copilot_session=/);
 const html=await r.text();
 assert.match(html,/id="returnToAthalAI"/);
 assert.match(html,/intent:\/\/github-auth\?ticket=abcdefghijklmnop\./);
 assert.match(html,/#Intent;scheme=atlascouncil;package=com\.atlascouncil\.app;end/);
 assert.match(html,/id="fallbackReturn"/);
 assert.match(html,/atlascouncil:\/\/github-auth\?ticket=abcdefghijklmnop/);
 assert.match(html,/APK indirmen gerekmiyor/);
 assert.equal(html.includes('<script'),false);
 assert.equal(html.includes(fakeToken),false);
 assert.doesNotMatch(html,/<(?:img|iframe|form|link)\b/i);
});
test('malformed mobile transfer tickets cannot be placed into app-return URLs',()=>{
 const r=githubMobileHandoffPage('" onmouseover="alert(1)');
 assert.equal(r.status,403);
});
async function callback(target){
 const state='a'.repeat(64),challenge='c'.repeat(43);
 const url=preview+'/auth/github/callback?state='+state+'&code=fake_provider_code';
 const request=new Request(url,{headers:{cookie:'atlas_copilot_oauth_state='+state+'; atlas_gh_handoff_target='+target+'.'+challenge}});
 let calls=0;
 const original=globalThis.fetch;
 globalThis.fetch=async(uri,opts)=>{calls++;
  assert.equal(String(uri),'https://github.com/login/oauth/access_token');
  assert.equal(opts.redirect,'manual');
  return Response.json({access_token:fakeToken,token_type:'bearer',scope:'read:user'});
 };
 try{
  const response=await handleCopilotRoute(request,env);
  assert.equal(calls,1);
  return response;
 }finally{globalThis.fetch=original}
}
test('mobile OAuth callback stops at manual return page and does not sign browser in',async()=>{
 const r=await callback('mobile');
 assert.equal(r.status,200);
 assert.equal(r.headers.get('location'),null);
 assert.match(await r.text(),/AthalAI uygulamasına dön/);
 assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.doesNotMatch(r.headers.get('set-cookie')||'',/atlas_copilot_session=/);
});
test('existing browser GitHub OAuth continues to redirect to production without a native app',async()=>{
 const r=await callback('web');
 assert.equal(r.status,302);
 assert.match(r.headers.get('location')||'',/^https:\/\/atlas-council\.sshrrgoktas\.workers\.dev\/auth\/github\/finish\?ticket=/);
 assert.equal((r.headers.get('content-type')||'').includes('text/html'),false);
});
test('callback without a validated state never exchanges the OAuth code',async()=>{
 const r=await handleCopilotRoute(new Request(preview+'/auth/github/callback?state=bad&code=fake'),env);
 assert.equal(r.status,400);
});
