# Atha Council TEST — Task Bridge laboratory APK

This is a **separate Android application module**, not a modified copy of the production Council APK.

* Package: `com.atlascouncil.taskbridgelab`
* Launcher: `Atha Council TEST`
* No INTERNET permission; no Cloudflare, OAuth, live Council database, AthalAI, QR or PC tunnel access
* Task Bridge is an offline, user-visible test only; not a real OpenCode worker or deployed background service
* Own Android app sandbox (no shared files/preferences/cookies/identities with existing Council)
* Never merge lab module into production or change production app without human review

Build: `gradle :labapp:assembleDebug`.
**Signing caveat:** an update requires the same persistent signing certificate. Hosted CI debug keys may change. This lab must establish a durable, private test signing key before promising in-place upgrades.
