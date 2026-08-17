# shadow-esp32 Zephyr scaffold 实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #2)

## 本次提交改了什么

把 shadow-esp32 从 ESP-IDF 5.x + HID demo scaffold 切换到 **Zephyr 4.4.x + 5 个独立任务**的应用骨架。cortex 端 / temporal 端 / ESP32 firmware 内容均**未变**,仅 ESP32 firmware 仓库结构变化。

## 移动的文件(全部归入 `.legacy-esp-idf/`)

| 原路径 | 现路径 | 备注 |
|---|---|---|
| `main/` | `.legacy-esp-idf/main/` | ESP-IDF BLE HID demo(冻结,不再开发) |
| `CMakeLists.txt` | `.legacy-esp-idf/CMakeLists.txt` | ESP-IDF 顶层 CMake |
| `sdkconfig` | `.legacy-esp-idf/sdkconfig` | ESP-IDF 已固化配置 |
| `sdkconfig.defaults*` | `.legacy-esp-idf/sdkconfig.defaults*` | ESP-IDF 板级配置 |
| `sdkconfig.ci.nimble` | `.legacy-esp-idf/sdkconfig.ci.nimble` | CI 配置 |
| `.clangd` | `.legacy-esp-idf/.clangd` | 旧 clangd 配置 |
| `build/` | `.legacy-esp-idf/build/` | 旧编译产物 |

## 新增的文件

| 文件 | 行数(约) | 作用 |
|---|---|---|
| `west.yml` | 20 | workspace manifest → Zephyr v4.4.1 |
| `CMakeLists.txt`(顶层)| 13 | Zephyr SDK 入口 + `add_subdirectory(app)` |
| `prj.conf`(顶层)| 13 | workspace 默认 Kconfig |
| `app/CMakeLists.txt` | 35 | 列出 5 个 task 源文件 |
| `app/prj.conf` | 74 | Wi-Fi / mDNS / mbedTLS / 多线程 + 任务栈/优先级常量 |
| `app/src/main.c` | 25 | 启动 → 4 个 task |
| `app/src/dialog_task.c` | 38 | ADR-0002 v2 §4.3 占位(WebRTC client 心跳) |
| `app/src/io_task.c` | 38 | §4.6 占位(MCP server 心跳) |
| `app/src/net_task.c` | 37 | §4.6 占位(Wi-Fi/mDNS/signaling 心跳) |
| `app/src/led_task.c` | 37 | §4.3 占位(状态指示器心跳) |
| `app/src/include/shadow_esp32/tasks.h` | 42 | 任务公共 API + 栈/优先级常量 |
| `.devcontainer/Dockerfile` | 25 | 切到 `zephyrprojectrtos/zephyr-build:0.16-3` |
| `.devcontainer/devcontainer.json` | 20 | `postCreateCommand: west init + update + pip` |

**总计 372 行**(几乎全是 Zephyr 模板代码 + ADR 引用注释)。

## 修改的文件

| 文件 | 改动 |
|---|---|
| `.gitignore` | 加 Zephyr 条目:`/zephyrproject/`、`/app/build/`、`/twister-out/` |
| `README.md` | 章节"当前代码"重写为新目录;Roadmap #3 标完成;Roadmap #2 标完成;新增"编译(Zephyr + west)"章节;修订表 v0.5 |

## Kconfig 摘要

| 主题 | 关键 CONFIG |
|---|---|
| 多线程 | `MULTITHREADING=y`、`THREAD_NAME=y`、`THREAD_STACK_INFO=y`、`INIT_STACKS=y` |
| Wi-Fi | `NETWORKING=y`、`NET_IPV4=y`、`NET_DHCPV4=y`、`WIFI=y` |
| mDNS | `MDNS=y`、`MDNS_RESPONDER=y`、`MDNS_SERVICE_NAME="shadow-esp32"` |
| DTLS (mbedTLS) | `MBEDTLS=y`、`MBEDTLS_KEY_EXCHANGE_PSK_ENABLED=y`、`MBEDTLS_HEAP_SIZE=65536` |
| 任务栈 / 优先级 | `SHADOW_DIALOG_STACK_SIZE=16384` / `SHADOW_DIALOG_PRIORITY=5`(其余见 `app/prj.conf`) |

## 已知边界

1. **本机无 west / Zephyr SDK** — 验证只能在 devcontainer (`zephyrprojectrtos/zephyr-build:0.16-3`) 或有 SDK 的 CI 上跑 `west build -b esp32s3_devkitc app`
2. **`CONFIG_SHADOW_ESP32_LOG_LEVEL_DBG` 在 Kconfig 里** — 顶层 `prj.conf` 设了,`app/prj.conf` 显式覆盖 — 但需要在 `app/Kconfig` 里定义该 symbol 才不会触发 Kconfig warning(后续修)
3. **libopus / libsrtp / webrtc-stack-stub 三个 out-of-tree 依赖还没拉** — ADR-0002 v2 §后续动作 #3-#5 各自的 commit 中添加,不在本次 scaffold 范围
4. **board overlay** (`app/boards/esp32s3_devkitc.overlay`) — 如果 devkitc 默认 devicetree 不够(例如 I²S 引脚配置),在 #3 / #5 / #6 中按需添加

## 编译 / 验证

```bash
# devcontainer 自动完成(见 devcontainer.json postCreateCommand)
west init -l .
west update
west packages pip --install
west build -b esp32s3_devkitc app
west flash
```

本机无可用 Zephyr SDK,本次**未运行** `west build`。所有 Kconfig / CMake 写法按 Zephyr 4.4 文档规范。

## 引用

- ADR-0002 v2: `shadow-esp32/docs/adr/0002-shadow-esp32-implementation-architecture.md` §4.2-§4.3
- 后续动作: ADR-0002 v2 §后续动作 #3-#10
- Zephyr 文档: https://docs.zephyrproject.org/latest/develop/application/index.html