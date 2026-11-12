# Webhook acceptance and persisted Atha replies

Prepared 2026-11-12 on `fix/event-reply-ack`, based on main `22c986a` (PR #45).

## Evidence and limits

Read-only production diagnosis confirmed event `evt_dlg_KAaQwUPXS_Ycoq4RCN5BPScnkd4YySGq` has a completed Gemini payload, one webhook attempt, delivery state `delivered`, and zero matching `mcp_<event_id>` replies. It belongs to a different synced room from Selam. The original delivery code treats any 2xx as terminal and retries only pending transport failures.

OAuth, the account subscription and dialogue participation are enabled. The shared Work automation is enabled and instructs the actual ChatGPT client to read the incoming room and save its own response. Its accessible metadata exposes a last-run timestamp but no event-correlated run ID, processing trace, generated output, tool error or finish reason. Therefore the specific Work failure is **unknown**: transport acceptance does not establish execution, inference or a successful `council_reply`. No model response was invented or inserted during this investigation. The existing hourly fallback is a separate path, scoped to Selam; it is not evidence that another room's webhook ran. Neither automation was changed.

## Prepared behavior

| Delivery state | Meaning |
| --- | --- |
| pending | Eligible transport attempt, no persisted reply |
| accepted | Receiver returned 2xx; waiting for the real reply |
| replied | Immutable `mcp_<event_id>` reply exists |
| unanswered | Six send attempts exhausted without a saved reply |
| failed | Terminal transport error or exhausted transient failure |
| cancelled | Pause, revoked/expired authorization or superseded Gemini epoch |
| delivered | Legacy transport-only result; deliberately not replayed |

`mcp-receipts.sql` adds only owner/room/event-scoped timestamps and HTTP status. `council_reply` commits the reply and completion acknowledgment in one D1 batch transaction. Uniqueness remains the existing `(owner_id,room_id,reply_id)` primary key. Equal retries return the same reply; conflicting text is rejected. Authorization, account permission and participation epoch are checked again inside the insert. A callback finishing after a reply or pause cannot overwrite that terminal state.

The existing minute cron processes pending/accepted deliveries. Accepted deliveries wait 5, 10, 20, 40, 60, 60 minutes after successive sends; maximum six sends including transport failures. The last grace period ends in `unanswered`, without pausing participation or deactivating OAuth/Gemini. Network failures use the existing 30-second exponential backoff (cron granularity applies). 410/413 remain terminal. Attempts are reserved durably before sending, and the lease claim checks current due time and attempt count, so stale concurrent workers cannot re-send an already accepted row. Existing callback origin restrictions, signatures, timeout and canonical event identity are preserved.

`council_read` accepts optional `event_id` to retrieve the exact event and its reply beyond the twenty-event window, with delivery metadata. `council_connection_status.responseProgress` separates acceptance from saved completion. These diagnostics do not claim Work started; only a successful reply proves saved completion.

**Receiver limitation:** the same event/body/webhook ID is reused. The receiver may deduplicate a repeated accepted event without starting another Work run. Local tests cannot prove host-side re-execution. This patch adds safe bounded recovery and honest failure visibility; it does not establish uninterrupted real Work dialogue. Do not change event IDs to bypass receiver deduplication or fabricate a ChatGPT response with another provider.

## Validation

`node --test test/*.test.mjs copilot-bridge/*.test.mjs`: **100 passed**, including 15 new receipt/race/recovery cases. Real in-memory SQLite, fake webhook receiver and simulated provider responses; no live inference or room writes. `node --check worker/production.js` and `git diff --check` pass.

Covered: acceptance without a reply; delayed retry and stable signed payload; durable acknowledgment; duplicate/conflicting concurrent replies; reply/pause during callback; retry budget exhaustion; exact old-event lookup; grant expiry/revocation/account access removal; old delivered rows never replayed; reply before callback; superseded user epoch; transactional rollback; stale delivery workers; interrupted receipt persistence; authorization changes immediately before reply insertion. Existing OAuth, room isolation, server-driven Gemini dialogue, quote/farewell, history and native update tests still pass.

## Proposed live steps — explicit approval required

1. Apply only `worker/atha-sync/mcp-receipts.sql` to the existing Council D1 database before deploying the new Worker. It is repeatable and does not rewrite historical rows. Preserve all bindings, secrets, OAuth grants/cookies, callback origin allowlist and minute cron.
2. Merge/release the reviewed Worker patch through the normal deployment path. Do not rebuild/release the APK. Record the exact current Worker version first for rollback; leave the additive table in place on rollback rather than restoring the database over new messages.
3. Refresh discovered tool schemas if required. Append the text below to the existing shared Work automation prompt (preserve all existing consent/stop/identity rules). Do not create a duplicate subscription or new timer.
4. Use one new, explicitly approved test turn in an already-synced dialogue room. Observe the same event across: callback acceptance, real Work run if host evidence is available, and `council_reply` persistence. Confirm a subsequent genuine Gemini turn happens while the app is closed. Test one missing-reply retry and confirm one Atha message per event. Verify an explicit user stop blocks late writes and further generation. If the receiver deduplicates the retry without a run, keep this as an unresolved host-side limitation; obtain event-correlated host diagnostics rather than claiming success.

Proposed Work prompt addition (not applied):

> Gelen her olayda council_read çağrısına olayın gerçek room_id ve event_id değerlerini birlikte ver. Tam olay bulunmazsa kimlik uydurma veya eski bir olaya yanıt yazma. mcp_<event_id> yanıtı zaten varsa yeniden üretme. Kontrollü Gemini olayı eski bir kullanıcı turuna aitse veya katılım durdurulmuşsa yanıt yazma. Kendi gerçek ChatGPT yanıtını aynı room_id ve event_id ile council_reply üzerinden kaydet. Kaydetme çağrısının sonucu belirsizse council_read ile aynı event_id kaydını tekrar kontrol et; kayıt varsa tamamlanmış say, yoksa yalnızca aynı kimlikle aynı içeriği kontrollü biçimde tekrar kaydet. Kalıcı aboneliği kapatma. Başarılı webhook teslimatını yanıtın kaydedildiği şeklinde yorumlama.

The historical reported event and the other legacy delivered events are not scheduled for replay by this proposal. No live migration, deployment, event replay, automation update, account change or APK operation was performed.

D1 transaction semantics: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
