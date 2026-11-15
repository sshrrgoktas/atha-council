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
test("Atha manual call is removed; every nonempty user message begins automatic dialogue",()=>{
 assert.equal(html.includes('id="callAtha"'),false);
 assert.equal(html.includes('id="callAthaFromAgents"'),false);
 assert.equal(js.includes('sendAthaCall'),false);
 assert.equal(js.includes('openAthaInvitation'),false);
 assert.ok(js.includes('function isCouncilUserMessage('));
 assert.ok(js.includes('if(isCouncilUserMessage(t)&&enabledAthaSyncRooms.has(currentChatId))await startCouncilOnUserMessage'));
 assert.ok(js.includes("await setCouncilDialogue('dialogue')"));
 assert.doesNotMatch(html,/en fazla 3 tur ve 20 dakika/);
 assert.doesNotMatch(html,/ChatGPT bağlantısı bekleniyor/);
 assert.ok(js.includes('await sendAthaSyncRoom(chat)'));
});
test("Old room-storage keys and other existing providers remain unchanged",()=>{
 assert.match(html,/const storageKey='atlasCouncilChatsV1'/);
 assert.match(html,/const profileKey='atlasCouncilProfileV1'/);
 assert.match(html,/id="geminiConnect"/);
 assert.match(html,/id="copilotConnect"/);
});
test('Any nonempty message including punctuation and emoji starts automatically; no room consent means no upload',async()=>{
 const start=js.indexOf('function isCouncilUserMessage('),end=js.indexOf("document.getElementById('reset').onclick",start);
 assert.ok(start>=0&&end>start);
 const snippet=js.slice(start,end),effects=[],notice={textContent:''},enabled=new Set(['room']);
 const timers=new Map([['room',123]]);
 const connection={participationMode:'all_user'};
 const harness=new Function('enabledAthaSyncRooms','athaSyncTimers','clearTimeout','setCouncilDialogue','sendAthaSyncRoom','currentChatId','document','scheduleAthaSync','athaCurrentConnection',snippet+';return {isCouncilUserMessage,startCouncilOnUserMessage}')(
  enabled,timers,id=>effects.push('timer:'+id),async mode=>effects.push('mode:'+mode),async chat=>effects.push('sync:'+chat.id),
  'room',{getElementById(){return notice}},room=>effects.push('reschedule:'+room),connection);
 for(const value of ['selam','Evet selam ve devam','.', '🔥','nasılsın','evet','!'])assert.equal(harness.isCouncilUserMessage(value),true,value);
 for(const value of ['', ' ', '\\n\\t'])assert.equal(harness.isCouncilUserMessage(value),false,JSON.stringify(value));
 assert.equal(await harness.startCouncilOnUserMessage({id:'room'},'.'),true);
 assert.deepEqual(effects,['timer:123','mode:dialogue','sync:room']);
 assert.match(notice.textContent,/yanıtı henüz doğrulanmadı/);
 assert.equal(await harness.startCouncilOnUserMessage({id:'room'},'Evet selam ve devam'),true);
 assert.equal(effects.at(-1),'sync:room');
 assert.equal(await harness.startCouncilOnUserMessage({id:'unsynced'},'🔥'),false);
 assert.equal(effects.filter(x=>x==='sync:unsynced').length,0);
 connection.participationMode='dialogue';
 const before=effects.length;
 assert.equal(await harness.startCouncilOnUserMessage({id:'room'},'!'),true);
 assert.deepEqual(effects.slice(before),['sync:room'],'do not reset dialogue epoch on every new message');
 assert.ok(js.indexOf("councilStopIntent(t)){await pauseAthaParticipation();return;}")<js.indexOf("startCouncilOnUserMessage(chats.find"));
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
