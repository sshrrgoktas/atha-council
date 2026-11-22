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

for(const model of ['qwen','llama']){
  test(model+' rejects impersonation in plain text and Markdown and regenerates exactly once',async()=>{
    const mixed='**Llama:** Bana takıldın.\n\n**Qwen**: Ona takıldın.';
    const latest='İkiniz de kendi adınıza söyler misiniz, az önce kime takıldım?';
    for(const draft of [mixed,'Llama: Benimle takıldın.\nQwen: Ben Qwen’im.',
      JSON.stringify([{speaker:model,text:mixed}]),'### LLAMA： Merhaba.\n- _Qwen:_ Günaydın.']){
      let count=0;
      const output=await chat(model,latest,()=>({response:++count===1?draft:'Llama’ya takıldın.'}));
      assert.equal(count,2);
      assert.equal(output.answer,'Llama’ya takıldın.');
    }
    let attempts=0;
    const wrong=model==='qwen'?'Llama':'Qwen';
    const forever=await chat(model,latest,()=>({response:(attempts++,wrong+': Bunu ben söyledim.')}));
    assert.equal(attempts,2);
    assert.notEqual(forever.status,'ok');
    assert.equal(forever.answer,undefined);
  });
  test(model+' removes its own heading and preserves prose, fiction, code and requested quotations',async()=>{
    const both='Llama: Merhaba!\n\n**Qwen:** Günaydın.';
    const single='**'+model.toUpperCase()+':** Buradayım.\n\nÇaya ne dersin?';
    for(const [latest,draft,answer] of [
      ['Selam',single,'Buradayım.\n\nÇaya ne dersin?'],
      ['Selam','Qwen bunu söyledi. Llama da güldü.','Qwen bunu söyledi. Llama da güldü.'],
      ['İki repliklik bir diyalog yaz.',both,both],
      ['Kısa bir hikâye yaz.',both,both],
      ['Bana bu iki modelin sözlerini alıntıla.',both,both],
      ['Bu replikleri İngilizceye çevir.',both,both],
      ['Write a dialogue between Qwen and Llama.',both,both],
      ['Write the following code exactly.','```txt\n'+both+'\n```','```txt\n'+both+'\n```']
    ]){
      const output=await chat(model,latest,{response:draft});
      assert.equal(output.answer,answer,latest);
    }
  });
}


test('one temporary capacity refusal is retried, a continued refusal is visible',async()=>{
 for(const recover of [true,false]){
  let calls=0;
  const result=await chat('qwen','Selam',()=>{
   calls++;
   if(!recover||calls===1)throw Error('3040: Capacity temporarily exceeded, please try again.');
   return {response:'Merhaba!'};
  });
  assert.equal(calls,2);
  assert.equal(result.status,recover?'ok':'provider_busy');
 }
});
