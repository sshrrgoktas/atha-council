# Atha Council TEST — Task Bridge laboratory APK

This is a **separate Android module** from the standalone Council production app.

- TEST package: `com.atlascouncil.taskbridgelab`
- Launcher: `Atha Council TEST`
- Production Council package is unchanged
- TEST has INTERNET permission **only** for its independent, fixed Cloudflare LAB gateway (native request layer); HTML cannot fetch arbitrary internet resources.
- TEST gateway: `atha-council-taskbridge-lab.sshrrgoktas.workers.dev`. Not the existing `atlas-council` Worker.
- Real Qwen and Llama use isolated Cloudflare Workers AI. Gemini requires a newly created TEST-only Google AI Studio API key; absent key is displayed as `not_configured`.
- Distinct TEST access token is stored only in the TEST app preferences; never commit that token or production keys. The user's prompts go to the TEST providers only when the user taps compare.
- No OAuth, PC tunnel, real OpenCode dispatch, or production Council rooms/database.
- Offline Task Bridge review remains local. A future background production integration requires separate approval and verification.

## Permanent TEST signing

TEST release updates use a **different private keystore** from production. Its public SHA-256 certificate fingerprint is pinned in `labapp/signing-certificate-sha256.txt`. The private keystore and passwords MUST NOT be committed or uploaded as public Actions artifacts.

The owner must set four encrypted GitHub repository Actions secrets:
`ATHA_LAB_KEYSTORE_BASE64` (single-line base64 encoding of dedicated .p12),
`ATHA_LAB_STORE_PASSWORD`,
`ATHA_LAB_KEY_PASSWORD`,
`ATHA_LAB_KEY_ALIAS` (fixed: `atha-council-lab`).

A push to `lab/council-task-bridge-isolated-20261119` then builds and verifies a signed TEST release artifact. When secrets are absent, the workflow produces only an explicitly labeled **temporary debug** APK. It must not be presented as a stable, updateable release.

**Android update rule**: package name, signing certificate, and increasing versionCode must all match. Earlier LAB debug builds used an ephemeral signing certificate and may require a **one-time uninstall of only the TEST app** before the first stable signed TEST release. Never uninstall production Council or AthalAI to resolve a LAB signature mismatch.

## Verification

`node --test test/lab-independent-package.test.mjs lab/council-task-bridge/*.test.cjs`

`gradle :labapp:assembleRelease` only after proper separate lab secrets are provided.

No automatic merging of this lab into production.
