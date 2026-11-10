import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const worker=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const kotlin=readFileSync(new URL("../app/src/main/java/com/atlascouncil/app/MainActivity.kt",import.meta.url),"utf8");
const htmlLiteral=worker.slice(worker.indexOf("const HTML=")+11,worker.lastIndexOf(";"));
const html=JSON.parse(htmlLiteral);
test("Production worker and web UI compile",()=>{
  new Function(worker.replace("export default {","const runtime = {"));
  new Function(html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>")));
});
test("Existing left drawer opens Bağlantılar ve güncellemeler, including update actions",()=>{
  assert.match(html,/data-drawer-tab="help">⚙ Bağlantılar ve güncellemeler/);
  assert.match(html,/<h2>Bağlantılar ve güncellemeler<\/h2>/);
  assert.match(html,/id="manageConnections"/);
  assert.match(html,/id="appUpdate"/);
  assert.match(html,/bridge\.openUpdates/);
  assert.match(html,/show\('agents'\)/);
});
test("Old installed APK gets consent-based signed update fallback and browser is not misled",()=>{
  assert.match(html,/Bu eski APK sürümünde güncelleme menüsü görünmüyor/);
  assert.match(html,/Chrome tarayıcısında açık/);
  assert.match(html,/github\.com\/sshrrgoktas\/atlas-council\/releases\/download\/latest-debug\/atlas-council-debug\.apk/);
});
test("Native APK remains full-screen without new toolbar",()=>{
  assert.match(kotlin,/@JavascriptInterface fun openUpdates\(\)/);
  assert.match(kotlin,/runOnUiThread\{checkForUpdates\(true\)\}/);
  assert.doesNotMatch(kotlin,/val toolbar=/);
  assert.doesNotMatch(kotlin,/layout\.addView\(toolbar,/);
  assert.match(kotlin,/layout\.addView\(councilWeb,LinearLayout\.LayoutParams\(-1,-1\)\)/);
});
