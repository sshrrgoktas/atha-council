plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android {
    namespace = "com.atlascouncil.app"
    compileSdk = 35
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    defaultConfig {
        applicationId = "com.atlascouncil.app.lab"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
        versionName = "0.3-council-LAB"
    }
    // LAB packages never load or reuse production Android signing keys.
    // Gradle's debug key signs test-only APKs for side-by-side installation.
}
dependencies { implementation("com.nimbusds:nimbus-jose-jwt:9.47") }
