import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const mainGradle=read('app/build.gradle.kts');
const labGradle=read('labapp/build.gradle.kts');
const labManifest=read('labapp/src/main/AndroidManifest.xml');
const labActivity=read('labapp/src/main/java/com/atlascouncil/taskbridgelab/LabActivity.kt');
const settings=read('settings.gradle.kts');
test('original Council app identity is preserved',()=>{
 assert.match(mainGradle,/applicationId = "com\.atlascouncil\.app"/);
 assert.match(mainGradle,/applicationIdSuffix = "\.standalone"/);
});
test('TEST APK uses distinct permanent package, isolated module and label',()=>{
 assert.match(labGradle,/applicationId = "com\.atlascouncil\.taskbridgelab"/);
 assert.doesNotMatch(labGradle,/applicationIdSuffix/);
 assert.match(settings,/include\(":app", ":labapp"\)/);
 assert.match(labManifest,/android:label="Atha Council TEST"/);
});
test('TEST app has only isolated gateway networking and no production OAuth',()=>{
 assert.match(labManifest,/android.permission.INTERNET/);
 assert.doesNotMatch(labManifest,/REQUEST_INSTALL_PACKAGES|android:scheme/);
 assert.match(labActivity,/blockNetworkLoads/);
 assert.match(labActivity,/loadDataWithBaseURL/);
 assert.match(labActivity,/atha-council-taskbridge-lab/);
 assert.doesNotMatch(labActivity,/atlas-council|athalai-mobile|api.openai.com/);
});
