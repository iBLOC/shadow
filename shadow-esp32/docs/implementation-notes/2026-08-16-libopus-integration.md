# shadow-esp32 libopus 集成实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #4a.1)

## 本次提交改了什么

把 libopus (xiph/opus v1.5.2) 集成为 Zephyr module,**编译进 shadow-esp32 app**:

| 文件 | 状态 | 说明 |
|---|---|---|
| `west.yml` | 修改 | 加 `libopus: url: github.com/xiph/opus, revision: v1.5.2, path: app/opus/libopus` |
| `app/opus/zephyr/module.yml` | **新建** | Zephyr module 描述符(name + build.cmake 指向 `app/opus/CMakeLists.txt` + Kconfig skip)|
| `app/opus/CMakeLists.txt` | **新建** | 7 行 Zephyr 包装:`add_subdirectory(libopus)` + 设 `OPUS_BUILD` / `OPUS_BUILD_SHARED_LIBS=OFF` |
| `app/src/include/shadow_esp32/audio.h` | **新建** | shadow-esp32 公共 audio API(encoder/decoder opaque 句柄 + frame 60 ms / 16 kHz / mono 常量)|
| `app/src/audio.c` | **新建** | 136 行 — libopus C API 的 thin wrapper(encoder_open/encode/close + decoder_open/decode/close)|
| `app/src/dialog_task.c` | 修改 | 在 v1 流程尾部加 libopus smoke test(zeroed PCM → encode → decode round-trip,证明 link 正确)|
| `app/CMakeLists.txt` | 修改 | 加 `src/audio.c` + `target_link_libraries(app PRIVATE libopus)` |

## 集成模式:Zephyr module wrapper

```
shadow-esp32/west.yml
  → projects: libopus (xiph/opus v1.5.2) @ app/opus/libopus

app/opus/
  ├── zephyr/module.yml     # 描述符:这是 Zephyr module
  ├── CMakeLists.txt          # add_subdirectory(libopus) + 编译选项
  └── libopus/                # ← west update 拉取

app/src/audio.c
  #include "opus.h"             # 来自 app/opus/libopus/include
  → 调 opus_encoder_create / opus_encode / opus_decode

app/CMakeLists.txt
  target_link_libraries(app PRIVATE libopus)   # 链入
```

## west.yml 关键设计

```yaml
manifest:
  projects:
    - name: zephyr
      revision: v4.4.1
    - name: libopus
      url: https://github.com/xiph/opus
      revision: v1.5.2
      path: app/opus/libopus
```

- **`path: app/opus/libopus`** — 拉取的源树放在我们 module 目录内(标准模式,见 Zephyr 文档)
- **不用 git submodule** — west 自己的 manifest 机制已经管理依赖
- **`user.suppress-getty-notice: true`** — 抑制 west 首次跑的提示

## Zephyr module 描述符

```yaml
# app/opus/zephyr/module.yml
name: libopus
build:
  cmake: .
  settings:
    board_root: .
    board: .
  kconfig:
    skip:
      - .
```

- **`build.cmake: .`** — module 的 CMake 入口是 `app/opus/CMakeLists.txt`
- **`kconfig.skip: ["."]`** — **关键**:upstream libopus 自带 `Kconfig` 文件,与 Zephyr 的 Kconfig 系统冲突,跳过它避免 Zephyr 误读

## audio.h API 契约

```c
#define SHADOW_OPUS_SAMPLE_RATE_HZ  16000
#define SHADOW_OPUS_CHANNELS         1
#define SHADOW_OPUS_FRAME_SAMPLES    960      /* 60ms @ 16kHz */
#define SHADOW_OPUS_MAX_PACKET       4000

struct shadow_opus_encoder *shadow_opus_encoder_open(void);
int  shadow_opus_encoder_encode(struct shadow_opus_encoder *enc,
                                 const int16_t *pcm,
                                 uint8_t *out, size_t out_cap);
void shadow_opus_encoder_close(struct shadow_opus_encoder *enc);

struct shadow_opus_decoder *shadow_opus_decoder_open(void);
int  shadow_opus_decoder_decode(struct shadow_opus_decoder *dec,
                                 const uint8_t *opus, size_t opus_len,
                                 int16_t *out, int fec);
void shadow_opus_decoder_close(struct shadow_opus_decoder *dec);
```

