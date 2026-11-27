plugins { id("com.android.application") }
android {
 namespace = "co.misfinanzas.dev"
 compileSdk = 35
 defaultConfig { applicationId = "co.misfinanzas.dev"; minSdk = 26; targetSdk = 35; versionCode = 28; versionName = "2.7.0" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 val signingDirectory = System.getenv("MF_ANDROID_SIGNING_DIR")
 if (!signingDirectory.isNullOrBlank()) {
  signingConfigs {
   create("personalRelease") {
    storeFile = file("$signingDirectory/misfinanzas-release.p12")
    storePassword = file("$signingDirectory/store.password").readText().trim()
    keyAlias = "misfinanzas"
    keyPassword = storePassword
    storeType = "PKCS12"
    enableV1Signing = true
    enableV2Signing = true
   }
  }
  buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("personalRelease") } }
 }
}
dependencies { implementation("androidx.webkit:webkit:1.12.1") }
