# Atha Task Bridge v2 — isolated prototype (2026-11-19)

**EXPERIMENT ONLY — NO LIVE INTEGRATION.** This branch contains a pure, offline draft interpreter and an in-memory user-decision ledger. It is NOT the Council worker and does not contact D1/Cloudflare, read OAuth credentials, launch agents, or modify the user's PC. AthalAI, Council live environment, Android/iOS applications and tunnel remain untouched.

## Added in v2
- `decision-memory.cjs` reconciles explicit user statements by topic, with message index/ID provenance; earlier user decisions remain in the event history.
- Assistant claims are never converted into user decisions. Human corrections override earlier human instructions **only when explicit and resolvable**.
- Short pronoun-based commands and references such as `Eskisi gibi` are flagged `ambiguous_reference` rather than silently executed.
- Stop/protection commands are retained as holds; no generated packet can dispatch work.
- `sharedHandoff` emits a common non-executable task-understanding packet usable in future by Gemini/Qwen/OpenCode (NOT currently integrated).
- `shadow-review.cjs` displays original human message alongside inferred intent, source, missing evidence, latest human decisions and uncertainty, without sending anything to the Council.
- No changes outside `experiment/atha-task-bridge` and the scoped CI workflow.

## Example
Human: `Dijital çevrilebilir e-kitap oluştur` → `Hadi yap`
Bridge: ebook draft; missing verified story text and approved workspace; **no dispatch**.

Human: `Konseyi test ortamında kur` → `Eskisi gibi`
Bridge: ambiguity flagged; existing prior decision preserved; **no dispatch**.

Human: `OpenCode sohbet katılımcısı olmasın, görev işçisi olsun`
Bridge: latest explicit human correction overrides previous chat-participant request.

## Test
`node --test experiment/atha-task-bridge/*.test.cjs`

## Known limitations / required work before release
1. Heuristic Turkish text analysis is a prototype, not deep semantic understanding; referent and negation errors remain possible. For example, `önceki sürüm` needs an explicit version identifier, even when the subject is clear.
2. The ledger is only calculated from supplied turns; it is not persistent memory and cannot verify which prior decisions were deployed.
3. Room scope is caller-provided metadata; production must validate the authenticated owner, room, messages and evidence server-side.
4. Real integration should begin as **default-OFF read-only shadow mode** after Council/AthalAI separation PR #78 is validated.
5. Human review and explicit approval remain mandatory before any signed OpenCode work order, independent of interpretation confidence.
6. Preserve task logs, implement user corrections with IDs and audit receipts, test real Turkish conversations and adversarial inputs, and block any cross-room leakage.
7. No automatic PR merge, deploy, paid API, file write to PC, or modification of existing workers in this experiment.

## Workflow
Human request → user-scoped evidence → interpret → latest decision ledger → uncertainty/contradiction review → shared handoff preview → human correction → explicit task approval → (future) isolated worker → verification evidence.

**GitHub PR #79 must stay draft until reviewed and verified.**
