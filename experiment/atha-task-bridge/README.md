# Atha Task Bridge v1 — isolated experiment (2026-11-19)

**NO live integration.** This branch adds a **pure, offline, draft-only** shared understanding layer for Atha Council. It is not a live worker, does not connect to Council D1, does not read tokens and cannot dispatch OpenCode. Existing AthalAI, tunnel, Android/iOS applications, and live Council routes are untouched.

## Motivation
Current task drafting can copy final shorthand ("bunu yap", "yaptım diye dön") and model assertions as if they were precise instructions. Task Bridge resolves the latest human utterance against earlier **human** instructions and keeps other agents' statements as unverified contextual claims. It never treats Gemini's "done" as evidence or approval.

## Pipeline (future integration proposal, NOT enabled)
Human request → scoped Council conversation → **Intent Interpretation** → evidence and missing-fields check → shared task brief for Gemini/Qwen/OpenCode → human review and explicit approval → existing owner-scoped signed work queue → isolated worker → verified diff/test/evidence → human acceptance.

## Safety and limitations
- No automatic execution, no silent reinterpretation of "don't", no mutation of model responses, and no new permission grants.
- Human intent outranks all assistant suggestions. Unknown sources stay unverified.
- "Needs context" blocks any execution; explicit approval is still necessary even when draft is ready.
- Confidence is indicative, **not** permission. Full production integration requires account-/room-scoped data boundaries, provenance IDs and a dedicated threat-model review.
- Current worker only targets `sshrrgoktas/atha-council`; producing an independent ebook artifact needs a separately approved workspace or repository policy.
- Deterministic matching alone is not full natural-language understanding. Next stage may compare structured LLM interpretations, but only after audit logging and grounding are added.

## Local test
`node --test experiment/atha-task-bridge/atha-task-bridge.test.cjs`

## Release gates
1. PR remains draft; never merge automatically.
2. Run tests and adversarial Turkish prompts (pronouns, negations, changed decisions, model hallucinations).
3. Verify Council/AthalAI separation PR #78 independently.
4. Integrate behind a default-OFF feature flag in Council only, with staged preview and rollback.
5. Run on real Council prompt samples in *read-only shadow mode*. Show what Bridge inferred side-by-side with the original message; collect user corrections before dispatch integration.
