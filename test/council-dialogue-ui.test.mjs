import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const html=JSON.parse(source.slice(source.indexOf('const HTML=')+11,source.lastIndexOf(';')));
const js=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
function harness({paused=false,hidden=false}={}){
 const requests=[],recorded=[],elements=new Map();
 const document={hidden,getElementById(id){if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id)}};
 const chat={id:'room',items:[{role:'user',content:'Merhaba'},{role:'assistant',speakerId:'chatgpt',content:'Selam',remoteReplyId:'mcp_evt_current'}]};
 const helperStart=js.indexOf('async function limitedFetch(');
 const helper=helperStart<0?'':js.slice(helperStart,js.indexOf('\nlet athaRepliesInFlight',helperStart));
 const flow=js.slice(js.indexOf('let councilDialogueBusy='),js.indexOf('async function receiveAthaReplies()'));
 const run=new Function('fetch','document','setTimeout','clearTimeout','sendAthaSyncRoom','recordItem','openChat',`let busy=false,currentChatId='room',athaCurrentConnection={participationMode:'${paused?'paused':'dialogue'}'},athaSyncReplyStatus={};${helper}\n${flow};return {run:continueCouncilDialogue,status:athaSyncReplyStatus}`)(
  async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body),signal:opts.signal});return Response.json({identity:'Google Gemini',complete:true,text:'Merhaba Atha.'})},document,
  (fn,ms)=>ms===4500?queueMicrotask(fn):setTimeout(fn,ms),clearTimeout,async()=>{},(...args)=>recorded.push(args),()=>{}
 );return {...run,chat,requests,recorded};
}
test('Receiving a real Atha reply calls Gemini outside the send handler exactly once',async()=>{
 const h=harness(),replies=[{replyId:'mcp_evt_current'}];await h.run(h.chat,replies);
 assert.equal(h.requests.length,1,JSON.stringify(h.status));assert.equal(h.requests[0].url,'/api/google/chat');
 assert.deepEqual(h.requests[0].body.dialogue,{room_id:'room',parent_reply_id:'mcp_evt_current'});
 assert.ok(h.requests[0].signal instanceof AbortSignal);assert.equal(h.recorded[0][4],'gemini');
 await h.run(h.chat,replies);assert.equal(h.requests.length,1);
});
test('Paused and hidden chats do not start an automatic Gemini turn',async()=>{
 for(const opts of [{paused:true},{hidden:true}]){const h=harness(opts);await h.run(h.chat,[{replyId:'mcp_evt_current'}]);assert.equal(h.requests.length,0)}
});
