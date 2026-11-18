import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../worker/production.js',import.meta.url),'utf8');
const android=readFileSync(new URL('../app/build.gradle.kts',import.meta.url),'utf8');
test('Council rollback contains no OpenCode integration or chat participant',()=>{
  assert.doesNotMatch(worker,/opencode|open code/i);
  assert.match(worker,/council_list_rooms/);
  assert.match(worker,/council_reply/);
});
test('Council keeps a distinct Android package identity during rollback',()=>{
  assert.ok(android.includes('applicationId = "com.atlascouncil.app"'));
});
