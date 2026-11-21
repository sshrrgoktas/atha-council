# Separate Council + Task Bridge / OpenCode laboratory

This directory is the **standalone Council** integration experiment based on the fully independent Council candidate PR #78. It copies verified Task Bridge v2 logic from PR #79. It does **not** include a deployed service, an APK update, or a live task queue.

Tests:
`node --test lab/council-task-bridge/*.test.cjs`
`node lab/council-task-bridge/turkish-shadow-benchmark.cjs`

Safety:
- No modification to main, live Cloudflare Worker/D1, existing PC worker, tunnel, or AthalAI applications.
- All queue "accepted" responses mean **offline mock only**, not that OpenCode executed a task.
- Real end-to-end test is gated by proof of Council separation on a physical device, user-specific room permission validation and resolving current Windows worker 401 + wrong room.
- The simulated approval receipt is deliberately not sufficient to authorize real work; only the Council server may validate a real authenticated approval.

For production, introduce a default-OFF, owner/room scoped preview. Only after explicit review is an approved work order eligible for signed worker claiming. Never merge this lab into main without separate human review and acceptance.
