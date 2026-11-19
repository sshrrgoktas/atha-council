'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../../');
const read=p=>readFileSync(path.join(root,p),'utf8');
const source=read('labapp/src/main/assets/task-bridge-lab.html');
const engine=read('labapp/src/main/assets/task-bridge-engine.js');
test('all scripts in the actual composed WebView HTML parse',()=>{
 const composed=source.replace('<!--ENGINE_HERE-->','<script>'+engine+'</script>');
 const scripts=[...composed.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert.equal(scripts.length,3);
 scripts.forEach((script,index)=>assert.doesNotThrow(()=>new vm.Script(script,{filename:'webview-inline-'+index+'.js'})));
});
test('LAB analyze click and on-load evaluation really update result area',()=>{
 const handlers={};
 const nodes={history:{value:'Çevrilebilir e-kitap yap'},latest:{value:'Hadi yap canım'},out:{textContent:'Test sonucu burada görünecek.',innerHTML:''},analyze:{addEventListener:(_,fn)=>handlers.analyze=fn},example:{addEventListener:(_,fn)=>handlers.example=fn}};
 const window={};
 const ctx={window,document:{getElementById:id=>nodes[id]},console};vm.createContext(ctx);
 vm.runInContext(engine,ctx,{timeout:3000});
 const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
 assert.equal(scripts.length,2);
 vm.runInContext(scripts[0][1],ctx,{timeout:3000});
 assert.match(nodes.out.innerHTML,/Benim anladığım/);
 assert.match(nodes.out.innerHTML,/e-kitap/);
 assert.equal(typeof handlers.analyze,'function');
 nodes.latest.value='İptal et';handlers.analyze();
 assert.match(nodes.out.innerHTML,/OpenCode/);
 assert.notEqual(nodes.out.textContent,'Köprü testi hata verdi');
});

test('live TEST model panel registers real native callbacks and updates all three cards',()=>{
 const handlers={};
 const nodes={};
 const node=id=>nodes[id]||(nodes[id]={textContent:'',value:'',hidden:false,disabled:false,addEventListener:(event,fn)=>{handlers[id+':'+event]=fn;}});
 node('history').value='Konseyi bozma';
 node('latest').value='Task Bridge ayrı testte çalışsın';
 let tokenSaved=false,healthCalled=false,compareCalled=false;
 const native={
   tokenConfigured:()=>tokenSaved,
   saveToken:v=>{tokenSaved=v.length>=30;return tokenSaved;},
   health:()=>{healthCalled=true;},
   compare:()=>{compareCalled=true;}
 };
 const window={LabNative:native};
 const ctx={window,document:{getElementById:node},console};
 vm.createContext(ctx);
 const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
 vm.runInContext(scripts[1][1],ctx,{timeout:3000});
 assert.equal(healthCalled,true);
 assert.match(node('bridge-status').textContent,/anahtar/);
 node('bridge-key').value='a'.repeat(40);
 handlers['bridge-save:click']();
 handlers['compare-models:click']();
 assert.equal(compareCalled,true);
 window.athaGatewayResult('compare',{_http:200,results:{gemini:{status:'not_configured'},qwen:{status:'ok',answer:'Qwen anladı'},llama:{status:'ok',answer:'Llama anladı'}}});
 assert.match(node('qwen-answer').textContent,/Qwen anladı/);
 assert.match(node('llama-answer').textContent,/Llama anladı/);
 assert.match(node('gemini-answer').textContent,/anahtarı|anahtarı|anahtar/i);
});
