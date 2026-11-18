'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const worker=require('./council-work-agent.cjs');
test('worker signs exact request body and fixed endpoint',()=>{
 const c=worker.canonical('POST','/api/atha-opencode/work-poll','1794960000000','{"room_id":"r123"}');
 assert.equal(c.split('\n').length,4);
 assert.notEqual(c,worker.canonical('POST','/api/atha-opencode/work-result','1794960000000','{"room_id":"r123"}'));
});
test('OpenCode cannot use shell, external directory or subagents; config is uneditable',()=>{
 const p=worker.workerConfig();
 const q=p.agents['council-worker'].permissions;
 const deny=(action,resource='*')=>q.some(x=>x.action===action&&x.resource===resource&&x.effect==='deny');
 assert.equal(deny('shell'),true);assert.equal(deny('external_directory'),true);
 assert.equal(deny('execute'),true);assert.equal(deny('subagent'),true);
 assert.equal(deny('edit','opencode.json'),true);assert.equal(deny('edit','.git/*'),true);
 assert.ok(q.some(x=>x.action==='edit'&&x.resource==='*'&&x.effect==='allow'));
});
test('all changed file paths are validated and secrets/parent escapes rejected',()=>{
 for(const p of ['worker/production.js','test/feature.test.mjs','app/src/main/MainActivity.kt'])assert.equal(worker.validPath(p),true);
 for(const p of ['../secrets','.git/config','opencode.json','../../private.env','C:\\Users\\seher\\secret','/etc/passwd','dir/../evil',''])assert.equal(worker.validPath(p),false,p);
});
test('worker is a separate PC process, not a chat responder and never auto-pushes',()=>{
 const src=readFileSync(__filename.replace(/council-work-agent\.test\.cjs$/, 'council-work-agent.cjs'),'utf8');
 assert.match(src,/agent-config\.json/);
 assert.match(src,/work-poll/);
 assert.match(src,/work-result/);
 assert.doesNotMatch(src,/\/api\/atha-opencode\/reply/);
 assert.match(src,/git.+diff.+--check|run\('git',\['diff','--check'\]/s);
 assert.match(src,/Kod testleri: çalıştırılmadı/);
});
