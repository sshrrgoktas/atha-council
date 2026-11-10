import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const worker=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const kotlin=readFileSync(new URL("../app/src/main/java/com/atlascouncil/app/MainActivity.kt",import.meta.url),"utf8");
const htmlLiteral=worker.slice(worker.indexOf("const HTML=")+11,worker.lastIndexOf(";"));
const html=JSON.parse(htmlLiteral);
test("Production worker and embedded page compile after adding APK update control",()=>{
  new Function(worker.replace("export default {","const runtime = {"));
  const js=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
  new Function(js);
  assert.match(html,/id="appUpdate"/);
});
test("Update control works in installed APK and degrades honestly for old APK and browser",()=>{
  assert.match(html,/AtlasNative\.openUpdates/);
  assert.match(html,/Bu eski APK sürümünde yerel güncelleme menüsü gizli kalmış/);
  assert.match(html,/tarayıcıdasın; web sürümü otomatik güncellenir/);
  assert.match(html,/github\.com\/sshrrgoktas\/atlas-council\/releases\/download\/latest-debug\/atlas-council-debug\.apk/);
});
test("Native APK shows visible buttons with NoActionBar theme",()=>{
  assert.match(kotlin,/text="↻ Güncelleme"/);
  assert.match(kotlin,/setOnClickListener\{checkForUpdates\(true\)\}/);
  assert.match(kotlin,/text="⚙ Bağlantılar"/);
  assert.match(kotlin,/@JavascriptInterface fun openUpdates\(\)/);
  assert.match(kotlin,/layout\.addView\(toolbar,/);
  assert.match(kotlin,/layout\.addView\(councilWeb,LinearLayout\.LayoutParams\(-1,0,1f\)\)/);
});
