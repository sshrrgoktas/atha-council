plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }; namespace = "com.atlascouncil.app"; compileSdk = 35
 defaultConfig { applicationId = "com.atlascouncil.app"; minSdk = 26; targetSdk = 35; versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1); versionName = "0.1" } }
dependencies { implementation("com.nimbusds:nimbus-jose-jwt:9.47") }
