plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "com.atlascouncil.taskbridgelab"
  compileSdk = 35
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  defaultConfig {
    applicationId = "com.atlascouncil.taskbridgelab"
    minSdk = 26
    targetSdk = 35
    versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
    versionName = "0.1.0-taskbridge-lab"
  }
}
