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
    // ⚠️ **2026-11-11 订正**：上面那句「只构建 arm64-v8a 与 x86_64 两份」
    // **是错的** —— 端脑运行时**只入库存了 arm64-v8a 一份**（jniLibs 下只有
    // arm64-v8a/）。而 x86_64 之所以仍出现在 APK 里，是**引擎/插件/CMake**
    // 带来的那 9 个库（libflutter.so 等）**凑**出来的 ⇒ ⇒ APK 逐字声明
    // `native-code: 'arm64-v8a' 'x86_64'`，而 `lib/x86_64/` 里**没有**
    // libencephalon.so ⇒ ⇒ **x86_64 设备装得上、端脑面却整个消失**
    // （Kotlin 把 UnsatisfiedLinkError catch 掉 ⇒ ⇒ **失败长得像成功**）。
    // ⇒ ⇒ 所以**只声明真正有运行时的那一个** —— x86_64 设备改走
    // `INSTALL_FAILED_NO_MATCHING_ABIS`（**失败长得像失败**）。
    // ⇒ ⇒ 要恢复 x86_64 声明的前提是：把 x86_64 的端脑运行时**编出来**
    // （encephalon/scripts/build-android.ps1 有 x86_64 目标，✅ 59.1 MB）
    // **并**把同目录的随包库补齐（libc++_shared.so / MNN 全家）。
    //
    // **armeabi-v7a 暂不做**（2026-10-29 决定）—— 背景：阻断
    // 是 cranelift-codegen（wasmtime 的代码生成器）：
    // "no supported isa found for arch `armv7`"。见 encephalon 仓
    // scripts/README.md。
    //
    // ⚠️ 2026-11-01 记一笔差点成真的事：`mobile` feature **试过**带上
    // hippocampus（用户拍板：手机上的会话要落在本机，不能随 App 重启
    // 消失），真机实测**被平台挡住**了 —— Lance 发布文件靠 `fs::hard_link`，
    // 而 Android 的 SELinux **不允许 App 在自己的数据目录里建硬链接**
    // ⇒ ⇒ 端脑直接起不来 ⇒ ⇒ 移动端改用**文件版**会话存储（端脑侧见
    // telencephalon/AGENTS.md ㋞ 条）⇒ ⇒ `mobile` 不带 hippocampus，
    // .so 也就留在 159 MB。
    // ⇒ ⇒ 若将来要恢复 hippocampus，armv7 就会多一个阻断：上游
    // lance-core 的 32 位 ARM SIMD 探针（它的 `#[cfg]` 只有 aarch64 /
    // x86_64 / loongarch64 三支，没有 `target_arch = "arm"` ⇒ 32 位 ARM
    // 上闭包体被编译掉、返回 `()` 而不是 `SimdSupport`）。
    val supportedAbis = listOf("arm64-v8a")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.ibloc.shadow"
        // 最低支持 **Android 7.0（API 24）**。
        //
        // 历史一：钉 31 时 Android 11 设备根本装不上（`INSTALL_FAILED_OLDER_SDK`）⇒
        // 2026-10-31 降到 30 实测：构建无依赖要求 31、整条链在 Android 11 全部跑通。
        // 历史二：2026-11-07 降到 24 —— MI MAX 2（Android 7.1.1 / API 25）兼容尝试。
        // 依赖层读数：插件全链最大 minSdk = 24（image_picker_android / url_launcher_android
        // 等）、litertlm-android AAR = 23 ⇒ 没有依赖顶到 25 以上。
        // ⚠️ 原生库档位：encephalon/scripts/build-android.ps1 的交叉目标 API 是 **21**
        // （低于 24 ⇒ libencephalon.so 理论上不引用更高档的 libc 符号）；
        // API 24/25 上的 dlopen/符号实际读数以真机为准（闸B）。
        minSdk = 24
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
    // ⚠️ 2026-11-08：本地推理**归 neuron 管**（进程内 adapter 管线）⇒ ⇒
    // 这里不再有 LiteRT-LM / nanohttpd / okhttp 依赖：
    // - `litertlm-android` —— 随 `litert/LitertEngine.kt` 出仓；
    // - `nanohttpd` + `okhttp` —— 随 `mnn/OpenAIServer*`（本地 HTTP 面）
    //   与 `http/MobileActionServer` 出仓。
    // 三者在 Kotlin 源码里已**零引用** ⇒ ⇒ 留着只是白拉依赖。

    // ⚠️ **Android 模块的第一个 JVM 单测位**（2026-11-03 建）。
    //
    // 为什么建：Android 模块此前**一个单测都没有** ⇒ ⇒ Kotlin 侧的纯逻辑
    // 完全没被钉住 ⇒ ⇒ 「ScreenBudget」那种刻意不碰 Android 类型的类
    // 明明可以单测，却只能靠编译通过来担保。
    //
    // ⚠️ **版本钉在 4.12**：本机 gradle 缓存里就是 4.12 ⇒ ⇒ `--offline` 能跑
    // ⇒ ⇒ CI 与本地都不会因为拉不动依赖而红。（4.13.2 是更新版本，但拉它要联网。）
    testImplementation("junit:junit:4.12")
}
