import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../app/src/main/java/com/atlascouncil/app/MainActivity.kt',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const gradle=readFileSync(new URL('../app/build.gradle.kts',import.meta.url),'utf8');

test('two AthalAI APKs retain separate identities and existing Council signing',()=>{
 assert.match(manifest,/android:label="Atha Council"/);
 assert.match(gradle,/applicationId = "com\.atlascouncil\.app"/);
 assert.match(gradle,/ATLAS_SIGNING_FILE/);
 assert.match(manifest,/<package android:name="com\.athalai\.companion"\/>/);
 assert.doesNotMatch(manifest,/uses-permission android:name="android\.permission\.CAMERA"/);
});
test('Council permanently exposes a native exit to the real QR/camera mobile app',()=>{
 assert.match(main,/private fun openMainAthalAI\(\)/);
 assert.match(main,/setClassName\("com\.athalai\.companion","com\.athalai\.companion\.MainActivity"\)/);
 assert.match(main,/Intent\.CATEGORY_LAUNCHER/);
 assert.match(main,/setOnClickListener\{openMainAthalAI\(\)\}/);
 assert.match(main,/← AthalAI Mobile \/ QR/);
 assert.match(main,/layout\.addView\(topBar,LinearLayout\.LayoutParams\(-1,barHeight\)\)/);
 assert.match(main,/layout\.addView\(councilWeb,LinearLayout\.LayoutParams\(-1,0,1f\)\)/);
 assert.match(main,/102 -> \{openMainAthalAI\(\);return true\}/);
});
test('QR app absent cannot falsely claim scanner exists inside Council',()=>{
 assert.match(main,/ActivityNotFoundException/);
 assert.match(main,/AthalAI Mobile \(QR ve PC eşleştirme\) bu telefonda yüklü görünmüyor/);
 assert.match(main,/SecurityException/);
 assert.match(main,/Konsey ile ana uygulama iki ayrı uygulamadır/);
});
test('Council OAuth and persisted web cookies remain untouched by navigation',()=>{
 assert.match(main,/completeGitHubLogin\(ticket\)/);
 assert.match(main,/completeGoogleLogin\(ticket\)/);
 assert.match(main,/CookieManager\.getInstance\(\)\.flush\(\)/);
 assert.match(main,/getPreferences\(MODE_PRIVATE\)/);
 assert.match(main,/checkForUpdates\(false\)/);
 assert.match(manifest,/atlascouncil/);
});
