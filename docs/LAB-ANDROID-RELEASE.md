# Atha Council LAB APK — isolated Android test release

User asked for a separate test app without touching the working PC tunnel or stable APK.

- Android package: com.atlascouncil.app.lab (production: com.atlascouncil.app).
- Launcher: Atha Council LAB. No production OAuth deep link ownership; LAB uses athacouncil-lab scheme instead, and prevents opening GitHub/Google/ChatGPT live login flows. Production APK update checks are disabled in LAB.
- LAB QR companion link opens com.athalai.companion.lab, never the installed main AthalAI QR app.
- No production Android signing keys. Android Gradle debug key signs the test APK for separate installation.
- This lab shell still displays the live public Council web page without logging in. Do not enter real personal messages or authorize live OAuth in LAB. A future dedicated staging Worker is needed for end-to-end model/D1 tests without production data.
- Only a branch-specific GitHub Actions workflow builds the apk and publishes unique prerelease tags atha-council-lab-<run>. It does not overwrite latest-debug and changes neither main branch nor Cloudflare Worker.
- The real Android Council, main QR app, iOS sources and PC tunnel are NOT changed. No automatic installation or PC terminal operation.
- Requires successful workflow and a verified APK before giving download link.
