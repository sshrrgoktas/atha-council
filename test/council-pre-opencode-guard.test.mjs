import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const android=readFileSync(new URL('../app/build.gradle.kts',import.meta.url),'utf8');
test('Council allows OpenCode only in signed and approved tasks, never as chat participant',()=>{
  assert.match(worker,/async function handleCouncilTasks/);
  assert.match(worker,/async function handleOpenCodeAgent/);
  assert.match(worker,/if\(verb==='poll'\)return respond\(\{room_id:room,events:\[\],retired_to:'task_center'/);
  assert.match(worker,/if\(verb==='reply'\)return respond\(\{error:'chat_participant_retired'/);
  assert.match(worker,/council_list_rooms/);
  assert.match(worker,/council_reply/);
});
test('Council keeps a distinct Android package identity during rollback',()=>{
  assert.ok(android.includes('applicationId = "com.atlascouncil.app"'));
});
