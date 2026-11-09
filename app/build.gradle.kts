plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "com.atlascouncil.app"; compileSdk = 35
 defaultConfig { applicationId = "com.atlascouncil.app"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1" } }
dependencies { implementation("com.nimbusds:nimbus-jose-jwt:9.47") }
