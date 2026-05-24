plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ibloc.shadow"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "27.2.12479018"

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
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta2")
}
