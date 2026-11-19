'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),path=require('node:path');
const read=p=>readFileSync(path.resolve(__dirname,'../../',p),'utf8');
const source=read('labapp/src/main/assets/task-bridge-lab.html');
const engine=read('labapp/src/main/assets/task-bridge-engine.js');
const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);

test('the real WebView engine and single chat application script parse',()=>{
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(engine));
 assert.doesNotThrow(()=>new vm.Script(scripts[0]));
 assert.match(source,/id="chat"/);
 assert.match(source,/id="message"/);
 assert.match(source,/id="reportOpen"/);
 assert.match(source,/id="sendReport"/);
 assert.doesNotMatch(source,/id="history"|id="latest"|id="analyze"|id="compare-models"/);
});
function mockUI(){
 const nodes={},handlers={},appended=[];
 function node(id=''){
  if(nodes[id])return nodes[id];
  const o={id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,scrollTop:0,scrollHeight:100,children:[],className:'',style:{},checked:false,
    addEventListener:(e,fn)=>{handlers[id+':'+e]=fn;},
    appendChild(child){this.children.push(child);if(id==='chat')appended.push(child);return child;},
    replaceChildren(){this.children=[];},
    classList:{remove(){},add(){}},
    requestSubmit(){handlers['compose:submit']({preventDefault(){}});}
  };
  nodes[id]=o;return o;
 }
 const native={tokenConfigured:()=>true,health:()=>{},compare:(id,raw)=>{native.lastCompare={id,body:JSON.parse(raw)};},saveToken:()=>true,sendBugReport:(id,raw)=>{native.lastReport={id,body:JSON.parse(raw)}}};
 const ctx={window:{LabNative:native},document:{getElementById:node,createElement:()=>({textContent:'',className:'',children:[],classList:{remove(){},add(){}},appendChild(child){this.children.push(child)}})},console};
 vm.createContext(ctx);
 vm.runInContext(engine,ctx,{timeout:3000});
 vm.runInContext(scripts[0],ctx,{timeout:3000});
 return {nodes,handlers,node,appended,native,ctx};
}
test('independent chat responses: fast Qwen renders before slower Llama; identity context carried',()=>{
 const {node,handlers,native,appended,ctx}=mockUI();
 node('message').value='Ana Konsey uygulamasına dokunma.';
 handlers['compose:submit']({preventDefault(){}});
 assert.equal(native.lastCompare.body.latest,'Ana Konsey uygulamasına dokunma.');
 assert.equal(node('send').disabled,true);
 const req=native.lastCompare.id;
 ctx.window.athaGatewayResult(req+'_qwen',{_http:200,results:{qwen:{status:'ok',answer:'Qwen: Ana korunsun'}}});
 assert.equal(node('send').disabled,true,'slow model still pending; fast response already visible');
 assert.ok(appended.some(el=>el.children?.some(ch=>ch.textContent==='Qwen: Ana korunsun')));
 ctx.window.athaGatewayResult(req+'_llama',{_http:200,results:{llama:{status:'ok',answer:'Llama: TEST ayrı'}}});
 assert.equal(node('send').disabled,false);
 assert.ok(appended.some(el=>el.children?.some(ch=>ch.textContent==='Llama: TEST ayrı')));
 node('message').value='Peki sadece TEST uygulamasını güncelle.';
 handlers['compose:submit']({preventDefault(){}});
 assert.match(native.lastCompare.body.context,/Ana Konsey uygulamasına dokunma/);
 assert.match(native.lastCompare.body.context,/qwen: Qwen: Ana korunsun/);
});
test('report is opt-in and can be reviewed by reference without exposing credentials',()=>{
 const {node,handlers,native,ctx}=mockUI();
 node('reportLabel').value='Bağlam unutuldu';
 node('actual').value='Llama yanlış hatırladı';
 node('expected').value='Son karar korunmalı';
 handlers['sendReport:click']();
 assert.equal(native.lastReport,undefined,'no consent, no request');
 node('reportConsent').checked=true;
 handlers['sendReport:click']();
 assert.equal(native.lastReport.body.consent,true);
 assert.deepEqual(native.lastReport.body.messages,[],'no transcript without separate consent');
 ctx.window.athaGatewayResult('report',{_http:201,saved:true,id:'report_test'});
 assert.match(node('reportResult').textContent,/report_test/);
});

test('directed Qwen/Llama conversation and follow-ups do not make both answer',()=>{
 const {node,handlers,native,ctx}=mockUI();
 function send(v){node('message').value=v;handlers['compose:submit']({preventDefault(){}});return native.lastCompare;}
 function answer(req,model,text){ctx.window.athaGatewayResult(req.id+'_'+model,{_http:200,results:{[model]:{status:'ok',answer:text}}});}
 let x=send('Ahahahaha Qwen canımsın ya Llama sen ne hatırlıyosun');
 assert.equal(x.body.models.join(','),'llama');
 answer(x,'llama','Bu konuşmada geçenleri biliyorum.');
 assert.equal(node('send').disabled,false);
 x=send('Hangi bilgileri edindin balım');
 assert.equal(x.body.models.join(','),'llama','follow-up must stay with Llama');
 answer(x,'llama','Şu konuşmamızdaki bilgiler.');
 x=send('Qwen o sensin amk, kime teşekkür ediyorsun?');
 assert.equal(x.body.models.join(','),'qwen');
 answer(x,'qwen','Haklısın, kendime teşekkür ettim.');
 x=send('Selammm');
 assert.equal(x.body.models.join(','),'qwen,llama','new generic greeting goes to both');
});
