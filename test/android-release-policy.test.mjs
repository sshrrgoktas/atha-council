import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/android.yml",import.meta.url),"utf8");
const app=readFileSync(new URL("../app/src/main/java/com/atlascouncil/app/MainActivity.kt",import.meta.url),"utf8");
const gradle=readFileSync(new URL("../app/build.gradle.kts",import.meta.url),"utf8");
test("Web edits NEVER trigger signed APK publication",()=>{
 const config=workflow.slice(workflow.indexOf("\non:\n"),workflow.indexOf("\nconcurrency:"));
 const push=config.slice(config.indexOf("  push:"),config.indexOf("  pull_request:"));
 const pull=config.slice(config.indexOf("  pull_request:"),config.indexOf("  workflow_dispatch:"));
 for(const section of [push,pull]){
  assert.match(section,/paths:/);
  assert.match(section,/- 'app\/\*\*'/);
  assert.match(section,/- '\.github\/workflows\/android\.yml'/);
  assert.match(section,/- 'settings\.gradle\.kts'/);
  assert.doesNotMatch(section,/worker\/\*\*|copilot-bridge\/\*\*|test\/\*\*|README\.md|'\*\*'/);
 }
 assert.match(workflow,/on:\n  push:\n    branches: \[main\]\n    paths:/);
 assert.match(workflow,/if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
});
test("APK version only increments on a qualifying Android build; preserves signing",()=>{
 assert.match(gradle,/versionCode = \(System\.getenv\("GITHUB_RUN_NUMBER"\)\?\.toIntOrNull\(\) \?: 1\)/);
 assert.match(workflow,/gradle :app:assembleRelease/);
 assert.match(workflow,/gh release upload latest-debug atha-council\.apk/);
});
test("Startup remains silent; manual update check is required for install prompt",()=>{
 assert.match(app,/checkForUpdates\(false\)/);
 assert.match(app,/if\(version>currentVersion\(\)\)\{/);
 const start=app.indexOf('if(version>currentVersion()){',app.indexOf('private fun checkForUpdates'));
 const finish=app.indexOf('}else if(showCurrent){',start);
 const branch=app.slice(start,finish);
 assert.match(branch,/if\(showCurrent\)\{/);
 assert.match(branch,/\.setPositiveButton\("Bir kez indir"\)/);
 assert.doesNotMatch(branch,/downloadUpdate\(downloadUrl\)\}/);
});
test("Same APK version is not repeatedly downloaded",()=>{
 assert.match(app,/downloadInProgress/);
 assert.match(app,/last_atha_download_version/);
 assert.match(app,/last_atha_download_id/);
 assert.match(app,/DownloadManager\.STATUS_SUCCESSFUL/);
 assert.match(app,/openDownloadedUpdate\(manager,previousId\)/);
 assert.match(app,/STATUS_RUNNING/);
 assert.match(app,/STATUS_PENDING/);
 assert.match(app,/STATUS_PAUSED/);
 assert.match(app,/"atha-council-update-"\+version\+"\.apk"/);
});
