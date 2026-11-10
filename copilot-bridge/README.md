# Atlas Council — GitHub Copilot Free bridge (draft, not deployed)

This is an isolated integration draft for the existing Cloudflare Worker and Android WebView. No model reply is simulated. The main GitHub branch and the live Worker stay unchanged.

## Findings (10 November 2026)
- GitHub explicitly supports Copilot Free through the Copilot SDK, subject to quota.
- GitHub OAuth user tokens can be passed to the SDK; OAuth does not itself provide inference.
- The Node SDK bundles a runtime and requires supported Node.js.
- Standard Cloudflare Workers do not run a Copilot CLI subprocess.
- Cloudflare Containers require Workers Paid; excluded.
- A separate Node host on an existing Windows/Linux machine is needed. A fully free, reliable, always-on phone-only host has NOT been confirmed.

## Components
- copilot-bridge/server.mjs: real SDK invocation with no default tools.
- copilot-bridge/protocol.mjs: HMAC request verification and server-assigned speaker ID.
- copilot-bridge/protocol.test.mjs: offline tests, no auth or model calls.
- worker/copilot-routes.mjs: optional Worker GitHub OAuth routes, NOT imported into live Worker.

## Next setup steps
1. Create a GitHub OAuth App at GitHub Settings > Developer settings > OAuth Apps. Homepage: https://atlas-council.sshrrgoktas.workers.dev ; callback: https://atlas-council.sshrrgoktas.workers.dev/auth/github/callback . OAuth requests only read:user scope, never repo or write scopes.
2. Configure Worker secrets GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, GITHUB_SESSION_SECRET (32+ random characters), COPILOT_BRIDGE_URL (an HTTPS URL), COPILOT_BRIDGE_SECRET (32+ random characters). Don't put credentials in public source or browser JavaScript.
3. On a supported Node host, run npm install inside copilot-bridge, set COPILOT_BRIDGE_SECRET to the same long random value and then npm start. It listens only on 127.0.0.1 by default.
4. Expose the local bridge only through an authenticated HTTPS tunnel for the Worker. Do not open its Node port to the public internet.
5. Review and version the actual current Cloudflare Worker source. Import handleCopilotRoute early in the fetch handler; test in a separate Worker preview before merging or deploying.
6. Add an explicit Copilot UI participant only after a real OAuth and model round-trip. Until then display disconnected. Browser session is the first Android test route; Android WebView uses different cookies and requires its own verified callback/ticket flow before the APK can claim connection.
7. Check account Copilot quota through GitHub or the SDK. Do not enable overages or paid upgrades.

## Safety guarantees
- GitHub OAuth asks only read:user; no repository mutation authorization.
- SDK mode empty and availableTools empty; all tool permissions denied, temporary working directory.
- Bridge uses HMAC, short timestamp window and nonce replay defense.
- Worker issues server-controlled speakerId=copilot; model text cannot override identity.
- Tokens never appear in success responses or browser JavaScript.

## Still unverified
OAuth App configuration, actual sign-in and quota, runtime installation and start, actual Copilot model reply, bridge HTTPS access, Worker import, Android/browser end-to-end operation. This PR does NOT mark Copilot as connected.

Official docs: https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/ and https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth .
