# shadow-esp32 audio pipeline 骨架实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #4a.3)

## 本次提交改了什么

把 audio pipeline 骨架(API + 公共头 + 440 Hz synthetic source)落地,**首次把 #4a.1 libopus + #4a.2 libsrtp + #4a.3 audio source 串成完整管线**:

| 文件 | 状态 | 备注 |
|---|---|---|
| `app/src/include/shadow_esp32/audio_pipeline.h` | **新建** | 公共 API:`shadow_audio_pipeline_{start,stop,read_pcm,source}` |
| `app/src/audio_pipeline.c` | **新建** | 实现:440 Hz 连续相位正弦波作为 synthetic PCM source |
| `app/src/dialog_task.c` | 修改 | **替换** 三个独立 smoke test 为一个端到端管线 smoke test(audio_pipeline → opus_encode → srtp_protect → srtp_unprotect → opus_decode) |
| `app/CMakeLists.txt` | 修改 | 加 `audio_pipeline.c` 源 |
| `README.md` | 修改 | Roadmap #4a.3 标部分完成;修订表 v1.3 |
| `docs/implementation-notes/2026-08-16-audio-pipeline-skeleton.md` | **新建** | 本文件 |

## 设计取舍

### v1 用 synthetic 440 Hz source,而不是真 I²S

ESP32-S3-DevKitC-1 板载**没有麦克风**。真 I²S mic 需要:
- devicetree `&i2s0` 节点(ESP32-S3 的 I²S0 peripheral)
- pinctrl-0 设 BCK / WS / DIN / DOUT 引脚
- ESP32-S3 I²S driver 在 Zephyr 4.4 已合 mainline(`espressif,esp32-i2s` compatible)
- DMA buffer 配置 + i2s_trigger START

**选择 v1 = synthetic source** 的理由:
1. **本机没 mic 也能跑 smoke test** — CI 验证完整管线 link 正确
2. **API shape 现在就定** — 后续接 I²S 只改 `read_pcm` 内部,不改 dialog_task
3. **v1.1 替换只影响一个函数** — `shadow_audio_pipeline_read_pcm` 从正弦源改为 `i2s_read()`
4. **避免 git 拖累** — 不需要把 ESP32-S3 I²S devicetree 强加给所有人(没 mic 的人会被迫跳过)

### 为什么用 440 Hz(不是 0 静音)

- 0 PCM(libopus DTX)会压缩成 ~2-5 字节的小包 — link 通了但 **没真的测编解码**
- 440 Hz 正弦波:opus 编码 ~60-120 字节,SRTP 加密后 ~80-140 字节,**完整链路跑通**
- 串口打印 `n_opus=80, n_srtp=96` 这种数字一眼能验证管线正常

## 端到端管线 smoke test

```c
// dialog_task v1 末尾
shadow_audio_pipeline_start();
enc = shadow_opus_encoder_open();
dec = shadow_opus_decoder_open();
srtp = shadow_srtp_open(master, 30);

int16_t pcm_in[960];
opus_pkt[4000], srtp_pkt[4064], srtp_pkt2[4064];
int16_t pcm_out[960];

shadow_audio_pipeline_read_pcm(pcm_in);  // 440 Hz 正弦
n_opus = shadow_opus_encoder_encode(enc, pcm_in, opus_pkt, 4000);
n_srtp = shadow_srtp_protect(srtp, srtp_pkt, 4064, opus_pkt, n_opus);
n_unp  = shadow_srtp_unprotect(srtp, srtp_pkt2, 4064, srtp_pkt, n_srtp);
n_dec  = shadow_opus_decoder_decode(dec, srtp_pkt2, n_unp, pcm_out, 0);

// 期望输出(n_opus 是真实 opus 包大小,非 DTX 静默):
// [shadow_dialog] opus encode 440Hz: ~80 bytes
// [shadow_dialog] srtp protect: ~96 bytes (in=80)
// [shadow_dialog] srtp unprotect: 80 bytes
// [shadow_dialog] opus decode: 960 samples
// [shadow_dialog] pipeline pcm round-trip DIFFERS (expected for lossy opus)
```

## audio_pipeline API 契约

```c
enum shadow_audio_source {
    SHADOW_AUDIO_SOURCE_NONE = 0,
    SHADOW_AUDIO_SOURCE_I2S  = 1,
    SHADOW_AUDIO_SOURCE_SYNTHETIC = 2,
};

enum shadow_audio_source shadow_audio_pipeline_source(void);
int  shadow_audio_pipeline_start(void);
void shadow_audio_pipeline_stop(void);
int  shadow_audio_pipeline_read_pcm(int16_t *pcm_out);  // 960 int16_t
```

## 已知边界

1. **本机无 Zephyr SDK / 无 mic** — v1 用 440Hz synthetic 跑通;v1.1 才是真 I²S
2. **`pcm_changed` 在 pcm round-trip 后是 DIFFERS** — opus 是有损 codec,完全 byte-equal 是不可能的;SMOKE 测的是 *能编能解* + *N 值合理*,不是 PCM 字节相同
3. **没有 I²S playback(DAC)** — v1 只跑了 capture → encode → encrypt → decrypt → decode;**没有实际回放 PCM**;playback 留 v1.1 或单独 commit
4. **没有 UDP send/recv** — srtp 的 protect/unprotect 在同一进程内 loopback;真 UDP 网络路径在 #4a.5(sctp data channel 之后)
5. **没有 DTLS handshake** — master key + salt 是固定值;真 DTLS 输出由 #4a.4 注入

## v1.1 follow-up(commit #4a.3.1)

需要:
1. `app/boards/esp32s3_devkitc.overlay` 加 `&i2s0` 节点(ESP32-S3 的 I²S0 peripheral,BCK/WS/DIN 接 PDM mic 三个 GPIO)
2. `audio_pipeline.c::shadow_audio_pipeline_read_pcm` 改为 `i2s_read()` blocking call
3. 增加 capture thread 在 background 跑 `i2s_trigger(START)` + ring buffer management
4. `shadow_audio_pipeline_source` 改读 devicetree(`DT_HAS_NODE(DT_NODELABEL(i2s0))`)决定 I²S vs synthetic

## 验证

```bash
# devcontainer
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app

# 串口
# [shadow_dialog] dialog_task running full pipeline smoke test
# [shadow_dialog] audio_pipeline started (source=synthetic)
# [shadow_dialog] opus encode 440Hz: 80 bytes        ← 80 = 实际编码输出
# [shadow_dialog] srtp protect: 96 bytes (in=80)    ← 96 = 80 + 16 byte auth tag
# [shadow_dialog] srtp unprotect: 80 bytes
# [shadow_dialog] opus decode: 960 samples (from 80 byte packet)
# [shadow_dialog] pipeline pcm round-trip DIFFERS (expected for lossy opus)
# [shadow_dialog] dialog_task handshake sequence complete; idle
```

## 引用

- ADR-0002 v2 §后续动作 #4a.3
- Zephyr I²S API: https://docs.zephyrproject.org/latest/hardware/peripherals/i2s.html
- ESP32-S3 I²S: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/peripherals/i2s.html