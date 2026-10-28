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
                // defaultConfig 层的 externalNativeBuild 在 AGP 公共 DSL 里
                // 是 ExternalNativeBuildFlags（只有 cppFlags/arguments/abiFilters
                // 等 flags，没有 path/version），所以编译开关留在这里。
                cppFlags += "-std=c++17"
                arguments += listOf("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON")
            }
        }
    }

    // 必须显式指定 CMake 源目录。Flutter 的 Gradle 插件
    // (FlutterPluginUtils.forceNdkDownload) 会在本模块没有 path 时，
    // 把 CMake 源目录改写成 flutter_tools 里那份**空的** CMakeLists.txt ——
    // 于是 src/main/cpp/mnn_bridge.cpp 永远不会被编译，libmnnbridge.so 不会
    // 进包，PrefrontalMNN.kt 的 System.loadLibrary("mnnbridge")
    // 必然抛 UnsatisfiedLinkError。
    // path/version 只在**模块级** externalNativeBuild（ExternalNativeBuild →
    // Cmake）上可用，defaultConfig 层拿不到。
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
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
