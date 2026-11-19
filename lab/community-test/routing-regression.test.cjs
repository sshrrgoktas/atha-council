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
test('History appended only after all model replies settle in target order',()=>{
 assert.match(html,/const ordered=await Promise\.all\(responses\);\s*history\.push\(\.\.\.ordered\);saveHistory\(\)/);
 assert.doesNotMatch(html,/history\.push\(\{role:'model',speaker:model,content:value/);
});
