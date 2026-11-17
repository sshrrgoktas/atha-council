// Regression tests for a private, owner-scoped published Council Handoff.
// No real provider inference, network, production DB mutation, or secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const companion=readFileSync(new URL('../worker/opencode-companion/council-autopilot.cjs',import.meta.url),'utf8');
const runtime=await import('data:text/javascript;base64,'+Buffer.from(source+
 '\nexport {councilNormalizedHandoff,councilHandoffPrompt,councilReadRoomHandoff,councilContextPacket};').toString('base64'));
const page='https://chatgpt.com/space/page_76c42313455881919ee0242109385919';
const data={project_id:'atha-council',version:1,source_page:page,reviewed_at:'2026-11-17',
 approved_decisions:[{id:'AC-USER-001',text:'Only human messages open model turns'},
  {id:'AC-USER-002',text:'OpenCode stays separate from ChatGPT'}],
 open_tasks:[{id:'AC-MEM-007',text:'Complete and test the shared decision handoff'}],
 verified_changes:[{id:'PR-71',text:'Human-only routing verified on GitHub CI'}]};

test('approved decisions and open tasks stay distinct, source and version are preserved',()=>{
 const x=runtime.councilNormalizedHandoff(data);
 assert.equal(x.version,1);
 assert.equal(x.source_page,page);
 assert.equal(x.approved_decisions.length,2);
 assert.equal(x.open_tasks.length,1);
 assert.match(runtime.councilHandoffPrompt(x),/AC-MEM-007/);
 assert.match(runtime.councilHandoffPrompt(x),/PR-71/);
 assert.match(runtime.councilHandoffPrompt(x),/human messages/);
 assert.ok(!runtime.councilNormalizedHandoff({...data,source_page:'https://evil.example/fake'}));
 assert.ok(!runtime.councilNormalizedHandoff({...data,project_id:'other-app'}));
});

test('context freeze includes decision IDs and changes its hash when approved memory changes',async()=>{
 const items=[{role:'user',speakerId:'human',content:'What were we fixing?'},
 {role:'assistant',speakerId:'meta',content:'We were chatting'}];
 const a=await runtime.councilContextPacket(items,'room_test','evt_test1',data);
 const b=await runtime.councilContextPacket(items,'room_test','evt_test1',data);
 const missing=await runtime.councilContextPacket(items,'room_test','evt_test1');
 assert.equal(a.schema,'council.context.v1');
 assert.equal(a.snapshot_hash,b.snapshot_hash);
 assert.notEqual(a.snapshot_hash,missing.snapshot_hash);
 assert.deepEqual(a.approved_decision_ids,['AC-USER-001','AC-USER-002']);
 assert.equal(a.project_memory.open_tasks[0].id,'AC-MEM-007');
 assert.equal(a.turn_id,'evt_test1');
 assert.equal(a.history_truncated,false);
 assert.deepEqual(missing.approved_decision_ids,[]);
});

test('private Handoff read is strictly joined to the exact owner and room',async()=>{
 let sql='',args=[];
 const row={project_id:data.project_id,version:data.version,source_page:data.source_page,
  reviewed_at:data.reviewed_at,decisions_json:JSON.stringify(data.approved_decisions),
  open_tasks_json:JSON.stringify(data.open_tasks),verified_changes_json:JSON.stringify(data.verified_changes)};
 const env={ATHA_SYNC_DB:{prepare(statement){sql=statement;return {bind(...values){args=values;return {first:async()=>row}}}}}};
 const got=await runtime.councilReadRoomHandoff(env,'github:101','room_test');
 assert.equal(got.version,1);
 assert.match(sql,/JOIN atha_sync_rooms r ON r.owner_id=h.owner_id AND r.room_id=h.room_id/);
 assert.match(sql,/h.owner_id=\? AND h.room_id=\?/);
 assert.deepEqual(args,['github:101','room_test']);
 const foreign=await runtime.councilReadRoomHandoff({ATHA_SYNC_DB:{prepare(){return {bind(){return {first:async()=>null}}}}}},'github:other','room_test');
 assert.equal(foreign,null);
});

test('older D1 fixtures with no Handoff table fail safely without a fake decision list',async()=>{
 const env={ATHA_SYNC_DB:{prepare(){throw Error('no such table')}}};
 assert.equal(await runtime.councilReadRoomHandoff(env,'github:101','room_test'),null);
 assert.equal(await runtime.councilReadRoomHandoff(env,'github:101',''),null);
});

test('four target model adapters use authorized room memory and keep source isolation',()=>{
 assert.match(source,/const publishedHandoff=appended.length\?await councilReadRoomHandoff\(env,owner,roomId\):null/);
 assert.match(source,/context_packet:\{\.\.\.contextPacket,turn_id:id\}/);
 assert.match(source,/councilHandoffPrompt\(contextPacket.project_memory\)/); // Qwen
 assert.match(companion,/packet\?\.project_memory\|\|null/); // signed OpenCode event
 assert.match(source,/const authorizedHandoff=await councilAuthorizedHandoff\(req,env,body.room_id\)/); // Gemini
 assert.match(source,/const authorizedHandoff=await councilAuthorizedHandoff\(req,env,b.room_id\)/); // Llama
 assert.match(source,/enabledAthaSyncRooms.has\(currentChatId\)\?currentChatId:null/);
 assert.match(source,/if\(match\[2\]==='handoff'\)/);
 assert.match(source,/if\(req.method!=='GET'\)return athaSyncReply\(\{error:'Read-only Handoff'\},405\)/);
});
