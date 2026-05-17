import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// local.properties'ten keystore bilgilerini oku. EAS managed keystore'u
// indirip "watch_app/keystore/rosellea.jks" altına yerleştirin; ROSELLEA_*
// değerlerini local.properties'e yazın (git'e gitmez). Wear OS Data Layer
// telefon ve saat APK'larının aynı anahtarla imzalanmasını şart koşuyor.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val ksFile: String? = localProps.getProperty("ROSELLEA_KS_FILE")
val ksPwd: String? = localProps.getProperty("ROSELLEA_KS_PASSWORD")
val ksKeyAlias: String? = localProps.getProperty("ROSELLEA_KEY_ALIAS")
val ksKeyPwd: String? = localProps.getProperty("ROSELLEA_KEY_PASSWORD")
val hasSigningConfig = ksFile != null && ksPwd != null && ksKeyAlias != null && ksKeyPwd != null

android {
    namespace = "com.aybarsbl.watch_app"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        // Wear OS Data Layer aynı applicationId'ye otomatik route eder; telefon
        // applicationId'si "com.aybarsbl.frontend" — saatte de aynı applicationId
        // olduğu için framework cross-device mesajları doğrudan teslim eder,
        // capability advertisement gerekmez. Java namespace "com.aybarsbl.watch_app"
        // ayrı kalıyor (kod paketi değişmedi, sadece app device-ID değişti).
        applicationId = "com.aybarsbl.frontend"
        minSdk = 36
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    if (hasSigningConfig) {
        signingConfigs {
            create("rosellea") {
                storeFile = rootProject.file(ksFile!!)
                storePassword = ksPwd
                keyAlias = ksKeyAlias
                keyPassword = ksKeyPwd
            }
        }
    }

    buildTypes {
        debug {
            if (hasSigningConfig) {
                signingConfig = signingConfigs.getByName("rosellea")
            }
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasSigningConfig) {
                signingConfig = signingConfigs.getByName("rosellea")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    useLibrary("wear-sdk")
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.activity.compose)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.navigation)
    implementation(libs.compose.ui.tooling)
    implementation(libs.core.splashscreen)
    implementation(libs.play.services.wearable)
    implementation(libs.ui)
    implementation(libs.ui.graphics)
    implementation(libs.ui.tooling.preview)
    implementation(libs.wear.tooling.preview)
    implementation(libs.health.services.client)
    implementation(libs.okhttp)
    implementation(libs.lifecycle.service)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.concurrent.futures)
    implementation(libs.guava)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.ui.test.junit4)
    debugImplementation(libs.ui.test.manifest)
    debugImplementation(libs.ui.tooling)
}
