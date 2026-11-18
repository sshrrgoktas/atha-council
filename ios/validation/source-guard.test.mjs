import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const app=read('ios/AthaCouncil/AthaCouncilApp.swift');
const safari=read('ios/AthaCouncil/CouncilSafari.swift');
const endpoint=read('ios/AthaCouncil/CouncilEndpoint.swift');
const project=read('ios/project.yml');
const plist=read('ios/AthaCouncil/Info.plist');
const flow=read('codemagic.yaml');
test('distinct iPhone bundle and no QR or PC permissions',()=>{
  assert.match(project,/com\.atlascouncil\.ios/);
  assert.doesNotMatch(project,/com\.athalai\.mobile/);
  assert.match(plist,/Atha Council/);
  assert.doesNotMatch(plist,/NSCameraUsageDescription|NSLocalNetworkUsageDescription/);
});
test('Safari OAuth is dismissible without taking over the PC session',()=>{
  assert.match(safari,/SFSafariViewController\(url: CouncilEndpoint\.conversation\)/);
  assert.match(safari,/dismissButtonStyle = \.done/);
  assert.doesNotMatch(app+safari,/WKWebView|AVCaptureSession|QRScanner|terminal:|CONTROL_PLANE_API_KEY/);
});
test('only official Council HTTPS routes and read-only status',()=>{
  assert.match(endpoint,/c\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(endpoint,/c\.host\?\.lowercased\(\) == host/);
  assert.match(app,/URLSession\.shared\.data\(for: request\)/);
  assert.doesNotMatch(endpoint,/opencode|OpenCode|atha-tasks/);
});
test('Codemagic never starts automatically or deploys Android/cloud workers',()=>{
  assert.match(flow,/atha-council-ios-simulator:/);
  assert.match(flow,/atha-council-ios-signed:/);
  assert.match(flow,/CODE_SIGNING_ALLOWED=NO/);
  assert.doesNotMatch(flow,/triggering:|publishing:|wrangler|gradlew|submit_to_app_store/);
});
test('Council signing requires user managed separate credentials',()=>{
  assert.match(flow,/atha_council_apple_signing/);
  assert.match(flow,/APP_STORE_CONNECT_PRIVATE_KEY/);
  assert.match(flow,/CERTIFICATE_PRIVATE_KEY/);
  assert.match(flow,/com\.atlascouncil\.ios/);
});
