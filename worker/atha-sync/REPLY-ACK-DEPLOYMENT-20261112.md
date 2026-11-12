# PR46 deployment verification — 12 November 2026

User explicitly approved the prepared migration, merge, Worker deployment, existing Work prompt update and controlled live test.

- Merged PR: https://github.com/sshrrgoktas/atha-council/pull/46
- Source commit: 9d30e0850c7a207df1702eb9e64e33d5bce31b8c
- Worker version: eb219764-fc8c-4971-a8a8-1eba94627c84
- Deployment: 52984c3f-086c-4ddc-905a-830cb6d35877
- Traffic: 100%; published 2026-11-12 16:14:33 UTC / 19:14:33 Türkiye.
- Previous version retained for rollback: 808ea9ea-e540-47e0-bc08-de8f3923dda7.
- Deployed module exactly matches the reviewed patch.
- Additive mcp-receipts.sql applied; legacy delivered events not replayed.
- All existing binding names/types preserved; minute cron unchanged.
- Existing shared Work subscription prompt updated in place; no new subscription or timer.
- APK source and release left unchanged.

## Validation

100 isolated tests passed; all seven PR workflow runs succeeded. Five live public endpoint smoke tests passed after deployment.

A single new user-approved integration-test call was queued in an already-synced dialogue room. It was labelled as a technical test and did not rewrite the user's snapshot.

| Event | Observed result |
| --- | --- |
| evt_manual_live_a1d08fc95d704315b03ea25e2be87c61 | HTTP 200 accepted; actual mcp_ reply committed; exactly one reply |
| evt_dlg_VyD4y5nXxlV6M46SUq0pVe8UURG1MD1k | Genuine Gemini child event completed; HTTP 200 accepted; actual Atha reply committed; exactly one reply |
| evt_dlg_qrECBHh3Y0Quf_0cSUI34o00ZLT8Upt9 | Gemini initially unavailable; existing server retry recovered, completed and delivered the event; two HTTP 200 delivery attempts observed; no corresponding Atha reply at the final observation |

Council UI was not opened during this test. The provider handoff and subsequent event delivery ran server-side. The main chat did not manually generate or save either test reply.

Work automation readout still exposes no event-correlated run/result trace. Its last-run timestamp is not evidence of successful processing. The third event was actually redelivered at 2026-11-12 16:24:35 UTC. The second attempt also returned HTTP 200; at 16:25 UTC it still had zero matching replies. The new backend retry/acknowledgment logic works, but this live trace does NOT establish recovery of Work processing or uninterrupted dialogue. No manual main-chat reply was substituted to conceal that gap.

No live explicit-stop test was performed against the user's ongoing room during this deployment. Pause/late-write/duplicate/retry scenarios have isolated coverage. Preserve the distinction between isolated tests and live evidence.

## Outcome and remaining limit

Deployment, migration and prompt update completed. Backend acceptance/completion separation, bounded redelivery and duplicate prevention are in place. The first real Atha → Gemini → Atha chain completed without opening the Council UI, and a later Gemini provider error recovered automatically. A subsequent Work response is still missing despite two accepted deliveries. The accessible Work automation metadata exposes no correlated run or tool failure, so the host-side cause remains unverified. Identical-event receiver deduplication, a skipped run and a tool/inference failure are hypotheses, not proven causes. Leave bounded retries enabled, keep OAuth/history/Gemini/APK intact, and do not describe the full autonomous conversation goal as solved.
