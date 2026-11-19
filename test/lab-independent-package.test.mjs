import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const gradle=read('app/build.gradle.kts');
const manifest=read('app/src/main/AndroidManifest.xml');
const main=read('app/src/main/java/com/atlascouncil/app/MainActivity.kt');
test('TEST APK has unique stable identity distinct from existing main and standalone debug',()=>{
 assert.match(gradle,/applicationId = "com\.atlascouncil\.taskbridgelab"/);
 assert.doesNotMatch(gradle,/applicationIdSuffix/);
 assert.doesNotMatch(gradle,/applicationId = "com\.atlascouncil\.app"/);
 assert.match(manifest,/android:label="Atha Council TEST"/);
});
test('TEST APK has no live Council database/network/OAuth entry points',()=>{
 assert.doesNotMatch(manifest,/android\.permission\.INTERNET|REQUEST_INSTALL_PACKAGES|atlascouncil|google-auth|github-auth/);
 assert.match(main,/settings\.blockNetworkLoads=true/);
 assert.match(main,/loadDataWithBaseURL\(null,labPage/);
 assert.match(main,/packageName!="com\.atlascouncil\.taskbridgelab"/);
 assert.doesNotMatch(main,/addJavascriptInterface\(CouncilBridge\(\),"AtlasNative"\)/);
});
test('existing native chat UI is not overwritten in the repository',()=>{
 assert.match(main,/showTaskBridgeLab/);
 assert.match(main,/task-bridge-lab\.html/);
 assert.match(main,/task-bridge-engine\.js/);
});
