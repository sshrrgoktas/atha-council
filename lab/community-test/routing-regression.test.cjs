'use strict';
// LAB-only regression checks. No network calls, model execution or production connections.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const begin=html.indexOf('function recipients(text){');
const end=html.indexOf('\nasync function join(',begin);
assert.ok(begin>=0 && end>begin,'Routing function must remain present');
const context=vm.createContext({});
vm.runInContext("let active=null;"+html.slice(begin,end)+"\nthis.testRoute=(text)=>recipients(text).join(',');this.resetRoute=()=>{active=null};",context);
for(const [label,message,expected] of [
 ['Address Llama, mention Qwen',"Llama, Qwen'in fikrini değerlendir",'llama'],
 ['Address Qwen, mention Llama',"Qwen: Llama'nın cevabını değerlendir",'qwen'],
 ['Mention Llama without vocative','Llama salak dediğim için küstü','qwen,llama'],
 ['Address both','Qwen ve Llama merhaba','qwen,llama'],
 ['Greeting Llama','Merhaba Llama','llama'],
 ['Address Qwen','Qwen, ne oldu?','qwen'],
 ['Follow up to active model','Peki neden?','qwen']
])test(label,()=>{context.resetRoute(); if(label==='Follow up to active model')context.testRoute('Qwen, selam');assert.equal(context.testRoute(message),expected)});
function memoryStorage() {
 const values=new Map();
 return {
  getItem: key=>values.get(key)??null,
  setItem: (key,value)=>values.set(key,String(value)),
  removeItem: key=>values.delete(key)
 };
}

const workerSource=fs.readFileSync(path.join(__dirname,'worker.mjs'),'utf8');
const testModule='const TEST_HTML='+JSON.stringify(html)+';\n'+workerSource;
const renderedPage=import('data:text/javascript;base64,'+Buffer.from(testModule).toString('base64'))
 .then(({default:worker})=>worker.fetch(new Request('https://test.invalid/'),{}))
 .then(response=>response.text());

async function openParticipant({confirm,requestChat,localStorage=memoryStorage()}) {
 const elements=new Map();
 function makeElement() {
  const listeners=new Map(),children=[];
  return {
   children,
   addEventListener: (event,handler)=>listeners.set(event,handler),
   dispatch: event=>listeners.get(event)({preventDefault(){}}),
   appendChild(child){children.push(child)}, replaceChildren(){children.length=0}, focus(){}
  };
 }
 for(const [tag,id] of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
  elements.set(id,Object.assign(makeElement(),{hidden:/\shidden\b/.test(tag),checked:/\schecked\b/.test(tag)}));
 }
 const element=id=>elements.get(id);
 const sessionStorage=memoryStorage();
 const historyKey='atha_community_test_chat_fixture';
 const history=()=>JSON.parse(localStorage.getItem(historyKey)||'[]');
 const fetch=async (path,{body,signal})=>{
  const input=JSON.parse(body);
  assert.equal(input.invite,'fixture-invite');
  if(path==='/api/hello')return {ok:true,json:async()=>({testerId:'fixture'})};
  assert.equal(path,'/api/chat');
  const result=await requestChat(input.model,signal,input);
  return {ok:true,json:async()=>result};
 };
 const document={
  getElementById:element,createElement:makeElement,addEventListener(){},body:{classList:{add(){}}}
 };
 const script=(await renderedPage).match(/<script>([\s\S]*?)<\/script>/)[1];
 const timers=new Map();
 const setTimeout=(fn,ms)=>{const id=Symbol();timers.set(id,{fn,ms});return id};
 vm.runInNewContext(script,{document,window:{},location:{pathname:'/',hash:''},fetch,confirm,localStorage,sessionStorage,
  AbortController,TypeError,setTimeout,clearTimeout:id=>timers.delete(id)});
 if(localStorage.getItem('atha_community_test_invite_persistent'))await new Promise(setImmediate);
 else{
  element('invite').value='fixture-invite';
  await element('joinBtn').dispatch('click');
 }
 assert.equal(element('joinModal').hidden,true,'fixture must have joined');
 const bubbleText=who=>element('messages').children.find(el=>el.children[0]?.textContent===who)?.children[1]?.textContent;
 return {element,localStorage,sessionStorage,history,historyKey,bubbleText,timers};
}

test('A visible reply survives reload while its sibling is pending, preserving target order when both finish',async()=>{
 const reply=new Map();
 const client=await openParticipant({requestChat:model=>new Promise(resolve=>reply.set(model,resolve))});
 client.element('message').value='Merhaba';
 const submitted=client.element('composer').dispatch('submit');
 await new Promise(setImmediate);
 reply.get('llama')({status:'ok',answer:'Llama answer'});
 await new Promise(setImmediate);
 assert.deepEqual(client.history().map(m=>m.speaker),['human','llama']);
 const reloaded=await openParticipant({localStorage:client.localStorage});
 assert.equal(reloaded.bubbleText('LLAMA'),'Llama answer');
 reply.get('qwen')({status:'ok',answer:'Qwen answer'});
 await submitted;
 assert.deepEqual(client.history().map(m=>m.content),['Merhaba','Qwen answer','Llama answer']);
});

