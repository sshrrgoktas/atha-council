'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const bot=require('./council-autopilot.cjs');
test('canonical requests bind method, exact route, timestamp and body without credential leakage',()=>{
 const raw=JSON.stringify({room_id:'room_1',since_ms:0});
 const c=bot.canonical('POST','/api/atha-opencode/poll','1794835000000',raw);
 assert.equal(c.split('\n').length,4);
 assert.equal(c.split('\n')[3],crypto.createHash('sha256').update(raw).digest('base64url'));
 assert.notEqual(c,bot.canonical('POST','/api/atha-opencode/reply','1794835000000',raw));
});
test('only completed visible model text is accepted',()=>{
 const make=a=>a.map(x=>JSON.stringify(x)).join('\n');
 assert.deepEqual(bot.filterModelEvents(make([{type:'step_start'},{type:'text',part:{text:'Merhaba!'}},{type:'step_finish'}])),{ok:true,text:'Merhaba!'});
 assert.deepEqual(bot.filterModelEvents(make([{type:'text',part:{text:'<think>secret</think>Merhaba!'}},{type:'step_finish'}])),{ok:true,text:'Merhaba!'});
 assert.equal(bot.filterModelEvents(make([{type:'text',part:{text:'İşlem sürüyor'}}])).reason,'INCOMPLETE');
 assert.equal(bot.filterModelEvents(make([{type:'tool_use',part:{tool:'shell'}},{type:'text',part:{text:'Yaptım.'}},{type:'step_finish'}])).reason,'TOOL_USED');
 assert.equal(bot.filterModelEvents(make([{type:'text',part:{text:'<think>unfinished'}},{type:'step_finish'}])).ok,false);
 assert.equal(bot.filterModelEvents(make([{type:'error'},{type:'step_finish'}])).reason,'MODEL_ERROR');
});
test('daily free-call budget limits model invocation',()=>{
 let s={quota:{date:'',used:0}};
 assert.equal(bot.quotaAvailable(s),true);
 assert.match(s.quota.date,/^\d{4}-\d\d-\d\d$/);
 s.quota.used=25;assert.equal(bot.quotaAvailable(s),false);
 s.quota.date='1999-01-01';assert.equal(bot.quotaAvailable(s),true);
 assert.equal(s.quota.used,0);
});
