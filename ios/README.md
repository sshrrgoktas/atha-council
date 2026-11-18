# Atha Council iPhone — separate native app (development)

The Council is in its **own repository** (sshrrgoktas/atha-council) and own iOS bundle com.atlascouncil.ios. The **main AthalAI Mobile** is in sshrrgoktas/athalai-dev-studio with bundle com.athalai.mobile and owns normal PC chat, camera and QR. Neither app imports the other's Swift source, cookies or credentials.

Council contains a native SwiftUI start screen, read-only server status check, ShareLink, and dismissible Apple Safari browser for Council conversation and GitHub/Google OAuth. It has no PC tunnel, local terminal or camera permissions. Existing Council Cloudflare site remains the single backend. A web rollback (OpenCode-free worker v141) does not require an iOS code merge.

## Virtual Mac and payment

Add **atha-council** to Codemagic as a SECOND application; keep existing AthalAI configuration. Branch: feature/ios-atha-council-standalone-20261118. YAML: codemagic.yaml. Run atha-council-ios-simulator manually for unsigned native simulator code and XCTest. Nothing is auto-triggered or auto-published. Mac simulator artifacts cannot be installed on a physical iPhone.

After optional Apple Developer enrollment, owner creates Council-only Codemagic group atha_council_apple_signing, then deliberately runs atha-council-ios-signed. It requires Apple App Store Connect API credentials, certificates/profiles and outputs signed IPA; does not publish itself. No secrets belong in GitHub or chat.

**Unverified:** Mac Xcode compile, Apple signing, App Review and on-device Safari OAuth login and session persistence. The native server URL and security-policy source can be tested without a Mac. Council Android APK, primary Android QR app, desktop tunnel and user records are untouched. Apple App Review guideline 4.2 may require additional native functions.
