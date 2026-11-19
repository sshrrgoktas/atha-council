import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const source = path => new URL('../'+path,import.meta.url);
const read = path => readFileSync(source(path),'utf8');
const main=read('app/src/main/java/com/atlascouncil/app/MainActivity.kt');
const menu=read('app/src/main/assets/unified-council-menu.js');
const manifest=read('app/src/main/AndroidManifest.xml');

test('Council alone provides a native launcher, authentication, speech, sharing and backups',()=>{
 assert.equal((manifest.match(/android.intent.category.LAUNCHER/g)||[]).length,1);
 for(const marker of ['startGoogleLogin','startGitHubLogin','startSpeech','stopSpeech','shareText','openUpdates','ACTION_OPEN_DOCUMENT','EXTRA_ALLOW_MULTIPLE','parseResult(resultCode,data)'])assert.ok(main.includes(marker),marker);
 assert.match(menu,/exportCurrent/);
 assert.match(menu,/drawerBackup/);
});
test('Council contains no PC workspace, tunnel or main AthalAI application references',()=>{
 for(const path of ['app/src/main/java/com/atlascouncil/app/PcWorkspaceActivity.java','app/src/main/java/com/atlascouncil/app/ConnectionPolicy.java','app/src/main/assets/workspace-shell.js','app/src/main/assets/workspace-theme.css'])assert.equal(existsSync(source(path)),false,path);
 assert.doesNotMatch(main+manifest+menu,/PcWorkspace|openWorkspace|AthalAI|com\.athalai|athalai-mobile\.sshrrgoktas|DESKTOP_KEY/);
});
test('Council menu is valid JavaScript and preserves theme and backup controls',()=>{
 new vm.Script(menu);
 for(const id of ['exportCurrent','exportCurrentJson','drawerBackup','importChats'])assert.ok(menu.includes(id));
 assert.match(menu,/atha-council-theme/);
 assert.match(menu,/actions\.hidden=true/);
 assert.doesNotMatch(menu,/atha-pc-workspace|AthalAI Çalışmaları|openWork\(/);
});
test('Native theme preferences are isolated from AthalAI',()=>{
 assert.match(main,/@JavascriptInterface fun theme\(\):String/);
 assert.match(main,/@JavascriptInterface fun setTheme\(value:String\)/);
 assert.match(main,/atha-council-appearance/);
 assert.doesNotMatch(main,/athalai-appearance/);
});