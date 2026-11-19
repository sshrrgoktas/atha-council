'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const gradle=read('labapp/build.gradle.kts');
const manifest=read('labapp/src/main/AndroidManifest.xml');
const activity=read('labapp/src/main/java/com/atlascouncil/taskbridgelab/LabActivity.kt');
const engine=read('labapp/src/main/assets/task-bridge-engine.js');
const html=read('labapp/src/main/assets/task-bridge-lab.html');
test('stable unique test app identity with independent launcher',()=>{
 assert.match(gradle,/applicationId = "com\.atlascouncil\.taskbridgelab"/);
 assert.doesNotMatch(gradle,/applicationIdSuffix/);
 assert.match(manifest,/android:label="Atha Council TEST"/);
 assert.equal((manifest.match(/android.intent.category.LAUNCHER/g)||[]).length,1);
 assert.doesNotMatch(manifest,/android:scheme=|google-auth|github-auth/);
});
test('only isolated TEST connection can use network; web content stays offline',()=>{
 assert.match(manifest,/android.permission.INTERNET/);
 assert.doesNotMatch(manifest,/REQUEST_INSTALL_PACKAGES|android:scheme/);
 for(const marker of ['blockNetworkLoads','allowFileAccess','allowContentAccess','domStorageEnabled','loadDataWithBaseURL','task-bridge-engine.js'])assert.ok(activity.includes(marker),marker);
 assert.ok(activity.includes('web.addJavascriptInterface(LabNativeBridge(), "LabNative")'));
 assert.ok(activity.includes('atha-council-taskbridge-lab.sshrrgoktas.workers.dev'));
 assert.doesNotMatch(activity,/api\\.openai|atlas-council\\.sshrrgoktas|athalai-mobile/);
});
test('approved Council app files stay unchanged from separation base',()=>{
 const main=read('app/src/main/java/com/atlascouncil/app/MainActivity.kt');
 const production=read('app/build.gradle.kts');
 assert.match(production,/applicationId = "com\.atlascouncil\.app"/);
 assert.doesNotMatch(main,/showTaskBridgeLab|task-bridge-lab\.html/);
});
test('bundled Task Bridge really interprets previous human request offline',()=>{
 const sandbox={window:{},console};vm.runInNewContext(engine,sandbox,{timeout:4000});
 const b=sandbox.window.AthaLab;
 assert.equal(typeof b.shadowReview,'function');
 const t=b.interpretCouncilTask([{role:'user',content:'Çevrilebilir e-kitap yap'},{role:'user',content:'Hadi yap'}]);
 assert.equal(t.intent.id,'ebook');assert.equal(t.workerDispatchAllowed,false);
 const stop=b.interpretCouncilTask([{role:'user',content:'E-kitap yap'},{role:'user',content:'İptal et'}]);
 assert.equal(stop.status,'blocked');
});
test('TEST HTML has no live OpenCode dispatch',()=>{
 assert.match(html,/window\.AthaLab/);
 assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|<script\s+src/);
});
