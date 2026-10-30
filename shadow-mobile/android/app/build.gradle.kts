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

    // 移动端实际支持的 ABI —— 取值必须与 android/app/src/main/jniLibs/ 下
    // 实际有哪些 ABI 的原生库一致。
    //
    // 为什么必须**同时**设 defaultConfig 和每个 buildType：
    // Flutter 的 Gradle 插件在「插件 apply 阶段」（也就是本文件的 android {}
    // 块被求值**之前**）给每个 buildType 写死了 DEFAULT_PLATFORMS
    // （arm64-v8a / armeabi-v7a / x86_64），而 buildType 上的 abiFilters
    // 会**覆盖** defaultConfig 的。只在 defaultConfig 写，哪怕写对了，
    // 也拦不住插件那三个。
    //
    // 为什么在意这个：APK 宣称支持一个 ABI、而包里没有那个 ABI 的原生
    // 运行时 = 那些设备**装得上**（badging 的 native-code 是声明值），
    // 但那个运行时根本不存在，表现为功能整个消失。
    //
    // libencephalon.so 只构建 arm64-v8a 与 x86_64 两份，所以 APK 也只声明
    // 这两个 ABI。**armeabi-v7a 暂不做**（2026-10-29 决定）—— 背景：Lance
    // 的阻断已消除（telencephalon 把 hippocampus 改成 optional），但还有
    // 第二个阻断 cranelift-codegen（wasmtime 的代码生成器）：
    // "no supported isa found for arch `armv7`"。见 encephalon 仓
    // scripts/README.md。
    val supportedAbis = listOf("arm64-v8a", "x86_64")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.ibloc.shadow"
        // 最低支持 **Android 11（API 30）**。
        //
        // 为什么不是 31：2026-10-31 真机复验时发现，钉在 31 会让
        // **Android 11 的设备根本装不上**（`INSTALL_FAILED_OLDER_SDK`），
        // 而那台设备（RK3566）正是目前唯一能跑端脑真机链路的机器。
        // 实测把 minSdk 降到 30 之后：构建无任何依赖要求 31、整条链
        // （端脑起得来 → 客户端工具 → 本地执行 → 回传 → 同回合续说）
        // 在 Android 11 上**全部跑通** ⇒ 用户拍板正式支持 Android 11。
        //
        // ⚠️ 代价：API 30 与 31 两档都要覆盖 ⇒ 真机复验的机器不能只留
        // 一台 Android 12+ 的。
        minSdk = 30
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        ndk {
            // 注意是 clear() + addAll()，不是 `=` 也不是 `+=`：
            // abiFilters 在 AGP 的 Kotlin DSL 里是
            // `val abiFilters: MutableSet<String>` —— 不能赋值（报
            // "Val cannot be reassigned"）；而 `+=` 是往插件已经写进去的
            // 集合上**追加**，等于什么都没限制。
            abiFilters.clear()
            abiFilters.addAll(supportedAbis)
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
        // buildType 上的 abiFilters **覆盖** defaultConfig 的，而 Flutter
        // 的 Gradle 插件正是在插件 apply 阶段给每个 buildType 写死了
        // arm64-v8a / armeabi-v7a / x86_64 —— 那个阶段早于本文件被求值，
        // 所以这里再写一次才能真正把它限住。
        //
        // 插件的代码（FlutterPlugin.kt）自己也是 clear() + add()，但它加的
        // 是 DEFAULT_PLATFORMS 全集；我们要的是「jniLibs 里真有运行时」的
        // 那几个。见上面 supportedAbis 的注释。
        getByName("debug") {
            ndk {
                abiFilters.clear()
                abiFilters.addAll(supportedAbis)
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("debug")
            ndk {
                abiFilters.clear()
                abiFilters.addAll(supportedAbis)
            }
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
