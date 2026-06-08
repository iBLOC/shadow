plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ibloc.shadow"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "30.0.14904198"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.ibloc.shadow"
        minSdk = 31
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
        
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                arguments += listOf("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    
    // MNN native build - commented out, keeping for future reference
    // externalNativeBuild {
    //     cmake {
    //         path = file("src/main/cpp/CMakeLists.txt")
    //         version = "3.22.1"
    //     }
    // }
    
    // MNN jniLibs - commented out, keeping for future reference
    // sourceSets {
    //     getByName("main") {
    //         jniLibs.srcDirs("src/main/jniLibs")
    //     }
    // }

    packaging {
        jniLibs {
            pickFirsts.add("**/libc.so")
            pickFirsts.add("**/libm.so")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Pinned to 0.13.1 (released 2026-06-03). Do NOT use `latest.release` here —
    // floating versions break reproducible builds and have caused silent upgrades
    // when Google publishes patch releases. The artifact's Kotlin API surface
    // (Engine / EngineConfig / Backend / Conversation / Content / Contents) is
    // backward compatible with our LitertEngine.kt. See:
    //   https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.13.1
    //   https://maven.google.com/web/index.html#com.google.ai.edge.litertlm:litertlm-android
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.13.1")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
