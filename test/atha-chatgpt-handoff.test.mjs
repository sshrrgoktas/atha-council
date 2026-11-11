import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const begin=source.indexOf("const HTML=");
const html=JSON.parse(source.slice(begin+"const HTML=".length,source.lastIndexOf(";")));
const js=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));

test("Atha Council Worker and embedded browser JS compile without modifying backend",()=>{
 new Function(source.replace("export default {","const runtime = {"));
 new Function(js);
});
test("Chat and agents menus display the working Atha invite instead of a fake connected badge",()=>{
 assert.match(html,/id="callAtha"/);
 assert.match(html,/id="callAthaFromAgents"/);
 assert.match(html,/Atha’yı Çağır/);
 assert.match(js,/document\.getElementById\('callAtha'\)\.onclick=openAthaInvitation/);
 assert.match(js,/document\.getElementById\('callAthaFromAgents'\)\.onclick/);
 assert.match(html,/Doğrudan API bağlantısı yok/);
});
test("Old room-storage keys and other existing providers remain unchanged",()=>{
 assert.match(html,/const storageKey='atlasCouncilChatsV1'/);
 assert.match(html,/const profileKey='atlasCouncilProfileV1'/);
 assert.match(html,/id="geminiConnect"/);
 assert.match(html,/id="copilotConnect"/);
});
const start=js.indexOf('async function openAthaInvitation()');
const end=js.indexOf("document.getElementById('callAtha').onclick",start);
const invite=js.slice(start,end);
function invitationHarness(response,consented=false){
 const chat={id:'new_room',items:[{role:'user',content:'Yeni mesaj'}]};
 const enabled=new Set(consented?[chat.id]:[]),calls=[],views=[],status={textContent:''};
 const run=new Function('chats','currentChatId','enabledAthaSyncRooms','fetch','renderCouncilAccount','saveAthaSyncConsent','renderAthaMcpStatus','sendAthaCall','show','athaSyncStatus','updateAthaSyncControls',"let athaCurrentConnection=null;"+invite+';return openAthaInvitation')(
  [chat],chat.id,enabled,async url=>{calls.push(url);return Response.json(response)},()=>{},()=>{},()=>{},async()=>calls.push('call'),view=>views.push(view),status,()=>{}
 );
 return {run,chat,enabled,calls,views,status};
}
test('Authorized existing rooms call Atha without a transcript or clipboard screen',async()=>{
 const h=invitationHarness({authenticated:true,connection:{privateCloudSync:true}});const before=JSON.stringify(h.chat.items);
 await h.run();assert.ok(h.calls.includes('call'));assert.equal(h.views.length,0);assert.ok(h.enabled.has('new_room'));
 assert.equal(JSON.stringify(h.chat.items),before,'existing permission must not restore old messages');
 assert.doesNotMatch(invite,/clipboard|textarea|buildAthaHandoff|user-imported-chatgpt/);
});
test('New or locally deleted rooms use the same setup screen and never inherit old conversations',async()=>{
 for(const staleConsent of [false,true]){
  const h=invitationHarness({authenticated:true,connection:null},staleConsent);await h.run();
  assert.deepEqual(h.views,['help']);assert.ok(!h.calls.includes('call'));assert.ok(!h.enabled.has('new_room'));assert.equal(h.chat.items.length,1);
  assert.match(h.status.textContent,/yeni sohbet için eşitleme izni/);
 }
});
test('Signed-out rooms use that same setup view with a direct login explanation',async()=>{
 const h=invitationHarness({authenticated:false});await h.run();assert.deepEqual(h.views,['help']);assert.ok(!h.calls.includes('call'));assert.match(h.status.textContent,/GitHub ile giriş yap/);
});
