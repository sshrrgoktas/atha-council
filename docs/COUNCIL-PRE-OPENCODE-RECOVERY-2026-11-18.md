# Atha Council — pre-OpenCode recovery candidate (18 November 2026)

## Staged changes and history

UNMERGED candidate only. The Council production Worker and three tests are restored exactly from 16 November 2026 baseline 317c9944ec6e38d46d15b38488b5e81fb2a80148. The post-OpenCode Task Centre, companion modules and dependent tests are removed. Historical Git commits remain available. No D1 tables or data are deleted.

Council Android source, APK identity com.atlascouncil.app, current native return to the separate AthalAI Mobile APK, and the existing UI layout are unchanged relative to main 740357444bb0bd2ae5b910cade3017170f1d8f65. The AthalAI Dev Studio source, Windows tunnel, Android QR app, production Cloudflare configuration, iOS source, signing or installed apps are not changed.

## Verification

On Windows, a separate temporary checkout of this candidate passed 124/124 local Node unit tests, including 2 recovery guard tests; no failing tests. Live production smoke tests, real Android build, APK signing, production OAuth, Cloudflare preview, camera/QR and iOS compilation are NOT verified. Never describe this as a completed rollback or installed app.

## Remaining safety gates

1. Review the draft PR; verify OpenCode absent from worker, and no Android/desktop/iOS or tunnel source changes.
2. Run GitHub CI plus a private/staging Cloudflare deployment check for OAuth, authorized rooms, Gemini, Qwen, ChatGPT callbacks and Android navigation.
3. IMPORTANT: the historical version may restore the previously retired QwQ endpoint. Verify non-OpenCode model parity (including Qwen 3.8) before production rollback.
4. Test mobile QR with a new code on LAN and remote, including expired code/error states and return to normal chat, without changing the app UI or live tunnel.
5. Preserve backups of deployed Worker and D1; do not drop schemas, overwrite credentials or publish an APK automatically.

## User-required sequence

Separate AthalAI and Council -> restore and verify Council pre-OpenCode -> repair the existing AthalAI QR/connection behavior without changing UI or tunnel -> build and validate native iOS apps -> finally, add OpenCode as a separately authorized task agent, not a Council chat participant.

DO NOT merge or deploy this branch before the independent verification gates above.
