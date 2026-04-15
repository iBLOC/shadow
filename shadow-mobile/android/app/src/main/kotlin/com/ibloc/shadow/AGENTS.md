# android/app/src/main/kotlin/com/ibloc/shadow/ - Android Native

## OVERVIEW

Android原生Kotlin代码，处理MNN引擎和无障碍服务。

## WHERE TO LOOK

| Task | Location |
|------|----------|
| 主Activity | MainActivity.kt |
| 无障碍服务 | PrefrontalAccessibilityService.kt |
| MNN封装 | mnn/PrefrontalMNN.kt |
| OpenAI兼容API | mnn/OpenAIServer.kt, mnn/OpenAIRoutes.kt |

## ANTI-PATTERNS

- **MNN路径硬编码** - 应使用环境变量或配置
- **无障碍配置** - 需用户手动开启

## CONVENTIONS

- MethodChannel前缀: `com.ibloc.shadow/`
- 无障碍服务需在AndroidManifest.xml声明
- 手势通过dispatchGesture派发

## NOTES

- 仅arm64-v8a支持
- JNI桥接在cpp/mnn_bridge.cpp