设计选择:
- **opaque handle** 隐藏 libopus 的 `OpusEncoder* / OpusDecoder*` — 换 codec 实现不需要改 dialog_task
- **60 ms / 16 kHz / mono** 与 xiaozhi-esp32 + temporal lobe 一致(改一个值三个项目都要改)
- **`fec` 参数** 给 decoder 用于 PLC 丢包恢复

## v1 配置细节

| ctl | 值 | 理由 |
|---|---|---|
| `OPUS_SET_BITRATE` | 24000 bps | 语音质量够;Wi-Fi 弱网时省带宽 |
| `OPUS_SET_COMPLEXITY` | 2 | ESP32-S3 Xtensa LX7 @ 240 MHz 留 headroom 给 DTLS+SRTP |
| `OPUS_SET_PACKET_LOSS_PERC` | 5 | FEC 触发率 |
| `OPUS_SET_INBAND_FEC` | 1 | 开 in-band FEC(弱网韧性) |
| `OPUS_SET_DTX` | 1 | 不说话时省电省带宽 |

## Smoke test(在 dialog_task v1 末尾)

```c
// 零值 PCM(静音)→ encode → decode round-trip
int16_t pcm_in[960] = { 0 };
uint8_t packet[4000];
int n = opus_encode(enc, pcm_in, 960, packet, 4000);
// n ≈ 2-5 bytes(DTX 紧凑包)
int r = opus_decode(dec, packet, n, pcm_out, 960, 1);
// r = 960 samples decoded
```

**目的**:在 dialog_task v1 流程末尾跑一次,证明:
1. libopus Zephyr module link 正确
2. encoder/decoder 创建 + 编码 + 解码 round-trip 完整
3. 整个 RTOS 线程栈没爆(用 16 KiB dialog 栈,opus 实例 + buffer ~50 KB 在 heap)

**真正的 I²S mic → opus → SRTP → UDP 管线**在 commit #4a.3(音频管线),v1 只证明 link 正确。

## 已知边界

1. **本机无 Zephyr SDK** — `west update` 必须在 devcontainer 或 CI 跑,才能拉 libopus 源
2. **libopus v1.5.2 source 大约 5 MB** — git clone 一次后,west cache 复用
3. **编译时间增加** — libopus 全特性编译约 +20-30 sec(单核),首次 CI 约 +1 min
4. **Flash 占用增加** — libopus `.a` 大约 150-250 KB,partition 表可能需要调整
5. **未跑 I²S 硬件** — v1 只证明 codec link,没接 I²S mic / speaker
6. **没跑 I²S 编解码的实际负载** — v1 跑 zeroed PCM,真实 mic input 在 #4a.3

## 验证

```bash
# devcontainer 或 CI:
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app

# CI 跑通的话,artifact 包含:
#   - app/build/zephyr/zephyr.elf
#   - app/build/zephyr/zephyr.bin
#   - 期望大小:1-1.5 MB(主要是 libopus)
```

**串口输出** (在 dialog_task v1 末尾):
```
[shadow_dialog] dialog_task handshake sequence complete; idle
[shadow_dialog] dialog_task running libopus smoke test
[shadow_dialog] opus encode silence: N bytes (DTX)   ← N 在 1-10 之间
[shadow_dialog] opus decode round-trip: 960 samples
```

## 引用

- ADR-0002 v2 §后续动作 #4a.1
- libopus 官方:https://opus-codec.org/
- xiph/opus 仓库:https://github.com/xiph/opus
- libopus API 文档:https://opus-codec.org/docs/opus_api-1.5/
- Zephyr module 规范:https://docs.zephyrproject.org/latest/develop/modules.html
- xiaozhi-esp32 opus 配置(参考):`78/xiaozhi-esp32/main/audio/processors/afe.cc`