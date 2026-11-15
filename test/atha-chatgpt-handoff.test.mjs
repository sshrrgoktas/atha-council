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
test("Atha call control is entirely removed; conversation starts with a greeting",()=>{
 assert.equal(html.includes('id="callAtha"'),false);
 assert.equal(html.includes('id="callAthaFromAgents"'),false);
 assert.equal(js.includes('sendAthaCall'),false);
 assert.equal(js.includes('openAthaInvitation'),false);
 assert.ok(js.includes('function isCouncilGreeting('));
 assert.ok(js.includes('if(isCouncilGreeting(t)&&enabledAthaSyncRooms.has(currentChatId))await startCouncilOnGreeting'));
 assert.ok(js.includes("await setCouncilDialogue('dialogue')"));
 assert.ok(js.includes('await sendAthaSyncRoom(chat)'));
});
test("Old room-storage keys and other existing providers remain unchanged",()=>{
 assert.match(html,/const storageKey='atlasCouncilChatsV1'/);
 assert.match(html,/const profileKey='atlasCouncilProfileV1'/);
 assert.match(html,/id="geminiConnect"/);
 assert.match(html,/id="copilotConnect"/);
});
test('Selam triggers dialogue + sync once; other messages and unsynced rooms cannot trigger Atha',async()=>{
 const start=js.indexOf('function isCouncilGreeting('),end=js.indexOf("document.getElementById('reset').onclick",start);
 assert.ok(start>=0&&end>start);
 const snippet=js.slice(start,end),effects=[],notice={textContent:''},enabled=new Set(['room']);
 const timers=new Map([['room',123]]);
 const harness=new Function('enabledAthaSyncRooms','athaSyncTimers','clearTimeout','setCouncilDialogue','sendAthaSyncRoom','currentChatId','document','scheduleAthaSync',snippet+';return {isCouncilGreeting,startCouncilOnGreeting}')(
  enabled,timers,id=>effects.push('timer:'+id),async mode=>effects.push('mode:'+mode),async chat=>effects.push('sync:'+chat.id),
  'room',{getElementById(){return notice}},room=>effects.push('reschedule:'+room));
 assert.equal(harness.isCouncilGreeting('selam'),true);
 assert.equal(harness.isCouncilGreeting('Selam!'),true);
 assert.equal(harness.isCouncilGreeting('selam arkadaşlar'),false);
 assert.equal(harness.isCouncilGreeting('sus'),false);
 assert.equal(await harness.startCouncilOnGreeting({id:'room'},'selam'),true);
 assert.deepEqual(effects,['timer:123','mode:dialogue','sync:room']);
 assert.match(notice.textContent,/gerçek Atha yanıtı bekleniyor/);
 assert.equal(await harness.startCouncilOnGreeting({id:'room'},'nasılsın'),false);
 assert.equal(await harness.startCouncilOnGreeting({id:'unsynced'},'selam'),false);
 assert.equal(effects.length,3);
});
test('Status distinguishes a verified account, an active chat and a chat with no grant',()=>{
 const fn=js.slice(js.indexOf('function renderAthaControls('),js.indexOf('function openAthaSettings('));
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
 const render=new Function('document','enabledAthaSyncRooms','currentChatId','councilAccountAuthenticated',fn+';return renderAthaControls')(document,new Set(['room']),'room',true);
 render({automaticParticipation:true});assert.match(elements.get('athaSimpleStatus').textContent,/Otomatik olay aboneliği açık/);
 render({participationMode:'paused',oauthConnected:false});assert.match(elements.get('athaSimpleStatus').textContent,/bağlı değil/);
 render({accountScope:true,oauthConnected:true,eventSubscriptionActive:true,privateCloudSync:false});assert.match(elements.get('athaSimpleStatus').textContent,/Hesap bağlantısı doğrulandı.*yerel/);assert.equal(elements.get('athaSetupLink').hidden,true);
 render({participationMode:'paused',oauthConnected:true});assert.equal(elements.get('athaSimpleStatus').textContent,'Atha durduruldu');
});
