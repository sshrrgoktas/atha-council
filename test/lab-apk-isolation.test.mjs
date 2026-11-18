import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gradle=read('app/build.gradle.kts');
const manifest=read('app/src/main/AndroidManifest.xml');
const kotlin=read('app/src/main/java/com/atlascouncil/app/MainActivity.kt');
const flow=read('.github/workflows/council-lab-apk.yml');
test('LAB package is different and cannot replace production Council APK',()=>{
 assert.match(gradle,/applicationId = "com\.atlascouncil\.app\.lab"/);
 assert.match(gradle,/namespace = "com\.atlascouncil\.app"/);
 assert.match(manifest,/android:label="Atha Council LAB"/);
 assert.match(gradle,/0\.3-council-LAB/);
 assert.doesNotMatch(gradle,/ATLAS_SIGNING_FILE|atlasRelease/);
});
test('LAB OAuth deep links do not hijack production links',()=>{
 assert.match(manifest,/android:scheme="athacouncil-lab"/);
 assert.doesNotMatch(manifest,/android:scheme="atlascouncil"/);
 assert.match(kotlin,/if\(packageName\.endsWith\("\.lab"\)\)/);
 assert.match(kotlin,/LAB test sürümünde canlı GitHub OAuth kapalı/);
 assert.match(kotlin,/LAB test sürümünde canlı Google OAuth kapalı/);
 assert.match(kotlin,/LAB test sürümünde canlı ChatGPT girişi kapalı/);
});
test('LAB can only open matching LAB QR companion',()=>{
 assert.match(manifest,/com\.athalai\.companion\.lab/);
 assert.match(kotlin,/setClassName\("com\.athalai\.companion\.lab","com\.athalai\.companion\.MainActivity"\)/);
 assert.match(kotlin,/LAB paketi üretim APK güncellemelerinden bağımsızdır/);
});
test('CI only creates unique QA artifacts without modifying production release',()=>{
 assert.match(flow,/lab\/isolated-council-apk-20261118/);
 assert.match(flow,/atha-council-lab-/);
 assert.doesNotMatch(flow,/latest-debug|--clobber|gradle :app:assembleRelease|workers\/scripts|wrangler/);
});
