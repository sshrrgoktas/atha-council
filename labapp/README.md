# Atha Council TEST — Task Bridge laboratory APK

This is a **separate Android module** from the standalone Council production app.

- TEST package: `com.atlascouncil.taskbridgelab`
- Launcher: `Atha Council TEST`
- Production Council package is unchanged
- No INTERNET permission, live Cloudflare calls, OAuth, PC tunnel or OpenCode dispatch
- Test is purely local. A future background Council bridge requires a separate reviewed server feature.

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
