// Regression contract for the explicitly user-driven Atha Council policy.
// No network, real providers, DB mutations, tokens or inference cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+
 Buffer.from(source+'\nexport {COUNCIL_HUMAN_TURNS_ONLY,councilContextPacket,beginCouncilDialogue,finishCouncilDialogue,rememberCouncilDialogue,runCouncilDialogue,resumeCouncilDialogues,councilQwenAutoRespond,queueManualCouncilEvent};').toString('base64'));

test('human-only policy is on in the Worker and rejects direct model-to-model dialogue',async()=>{
 assert.equal(runtime.COUNCIL_HUMAN_TURNS_ONLY,true);
 const request=new Request('https://atlas-council.sshrrgoktas.workers.dev/api/google/chat');
 await assert.rejects(
  runtime.beginCouncilDialogue(request,{}, {dialogue:{room_id:'room_one',parent_reply_id:'qwen_evt_old'}}),
  /MODEL_TURN_TRIGGER_DISABLED/
 );
 assert.equal(await runtime.finishCouncilDialogue({}, {id:'legacy'},'Bad auto reply'),false);
 assert.equal(await runtime.rememberCouncilDialogue({}, {},'owner','room'),false);
 assert.equal(await runtime.runCouncilDialogue({},'owner','room'),undefined);
 assert.equal(await runtime.resumeCouncilDialogues({}),undefined);
});

test('Gemini and other model messages cannot call Qwen inference',async()=>{
 let calls=0;
 const env={ATHA_SYNC_DB:{},AI:{run:async()=>{calls++;return {response:'unexpected'};}}};
 const result=await runtime.councilQwenAutoRespond(env,'owner','room','evt_example1','Model text','gemini');
 assert.equal(result,false);
 assert.equal(calls,0);
});

test('A manual retry cannot create a new standalone model turn',async()=>{
 await assert.rejects(
  runtime.queueManualCouncilEvent({},'owner','room','retry',{request_id:'retry_123456789012345'},null),
  /Yeni yanıt için yeni bir kullanıcı mesajı/
 );
});

test('same authorized snapshot generates the same 20-message context hash for every adapter',async()=>{
 const items=Array.from({length:24},(_,i)=>({
  role:i%3===0?'user':'assistant',
  speakerId:i%3===0?'human':i%2?'meta':'gemini',
  name:i%3===0?'Kullanıcı':'Katılımcı',
  content:'Mesaj '+i
 }));
 const a=await runtime.councilContextPacket(items,'room_a','evt_real1');
 const b=await runtime.councilContextPacket(items,'room_a','evt_real1');
 assert.equal(a.schema,'council.context.v1');
 assert.equal(a.context_version,1);
 assert.equal(a.snapshot_hash,b.snapshot_hash);
 assert.equal(a.turn_id,'evt_real1');
 assert.equal(a.messages.length,20);
 assert.equal(a.messages[0].snapshotIndex,4);
 assert.equal(a.history_truncated,true);
 assert.deepEqual(a.approved_decision_ids,[]);
 assert.deepEqual(a.messages,b.messages);
 assert.notEqual((await runtime.councilContextPacket(items,'room_b','evt_real1')).snapshot_hash,a.snapshot_hash);
});

test('context packet preserves human identity and reports truncated history without inventing decisions',async()=>{
 const items=[{role:'user',speakerId:'human',content:'Llama nerde'},{role:'assistant',speakerId:'meta',content:'Buradayım'},{role:'user',speakerId:'human',content:'Sen niye bişi demiyosun'}];
 const a=await runtime.councilContextPacket(items,'room_a','evt_test');
 assert.deepEqual(a.messages.map(m=>m.speakerId),['human','meta','human']);
 assert.equal(a.history_truncated,false);
 assert.equal(a.messages.at(-1).content,'Sen niye bişi demiyosun');
 assert.ok(typeof a.snapshot_hash==='string'&&a.snapshot_hash.length>20);
 assert.deepEqual(a.approved_decision_ids,[]);
});

test('no background cron or read-only reply polling starts Gemini; user messages still reach Qwen',()=>{
 assert.match(source,/if\(COUNCIL_HUMAN_TURNS_ONLY\|\|!env\.ATHA_SYNC_DB\)return;/);
 assert.match(source,/source!=='human'/);
 assert.match(source,/ctx\.waitUntil\(councilQwenAutoRespond\(env,owner,roomId,eventIds\[index\],turn\.content\)\)/);
 assert.doesNotMatch(source,/if\(currentChatId===roomId&&!d\.serverDialogue\)continueCouncilDialogue/);
 assert.doesNotMatch(source,/await resumeCouncilDialogues\(env\);\s*\},\s*fetch:councilFetch/);
 assert.match(source,/context_packet:contextPacket/);
 assert.match(source,/snapshot_hash:contextPacket\.snapshot_hash/);
});
