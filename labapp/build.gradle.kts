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

  // A dedicated LAB key; never reuse Council's signing identity.
  // Without all TEST secrets we produce only a throwaway debug APK.
  val labKeyFile = System.getenv("ATHA_LAB_SIGNING_FILE")
  val labStorePassword = System.getenv("ATHA_LAB_STORE_PASSWORD")
  val labKeyPassword = System.getenv("ATHA_LAB_KEY_PASSWORD")
  val labAlias = System.getenv("ATHA_LAB_KEY_ALIAS")
  if (!labKeyFile.isNullOrBlank() && !labStorePassword.isNullOrBlank()
      && !labKeyPassword.isNullOrBlank() && !labAlias.isNullOrBlank()) {
    signingConfigs {
      create("labStable") {
        storeFile = file(labKeyFile)
        storePassword = labStorePassword
        keyAlias = labAlias
        keyPassword = labKeyPassword
      }
    }
    buildTypes {
      getByName("release") {
        isMinifyEnabled = false
        signingConfig = signingConfigs.getByName("labStable")
      }
    }
  }
}
