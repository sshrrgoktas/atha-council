'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const kotlin=read('app/src/main/java/com/atlascouncil/app/MainActivity.kt');
const html=read('app/src/main/assets/task-bridge-lab.html');
const js=read('app/src/main/assets/task-bridge-engine.js');
test('one Council activity and no AthalAI routes added',()=>{
 const manifest=read('app/src/main/AndroidManifest.xml');
 assert.equal((manifest.match(/android.intent.category.LAUNCHER/g)||[]).length,1);
 assert.doesNotMatch(manifest,/com\.athalai|PcWorkspace/);
 assert.match(kotlin,/menu\.add\(0,102,3,"Task Bridge • LAB"\)/);
 assert.match(kotlin,/102 -> \{showTaskBridgeLab\(\);return true\}/);
});
test('lab is an offline isolated WebView without native bridge or network permission',()=>{
 const start=kotlin.indexOf('private fun showTaskBridgeLab()');
 const end=kotlin.indexOf('override fun onCreateOptionsMenu',start);
 const lab=kotlin.slice(start,end);
 for(const marker of ['allowFileAccess=false','allowContentAccess=false','blockNetworkLoads=true','domStorageEnabled=false','loadDataWithBaseURL(null','task-bridge-lab.html','task-bridge-engine.js'])assert.ok(lab.includes(marker),marker);
 assert.doesNotMatch(lab,/addJavascriptInterface|startActivity|https:\/\/|api\.openai/);
});
test('real offline interpreter is bundled into APK asset and can interpret context',()=>{
 const ctx={window:{},console};vm.runInNewContext(js,ctx,{timeout:3000});
 const b=ctx.window.AthaLab;
 assert.equal(typeof b.interpretCouncilTask,'function');
 assert.equal(typeof b.shadowReview,'function');
 assert.equal(typeof b.prepareOpenCodeHandoff,'function');
 const t=b.interpretCouncilTask([{role:'user',content:'Çevrilebilir e-kitap yap'},{role:'user',content:'Hadi yap'}]);
 assert.equal(t.intent.id,'ebook');assert.equal(t.workerDispatchAllowed,false);
 const stop=b.interpretCouncilTask([{role:'user',content:'E-kitap yap'},{role:'user',content:'İptal et'}]);
 assert.equal(stop.status,'blocked');
});
test('HTML uses bundled analyzer and never sends work to real OpenCode',()=>{
 assert.match(html,/window\.AthaLab\.shadowReview/);
 assert.match(html,/window\.AthaLab\.prepareOpenCodeHandoff/);
 assert.match(html,/OpenCode'a gönderildi mi/);
 assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|<script\s+src/);
});

test('one-time test menu can be hidden locally without a second APK',()=>{
 assert.match(kotlin,/setNeutralButton\("Testi bitir, gizle"\)/);
 assert.match(kotlin,/getSharedPreferences\("atha-council-task-bridge-lab",MODE_PRIVATE\)/);
 assert.match(kotlin,/putBoolean\("hidden",true\)/);
 assert.match(kotlin,/getBoolean\("hidden",false\)/);
 assert.match(kotlin,/invalidateOptionsMenu\(\)/);
});
