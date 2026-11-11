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
test("Invite requires manual approval, allows context edits, and opens official ChatGPT URL",()=>{
 assert.match(js,/function buildAthaHandoffContext\(chat\)/);
 assert.match(js,/slice\(-12\)/);
 assert.match(js,/Yalnızca bağlam/mi);
 assert.match(js,/navigator\.clipboard/);
 assert.match(js,/window\.location\.href='https:\/\/chatgpt\.com\/'/);
 assert.doesNotMatch(js,/https:\/\/chatgpt\.com\/\?q=/);
 assert.match(js,/Özel bilgileri paylaşmadan önce metinden çıkar/);
});
test("Atha invitation uses Android native share sheet before web share and clipboard fallback",()=>{
 const start=js.indexOf("copyAndOpen.onclick=async()=>{");
 const end=js.indexOf("const openChatGPT=",start);
 assert.ok(start>=0&&end>start);
 const action=js.slice(start,end);
 const native=action.indexOf("window.AtlasNative.shareText(");
 const web=action.indexOf("navigator.share(");
 const fallback=action.indexOf("navigator.clipboard.writeText(");
 assert.ok(native>=0&&web>native&&fallback>web,"native -> Web Share -> clipboard priority must be preserved");
 assert.match(action,/inviteText=draft\.value/);
 assert.match(action,/e\.name==='AbortError'/);
 assert.match(action,/window\.location\.href='https:\/\/chatgpt\.com\/'/);
 // Native Android already has a real system share intent, not a simulated send.
 const nativeFile=readFileSync(new URL("../app/src/main/java/com/atlascouncil/app/MainActivity.kt",import.meta.url),"utf8");
 assert.match(nativeFile,/@JavascriptInterface fun shareText\(title:String,content:String\)/);
 assert.match(nativeFile,/Intent\(Intent.ACTION_SEND\)/);
});
test("Assistant reply is user imported, not misrepresented as API verified, and stays in selected chat",()=>{
 assert.match(js,/currentChatId!==roomId/);
 assert.match(js,/if\(!confirm\('Bu metni kullanıcı tarafından aktarılmış Atha/);
 assert.match(js,/source='user-imported-chatgpt'/);
 assert.match(js,/recordItem\(label,reply,false,\[\], 'unknown'\)/);
 assert.match(js,/msgs\.push\(\{role:'assistant',content:reply,speaker:'unknown'\}\)/);
 assert.match(js,/el\.append\(name,document\.createTextNode\(reply\)\)/);
});
test("Old room-storage keys and other existing providers remain unchanged",()=>{
 assert.match(html,/const storageKey='atlasCouncilChatsV1'/);
 assert.match(html,/const profileKey='atlasCouncilProfileV1'/);
 assert.match(html,/id="geminiConnect"/);
 assert.match(html,/id="copilotConnect"/);
});
test("Context is limited to selected chat, 12 messages, and excludes untrusted system-only entries",()=>{
 const start=js.indexOf("function buildAthaHandoffContext(");
 const end=js.indexOf("function openAthaInvitation()",start);
 assert.ok(start>=0&&end>start);
 const fragment=js.slice(start,end);
 const make=new Function(fragment+";return buildAthaHandoffContext")();
 const items=[
   {role:"user",content:"Do not include this old message"},
   ...Array.from({length:15},(_,i)=>({role:i%2?"assistant":"user",name:i%2?"Gemini":"Seher",content:"Mesaj "+i})),
   {role:"system",content:"This secret system entry should never leave"}
 ];
 const prompt=make({title:"Konsey oturumu",items});
 assert.doesNotMatch(prompt,/Do not include this old message/);
 assert.doesNotMatch(prompt,/This secret system entry/);
 assert.match(prompt,/Mesaj 14/);
 assert.match(prompt,/Son 12 mesaj:/);
 assert.match(prompt,/Konsey oturumu/);
});
