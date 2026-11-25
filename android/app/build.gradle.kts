plugins { id("com.android.application") }
android {
 namespace = "co.misfinanzas.dev"
 compileSdk = 35
 defaultConfig { applicationId = "co.misfinanzas.dev"; minSdk = 26; targetSdk = 35; versionCode = 27; versionName = "2.7.0-rc2" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation("androidx.webkit:webkit:1.12.1") }
