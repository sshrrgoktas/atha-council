import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../app/src/main/java/com/atlascouncil/app/MainActivity.kt',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const gradle=readFileSync(new URL('../app/build.gradle.kts',import.meta.url),'utf8');

test('Council retains its own Android identity and no AthalAI package visibility',()=>{
 assert.match(manifest,/android:label="Atha Council"/);
 assert.match(gradle,/applicationId = "com\.atlascouncil\.app"/);
 assert.match(gradle,/applicationIdSuffix = "\.standalone"/);
 assert.match(gradle,/ATLAS_SIGNING_FILE/);
 assert.doesNotMatch(manifest,/com\.athalai\.companion|\.PcWorkspaceActivity|android\.permission\.CAMERA/);
});
test('Council has no native cross-app navigation, tunnel or QR entry points',()=>{
 assert.doesNotMatch(main,/openMainAthalAI|com\.athalai\.companion|PcWorkspaceActivity|AthalAI Mobile|openWorkspaceView|openWorkspace\(/);
 assert.doesNotMatch(main,/setClassName\(|android\.permission\.CAMERA/);
 assert.match(main,/layout\.addView\(councilWeb,LinearLayout\.LayoutParams\(-1,-1\)\)/);
 assert.match(main,/text="Atha Council"/);
 assert.doesNotMatch(main,/text="AthalAI"/);
});
test('Council retains its own Google and GitHub authentication and updates',()=>{
 assert.match(main,/completeGitHubLogin\(ticket\)/);
 assert.match(main,/completeGoogleLogin\(ticket\)/);
 assert.match(main,/CookieManager\.getInstance\(\)\.flush\(\)/);
 assert.match(main,/checkForUpdates\(false\)/);
 assert.match(manifest,/atlascouncil/);
});