test('A hanging chat request is aborted, send reopens and the delivered sibling supplies later context',async()=>{
 let stalledSignal,followupHistory;
 const client=await openParticipant({requestChat:(model,signal,input)=>{
  if(input.latest==='Merhaba'&&model==='qwen'){
   stalledSignal=signal;
   return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  }
  followupHistory=input.history;
  return {status:'ok',answer:'Yanıt geldi.'};
 }});
 client.element('message').value='Merhaba';
 const pending=client.element('composer').dispatch('submit');
 await new Promise(setImmediate);
 assert.equal(client.element('send').disabled,true);
 const [deadline]=client.timers.values();
 assert.ok(deadline.ms>0&&deadline.ms<=65000);
 deadline.fn();await pending;
 assert.equal(stalledSignal.aborted,true);
 assert.equal(client.timers.size,0);
 assert.equal(client.element('send').disabled,false);
 assert.match(client.bubbleText('QWEN'),/süresi doldu/u);
 assert.deepEqual(client.history().map(m=>m.speaker),['human','llama']);
 client.element('message').value='Llama, tekrar';
 await client.element('composer').dispatch('submit');
 assert.deepEqual(followupHistory.map(m=>m.speaker),['human','llama']);
});

test('An unavailable reviewer is visible as a failure and stays out of subsequent context',async()=>{
 const client=await openParticipant({requestChat:()=>({status:'review_unavailable',answer:'taslak'})});
 client.element('message').value='Qwen, bakar mısın?';
 await client.element('composer').dispatch('submit');
 assert.match(client.bubbleText('QWEN'),/kontrol edilemedi/u);
 assert.deepEqual(client.history().map(m=>m.role),['user']);
});

test('Clearing a chat prevents a late response from overwriting the next conversation',async()=>{
 let finishOld;
 const client=await openParticipant({confirm:()=>true,requestChat:(model,signal,input)=>{
  if(input.latest==='Qwen, ilk mesaj')return new Promise(resolve=>{finishOld=resolve});
  return {status:'ok',answer:'Yeni yanıt'};
 }});
 client.element('message').value='Qwen, ilk mesaj';
 const old=client.element('composer').dispatch('submit');
 client.element('resetBtn').dispatch('click');
 client.element('message').value='Llama, yeni mesaj';
 await client.element('composer').dispatch('submit');
 finishOld({status:'ok',answer:'Gecikmiş yanıt'});await old;
 assert.deepEqual(client.history().map(m=>m.content),['Llama, yeni mesaj','Yeni yanıt']);
});

test('Report and cancelled logout preserve the session, confirmed logout keeps chat',async()=>{
 let confirmed=false, prompts=0;
 const {element,localStorage,sessionStorage,historyKey}=await openParticipant({confirm:()=>{prompts++;return confirmed}});
 const savedChat=JSON.stringify([{role:'user',speaker:'human',content:'Saved message'}]);
 localStorage.setItem(historyKey,savedChat);
 function assertSession(active) {
  const expected=active?'fixture-invite':null;
  assert.equal(localStorage.getItem('atha_community_test_invite_persistent'),expected);
  assert.equal(sessionStorage.getItem('atha_community_test_invite'),expected);
  assert.equal(element('joinModal').hidden,active);
  assert.equal(localStorage.getItem(historyKey),savedChat);
 }
 element('reportBtn').dispatch('click');
 assert.equal(element('reportModal').hidden,false);
 assert.equal(prompts,0);
 assertSession(true);
 element('closeReport').dispatch('click');
 element('logoutBtn').dispatch('click');
 assert.equal(prompts,1);
 assertSession(true);
 confirmed=true;
 element('logoutBtn').dispatch('click');
 assert.equal(prompts,2);
 assertSession(false);
});


test('reloading an old chat renders the real speaker text and preserves explicitly requested JSON',async()=>{
 const store=memoryStorage();
 const old=(speaker,text)=>JSON.stringify([{speaker,text}]);
 const requested=old('llama','İstenen örnek.');
 const history=[
  {role:'user',speaker:'human',content:'Barışalım mı?'},
  {role:'model',speaker:'qwen',content:old('qwen','Barışalım.')},
  {role:'user',speaker:'human',content:'Bir diyalogu JSON olarak ver.'},
  {role:'model',speaker:'llama',content:requested}
 ];
 store.setItem('atha_community_test_chat_fixture',JSON.stringify(history));
 let sent;
 const client=await openParticipant({localStorage:store,requestChat:(model,signal,input)=>{
  sent=input.history;return {status:'ok',answer:'Tamam.'};
 }});
 assert.equal(client.bubbleText('QWEN'),'Barışalım.');
 assert.equal(client.bubbleText('LLAMA'),requested);
 client.element('message').value='Qwen, selam';
 await client.element('composer').dispatch('submit');
 assert.equal(sent[1].content,'Barışalım.');
 assert.equal(sent[3].content,requested);
});
