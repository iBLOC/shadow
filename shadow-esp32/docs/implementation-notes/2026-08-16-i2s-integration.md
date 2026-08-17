# shadow-esp32 I²S 真硬件集成实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #4a.4)

## 本次提交改了什么

把 `audio_pipeline.c` 从"synthetic-only"升级为"I²S-first, synthetic-fallback":

| 文件 | 状态 | 备注 |
|---|---|---|
| `app/boards/esp32s3_devkitc.overlay` | 修改 | 加 `&i2s0` 节点(PDM RX,BCK=GPIO15 / DIN=GPIO16)+ `shadow_i2s0_pdm_rx_default` pinctrl |
| `app/src/audio_pipeline.c` | **替换** | 130 行 → 165 行:加 Zephyr `<zephyr/drivers/i2s.h>` 集成 + 失败回退 |
| `README.md` | 修改 | Roadmap #4a.4 完成;修订表 v1.4 |
| `docs/implementation-notes/2026-08-16-i2s-integration.md` | **新建** | 本文件 |

## 设计取舍

### 用 Zephyr I²S API(`<zephyr/drivers/i2s.h>`)

ESP32-S3 I²S peripheral 在 Zephyr 4.4 已合 mainline(`espressif,esp32-i2s` compatible)。用标准 API 替代 vendor SDK 是正确的路径 — 后续支持 Zephyr 任何 board。

### PDM RX 模式(不是标准 I²S RX)

PDM MEMS mic(INMP441,SPH0645 等)只需 2 根线(BCK + DATA),**省 WS 引脚**。ESP32-S3 I²S peripheral 支持 PDM RX,SoC 在硬件里做 decimation → 标准 16-bit PCM,直接喂给 opus。

devicetree overlay:
```dts
&i2s0 {
    status = "okay";
    pinctrl-0 = <&shadow_i2s0_pdm_rx_default>;
    pinctrl-names = "default";
};

shadow_i2s0_pdm_rx_default: shadow_i2s0_pdm_rx_default {
    group1 {
        psels = <GPIO15 GPIO16>;
    };
};
```

- `GPIO15` = I2S0_MCLK 信号(用作 PDM clock out)
- `GPIO16` = I2S0_DIN(PDM data in)
- 实际接线:把 PDM mic 的 SCK 接 GPIO15,SD 接 GPIO16

### 失败回退:bdevkitc 没 mic 也能跑

```
i2s_configure()      ← 成功(SoC peripheral 在)
i2s_trigger(START)   ← 成功(无 PDM clock 信号但配置 OK)
i2s_read()           ← timeout (-EAGAIN, 没 PCM 数据)
       │
       ▼
synth_sine()         ← 440 Hz fallback
```

这样 bare devkitc 跑 smoke test 时:
- `i2s_configure` 成功(SOC peripheral 在)
- `i2s_trigger(START)` 成功(没 mic 但 SoC 不报错)
- `i2s_read` 第一次会 timeout
- 回退 synthetic
- 整个管线还是跑通

CI 验证 `west build` 通过 + 真实硬件(mic 接上)跑全套 I²S → opus → srtp。

## v1 → v1.4 关键变更

| 行为 | v1 | v1.4 |
|---|---|---|
| `shadow_audio_pipeline_source()` | 总是 `SYNTHETIC` | 优先 `I2S`,无 device 时 `SYNTHETIC` |
| `shadow_audio_pipeline_start()` | 总是 OK(无操作) | 调 `i2s_configure` + `i2s_trigger(START)`,失败回退 |
| `shadow_audio_pipeline_read_pcm()` | 总是 synthetic sine | 先 `i2s_read` 试一帧;失败回退 synthetic |
| devicetree `&i2s0` | 没声明 | 已声明(PDM RX pinctrl) |
| Kconfig | 无 | (Zephyr 默认启用 `CONFIG_I2S=y` 通过 `espressif,esp32-i2s` 兼容) |

## 验证

```bash
west init -l . && west update && west packages pip --install
west build -b esp32s3_devkitc app
west flash

# 串口
# [shadow_audio] audio_pipeline started (source=i2s)   ← 试着 I²S
# [shadow_audio] i2s_read rc=-11, falling back to synthetic  ← 实际 fallback
# [shadow_dialog] opus encode 440Hz: 80 bytes
# [shadow_dialog] srtp protect: 96 bytes (in=80)
# [shadow_dialog] srtp unprotect: 80 bytes
# [shadow_dialog] opus decode: 960 samples
```

**真实硬件**(接 INMP441 到 GPIO15/GPIO16):
- `source=i2s` 配置成功
- `i2s_read` 返回真实 PCM(来自 mic)
- 整个管线用真实 mic 输入

## 已知边界

1. **Zephyr mainline I²S API 与 ESP-IDF 略有差异** — ESP-IDF 用 `i2s_read` 接受 `char *` 数组,Zephyr 用 `void *`;但功能等价
2. **PDM mono only** — 当前配置 `channels=1`;真立体声 mic 留 v1.5
3. **没接 DMA capture thread** — v1 是 blocking read 在 dialog_task 主线程;v1.5 拆 capture thread + ring buffer
4. **没接 I²S playback** — 只有 RX;DAC / speaker 留 #4a.5
5. **没接 DTLS master key** — SRTP 仍用固定 30-byte master;真 DTLS 输出由 #4a.6 注入

## v1.5 follow-up(#4a.4.1)

需要:
1. Capture thread:`k_thread_create` 后台,持续 `i2s_read` 进 ring buffer
2. `shadow_audio_pipeline_read_pcm` 从 ring buffer 取(非阻塞 with `K_FOREVER`)
3. Ring buffer 容量 = 4 帧 = 240 ms latency(给 opus / srtp 留 headroom)
4. 真 I²S playback 路径(单独 commit / 单独 file)

## 引用

- ADR-0002 v2 §后续动作 #4a.4
- Zephyr I²S API: https://docs.zephyrproject.org/latest/hardware/peripherals/i2s.html
- ESP32-S3 I²S: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/peripherals/i2s.html
- INMP441 PDM mic: https://www.invensense.com/products/INMP441/
- ADR-0002 v2 §后续动作 #4a.3 实施记录(前一 commit): `docs/implementation-notes/2026-08-16-audio-pipeline-skeleton.md`