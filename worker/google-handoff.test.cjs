'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const origin = 'https://atlas-council.sshrrgoktas.workers.dev';
const env = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-only-google-secret-not-a-real-provider-secret' };
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
let worker;
async function route(url, options) {
  if (!worker) {
    const source = await readFile(path.join(__dirname, 'production.js'), 'utf8');
    worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  }
  return worker.fetch(new Request(origin + url, options), env, {});
}
async function begin(client) {
  const response = await route('/auth/google/start?mobile=1&challenge=' + challenge + (client ? '&client=' + client : ''));
  assert.equal(response.status, 302);
  const provider = new URL(response.headers.get('location'));
  assert.equal(provider.origin, 'https://accounts.google.com');
  assert.equal(provider.searchParams.get('redirect_uri'), origin + '/auth/google/callback');
  return provider.searchParams.get('state');
}
async function finish(state) {
  return route('/auth/google/callback?code=test-code&state=' + encodeURIComponent(state),
    { headers: { cookie: 'atlas_oauth_state=' + state } });
}

test('legacy and unified Google handoffs preserve provider callback and bind the issued grant', async t => {
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token'); exchanges++;
    return Response.json({ access_token: 'test-only-access', refresh_token: 'test-only-refresh', expires_in: 3600 });
  });
  for (const client of [null, 'athalai']) {
    const state = await begin(client);
    assert.equal(state.split('.').length, client ? 4 : 3);
    const returned = await finish(state);
    assert.equal(returned.status, 302);
    const callback = new URL(returned.headers.get('location'));
    assert.equal(callback.protocol, client ? 'athalai:' : 'atlascouncil:');
    assert.equal(callback.hostname, client ? 'council-auth' : 'google-auth');
    assert.equal(callback.pathname, client ? '/google' : '');
    const ticket = callback.searchParams.get('ticket');
    const exchanged = await route('/auth/google/mobile-exchange', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, verifier, ...(client ? { client } : {}) }) });
    assert.equal(exchanged.status, 200);
    const data = await exchanged.json();
    assert.match(data.cookie, /^atlas_google=[A-Za-z0-9_-]+; Path=\/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax$/);
    const wrongClient = await route('/auth/google/mobile-exchange', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, verifier, ...(client ? {} : { client: 'athalai' }) }) });
    assert.equal(wrongClient.status, 403);
    const wrongVerifier = await route('/auth/google/mobile-exchange', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, verifier: verifier + 'wrong', ...(client ? { client } : {}) }) });
    assert.equal(wrongVerifier.status, 403);
  }
  assert.equal(exchanges, 2);
});

test('bad client markers and malformed mobile state are rejected before provider exchange', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('No provider request is allowed for invalid state'); });
  for (const query of [
    '?mobile=1&challenge=' + challenge + '&client=other',
    '?mobile=1&challenge=' + challenge + '&client=athalai&client=other',
    '?client=athalai',
  ]) assert.equal((await route('/auth/google/start' + query)).status, 400);
  const nonce = crypto.randomUUID();
  for (const state of [
    'm.' + challenge + '.' + nonce + '.other',
    'm.' + challenge + '.' + nonce + '.athalai.extra',
    'm.bad.' + nonce + '.athalai',
    'm.' + challenge + '.not-a-nonce.athalai',
  ]) assert.equal((await finish(state)).status, 400);
});

test('ordinary browser Google login still returns to the existing Council page', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    return Response.json({ access_token: 'test-only-browser-access', expires_in: 3600 });
  });
  const response = await route('/auth/google/start');
  const state = new URL(response.headers.get('location')).searchParams.get('state');
  assert.equal(state.startsWith('m.'), false);
  const returned = await finish(state);
  assert.equal(returned.status, 302);
  assert.equal(returned.headers.get('location'), '/council-v2?google=connected');
  assert.match(returned.headers.get('set-cookie'), /atlas_google=/);
});
