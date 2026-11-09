plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "com.atlascouncil.app"
    compileSdk = 35
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    defaultConfig {
        applicationId = "com.atlascouncil.app"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
        versionName = "0.1"
    }
    val signingFile = System.getenv("ATLAS_SIGNING_FILE")
    if (!signingFile.isNullOrBlank()) {
        signingConfigs {
            create("atlasRelease") {
                storeFile = file(signingFile)
                storePassword = System.getenv("ATLAS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ATLAS_KEY_ALIAS")
                keyPassword = System.getenv("ATLAS_KEY_PASSWORD")
            }
        }
        buildTypes {
            getByName("release") {
                isMinifyEnabled = false
                signingConfig = signingConfigs.getByName("atlasRelease")
            }
        }
    }
}
dependencies { implementation("com.nimbusds:nimbus-jose-jwt:9.47") }
