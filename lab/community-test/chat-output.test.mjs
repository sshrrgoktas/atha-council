import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from './worker.mjs';

const invite='synthetic_chat_output_fixture_only';
async function chat(model,latest,raw) {
  const env={
    COMMUNITY:{async get(k){return k==='invite:'+invite?{testerId:'output',expiresAt:'2099-01-01'}:null;},async put(){}},
    AI:{async run(){return typeof raw==='function'?raw():raw;}}
  };
  const request=new Request('https://test.invalid/api/chat',{method:'POST',body:JSON.stringify({model,latest,history:[],invite})});
  const response=await worker.fetch(request,env);
  assert.equal(response.status,200);
  return response.json();
}
for(const model of ['qwen','llama']){
  test(model+' returns only its own answer from a serialized dialogue record',async()=>{
    const own={speaker:model.toUpperCase(),text:'Birinci satır.\n\nİkinci satır 🙂'};
    for(const text of [JSON.stringify(own),JSON.stringify([own]),'```json\n'+JSON.stringify([own])+'\n```']){
      const output=await chat(model,'Biyoloji',{choices:[{finish_reason:'stop',message:{content:text}}]});
      assert.equal(output.answer,own.text);
      assert.equal(output.status,'ok');
    }
  });
  test(model+' excludes foreign turns, incomplete records and hidden reasoning',async()=>{
    const other=model==='qwen'?'llama':'qwen';
    const own={speaker:model,text:'Kendi yanıtım.'},foreign={speaker:other,text:'Başkasının satırı.'};
    for(const draft of [JSON.stringify([foreign]),JSON.stringify([own,foreign]),JSON.stringify([own,own]),JSON.stringify([{speaker:model}]),'[{"speaker":"'+model+'","text":"yarım',JSON.stringify([{speaker:model,text:'<think>iç değerlendirme</think>'}])]){
      const output=await chat(model,'Biyoloji',{response:draft});
      assert.notEqual(output.status,'ok');
      assert.equal(output.answer,undefined);
    }
    const inner=JSON.stringify([{speaker:model,text:'<think>iç değerlendirme</think>\nGerçek yanıt.'}]);
    const output=await chat(model,'Biyoloji',{text:inner});
    assert.equal(output.answer,'Gerçek yanıt.');
  });
  test(model+' preserves requested data, source code, and fiction',async()=>{
    const requested=JSON.stringify([{speaker:'llama',text:'Birinci replik.'},{speaker:'qwen',text:'İkinci replik.'}]);
    const story='Maya ışığı açtı.\n“Bu bizim hikâyemiz,” dedi.';
    for(const [latest,draft,answer] of [
      ['İki repliği JSON biçiminde ver.',requested,requested],
      ['Aynı kodu yaz.','```js\nconst value = '+requested+';\n```','```js\nconst value = '+requested+';\n```'],
      ['İki sayı ver.','[2,3]','[2,3]'],
      ['Hoparlörün özellikleri neler?','{"speaker":"JBL","watts":10}','{"speaker":"JBL","watts":10}'],
      ['Kısa bir hikâye yaz.',JSON.stringify([{speaker:model,text:story}]),story],
      ['JSON yazma, düz metin istiyorum.',JSON.stringify([{speaker:model,text:'Tabii.'}]),'Tabii.'],
      ['JSON nedir?',JSON.stringify([{speaker:model,text:'Bir veri biçimi.'}]),'Bir veri biçimi.']
    ]){
      const output=await chat(model,latest,{response:draft});
      assert.equal(output.answer,answer);
      assert.equal(output.status,'ok');
    }
  });
}


test('a malformed speaker response can recover in the same turn',async()=>{
  const attempts=[];
  const response=await chat('qwen','Selam',()=>{
    const first=attempts.length===0;
    attempts.push(first);
    return {response:first?'[{"speaker":"llama","text":"Llama replied"}]':'Merhaba!'};
  });
  assert.equal(attempts.length,2);
  assert.equal(response.status,'ok');
  assert.equal(response.answer,'Merhaba!');
});
