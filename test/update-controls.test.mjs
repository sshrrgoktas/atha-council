import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const worker=readFileSync(new URL("../worker/production.js",import.meta.url),"utf8");
const kotlin=readFileSync(new URL("../app/src/main/java/com/atlascouncil/app/MainActivity.kt",import.meta.url),"utf8");
const htmlLiteral=worker.slice(worker.indexOf("const HTML=")+11,worker.lastIndexOf(";"));
const html=JSON.parse(htmlLiteral);
test("Production Worker and web UI compile",()=>{
  new Function(worker.replace("export default {","const runtime = {"));
  new Function(html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>")));
});
test("Left menu is the only update entry, with visible result feedback",()=>{
  assert.match(html,/data-drawer-tab="help">⚙ Bağlantılar ve güncellemeler/);
  assert.match(html,/<h2>Bağlantılar ve güncellemeler<\/h2>/);
  assert.match(html,/id="appUpdateResult"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/window\.atlasUpdateResult/);
  assert.match(html,/bridge\.openUpdates/);
  assert.match(html,/Son yayınlanan APK:/);
  assert.match(html,/show\('agents'\)/);
});
test("Browser explains difference from APK and old app never claims verified version",()=>{
  assert.match(html,/Chrome’da açık/);
  assert.match(html,/Bu yüklü APK, kendi sürümünü arayüze bildirmiyor/);
  assert.match(html,/github\.com\/sshrrgoktas\/atlas-council\/releases\/download\/latest-debug\/atlas-council-debug\.apk/);
});
test("New native update bridge reports actual installed version and all result states",()=>{
  assert.match(kotlin,/@JavascriptInterface fun installedVersion\(\):Long = currentVersion\(\)/);
  assert.match(kotlin,/sendUpdateResult\("checking"/);
  assert.match(kotlin,/sendUpdateResult\("available"/);
  assert.match(kotlin,/sendUpdateResult\("current"/);
  assert.match(kotlin,/sendUpdateResult\("error"/);
  assert.match(kotlin,/@JavascriptInterface fun openUpdates\(\)/);
  assert.doesNotMatch(kotlin,/val toolbar=/);
  assert.match(kotlin,/layout\.addView\(councilWeb,LinearLayout\.LayoutParams\(-1,-1\)\)/);
});

test("Legacy Android APK offers a real signed release link rather than a dead hidden menu",()=>{
  assert.match(html,/id="legacyUpdateRow" hidden/);
  assert.match(html,/id="legacyUpdateLink"/);
  assert.match(html,/href="https:\/\/github\.com\/sshrrgoktas\/atlas-council\/releases\/download\/latest-debug\/atlas-council-debug\.apk"/);
  assert.match(html,/window\.AtlasNative&&typeof window\.AtlasNative\.openUpdates!=='function'/);
  assert.match(html,/document\.getElementById\('legacyUpdateRow'\)\.hidden=false/);
  assert.doesNotMatch(html,/if\(confirm\('İmzalı Atlas Council APK güncellemesini Android yükleyicisinde açmak ister misin\?'\)\)/);
});

test("Backups restore both conversations and profile before any APK migration",()=>{
  assert.match(html,/Tüm sohbetleri yedekle/);
  assert.match(html,/JSON\.stringify\(\{version:1,profile,chats\}/);
  assert.match(html,/const incomingProfile=/);
  assert.match(html,/localStorage\.setItem\(profileKey,JSON\.stringify\(profile\)\)/);
  assert.match(html,/Mevcut sohbetler silinmeyecek; varsa profil bilgisi yenilenecek/);
  assert.match(html,/Profil bilgileri geri yüklendi/);
});
