# Prefrontal（移动端嵌入式）

移动端的 Prefrontal **不是外部进程**，而是编译成 `.so` 嵌在 App 进程内。

```
Flutter (Dart)
  │  MethodChannel 'com.ibloc.shadow/prefrontal_runtime'
  ▼
PrefrontalRuntimeService (Kotlin)
  │  JNI  Java_com_ibloc_shadow_PrefrontalRuntime_*
  ▼
libprefrontal_core_lib.so (Rust)
  │  axum mini HTTP server，绑 127.0.0.1:<port>
  ▼
Flutter (Dart) ── HTTP/JSON ──▶ Prefrontal 自己的 REST API
```

## 文件

| 文件 | 作用 |
|---|---|
| `prefrontal_mobile_service.dart` | Dart 侧的 MethodChannel / HTTP 客户端 |
| `prefrontal_mobile_provider.dart` | Riverpod 状态：status / port / agents / errorMessage |
| `prefrontal_mobile_cluster_page.dart` | 管理页（启动/停止运行时、列智能体、发起一次调用） |

## MethodChannel 协议

通道名 `com.ibloc.shadow/prefrontal_runtime`，方法：

| 方法 | 参数 | 返回 |
|---|---|---|
| `start` | `{"preferredPort": int}` | `bool` |
| `stop` | — | `bool` |
| `isHealthy` | — | `bool` |
| `getStatus` | — | `Map`（含 `running` / `port`） |
| `registerAgent` | `{"agentId", "name", "description"}` | `bool` |
| `invokeAgent` | `{"agentId", "input"}` | `String` |
| `startAndroidService` | — | — |
| `stopAndroidService` | — | — |

`invokeAgent` 先走 JNI（同进程直调，更快），JNI 失败再回退到 HTTP。

## 页面入口

管理页挂在 `/settings/prefrontal`，从「设置 → 嵌入式 Prefrontal」进入。

## `.so` 从哪来

`.so` 是兄弟仓库 [prefrontal](https://github.com/iBLOC/prefrontal) 的构建产物，**不入库**，
按需在那个仓库里构建后拷到
`shadow-mobile/android/app/src/main/jniLibs/<abi>/libprefrontal_core_lib.so`。

```bash
# 在 prefrontal 仓库
./scripts/build-android.sh aarch64-linux-android --output /path/to/shadow-mobile
```

产物名必须叫 `prefrontal_core_lib` —— Kotlin 侧是
`System.loadLibrary("prefrontal_core_lib")`，名字对不上必然 `UnsatisfiedLinkError`。

`.so` 缺失时 App **不会崩**：`PrefrontalRuntime` 的 `init{}` 不重抛 `loadLibrary` 的失败，
每个 native 调用点各自 catch `UnsatisfiedLinkError`，错误落到 `MainActivity` 已有的
`SO_NOT_LOADED` 分支里。
