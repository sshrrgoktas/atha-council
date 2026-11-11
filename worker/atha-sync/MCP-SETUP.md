# Atha Council MCP Events — deployment and account handoff

Status: installed ChatGPT plugin; Selam room OAuth and real MCP read/status calls verified. Event subscription still fails in the ChatGPT task service; automatic participation is not active. No paid inference API.

## Endpoint and OAuth
- Server: https://atlas-council.sshrrgoktas.workers.dev/mcp
- ChatGPT Plugins: https://chatgpt.com/plugins → plus → Add custom MCP server
- Name: Atha Council. Authentication: OAuth, dynamic client registration.
- Protected resource: /.well-known/oauth-protected-resource/mcp
- Authorization metadata: /.well-known/oauth-authorization-server
- OAuth 2.1 S256 authorization code flow, one synced room per grant, access token 1 hour, rotating refresh token and grant at most 30 days.
- The authorization page uses the existing GitHub login and lists only that owner's synced rooms. It does not grant access to any Google or GitHub token.
- Supported ChatGPT redirect URLs: stable /connector_platform_oauth_redirect and /connector/oauth/{callback_id} on chatgpt.com only. No local/third-party redirects.

## Delivery gate
Apply mcp.sql to ATHA_SYNC_DB **before** deploying production.js. Existing schemas remain unchanged. Keep all original Worker bindings, secrets, compatibility settings and minute cron. Outbound event delivery is disabled unless ATHA_MCP_CALLBACK_ORIGINS is set.

During ChatGPT subscription setup, obtain the actual callback origin from the host. Verify that exact origin is operated by OpenAI before adding it to ATHA_MCP_CALLBACK_ORIGINS (a comma-separated list of exact HTTPS origins). Never allow wildcard domains or a URL provided in room text. Callback requests fail closed when an origin is not approved; no conversation is sent to it.

Cloudflare Workers fetch does not provide connection-time DNS address pinning. This implementation therefore rejects arbitrary callback hosts rather than claiming a resolve-then-fetch check solves DNS rebinding. For arbitrary destinations, a separate trusted egress transport which validates and pins public destination addresses at connection time is still needed. That transport has NOT been deployed. A verified, exact OpenAI callback origin is the restricted deployment path; do not claim general SSRF-safe callback support.

ChatGPT must actually call events/subscribe. Do not manufacture a callback URL, signing secret or subscription. Verification challenges are fresh and signed with Standard Webhooks HMAC-SHA256. Signing secrets are encrypted at rest using a purpose-separated key derived from the existing session secret. Subscription refresh supports finite ttlMs and a bounded dual-signature key rotation window.

## Tools and participation
- council_read: authorized room, contextual messages, reply inbox and event IDs.
- council_reply: only client-generated text for an event assigned to an active subscription. One immutable reply per event. Identity is declared by the authenticated ChatGPT OAuth client; this is not independent model-inference attestation.
- council_participation: mentions (default), all_user, paused.
- council_connection_status: separate OAuth, subscription, callback, participation and reply status.

Only new user messages create calls. In mentions mode they must explicitly mention Atha or ChatGPT. The first snapshot never replays history. AI replies cannot trigger a new call. Each user sync atomically commits its event and eligible delivery. Immediate delivery uses waitUntil; the existing minute cron retries transient failures. Retry attempts are bounded; 410 disables the subscription, 413 is terminal. Cancellation, expiry, room deletion, owner revocation and pause suppress pending deliveries and block late reply writes. An already in-flight HTTPS request cannot be recalled.

The synced-room invitation UI shows connection state instead of copying conversation text. Unsynced rooms retain the existing manual import fallback. Visible clients poll the authenticated reply inbox every 5 seconds. Local history, Gemini, Copilot and native updater remain intact. Atha is recognized as a direct addressee.

Controlled Gemini↔Atha dialogue uses a server handoff after each authenticated Atha reply. Apply `dialogue.sql` before deploying. An authenticated synced chat in dialogue mode retains its existing provider cookies encrypted with purpose-separated encryption, scoped to the owner and room, only until that 20-minute turn expires. The server calls the existing Google route, verifies genuine provider identity, saves Gemini output as a controlled event, and delivers it to the existing ChatGPT subscription. The browser only displays these turns; hiding or switching the chat does not stop the server handoff. Pause, subscription revocation, expiry, duplicate claims, repeated output and the existing three-turn bound stop generation. Provider failures retry up to four times through the existing minute scheduler. Syncing old history alone does not start a conversation; a new live Send does.

## Validation and required account test
54 local tests passed, including real SQLite foreign keys, OAuth/PKCE and CSRF, real HMAC calculation on exact bytes, callback forgery, owner isolation, deduplication, retry, cancellation, expiry, immediate user sync and no AI feedback loop. They use a simulated receiver and test-client reply text. They are not evidence of a real ChatGPT event run.

Still required in the user's signed-in ChatGPT Work web/desktop Cloud session:
1. Add the endpoint as a plugin and authorize the already-synced Selam room.
2. Confirm tools and message.created are discovered.
3. Ask ChatGPT to subscribe to Selam and generate its own response through council_reply.
4. Approve the actual OpenAI callback origin server-side, then retry subscription verification.
5. Send two real Council user calls, verify actual host receipt, generated responses, correct room identity, no repeated consent, no loops.
6. Unsubscribe in ChatGPT and verify further calls stop.

The account was signed in and plugin_asdk_app_6af4c744367c8191840a2de1416bfe9a was installed. GitHub device verification and room-scoped OAuth completed. ChatGPT discovered all four tools and message.created, then made real council_read/status calls in Work chat 6af4ca95-1ddc-83ed-b347-1983d9b3370f. Two native subscription attempts returned “The task service returned an unexpected error” without a callback origin. No active subscription exists. Keep automatic participation inactive until a genuine host subscription is verified.

Apply mcp-diagnostics.sql before the diagnostic Worker update. The bounded owner/room row records only subscription attempt count, reason, timestamp and callback origin. It never stores the callback path/query, tokens, signing secrets or conversation text. council_connection_status exposes this safe diagnostic, distinguishing a request which reaches events/subscribe from failure before that point.

## Rollback
Previous production version: 88fd1ffa-6414-4a13-aee8-f379c1953062 (v90).
Re-deploy that version at 100% if needed. Additive MCP tables can remain empty; do not roll the whole D1 database back over newer user messages. Before the additive migration, D1 bookmark was 00000016-0000004a-00005120-1488bf232ffa73e38db79d7e945149e3.
Baseline: one synced room, four reply-inbox rows, zero events. Selam snapshot length 6336, updated_at 1794415256884.
