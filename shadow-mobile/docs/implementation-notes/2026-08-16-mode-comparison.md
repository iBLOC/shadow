# 数字人直播声卡模式 vs 语音助手模式 (2026-08-16)

## 两种 mode 区分

| 模式 | 流程 | 主导方向 | 谁生成内容 |
|---|---|---|---|
| **直播声卡模式** | phone 看直播 → 数字人 avatar 跑 TTS → 音频送 shadow-esp32 → 音箱/BT 耳机 | audio OUT 主导 | TTS(cortex/temporal) |
| **语音助手模式** | user 说话 → shadow-esp32 mic 采集 → ASR → LLM → TTS → 音箱/BT 耳机 | audio IN + OUT 双向 | 用户输入 + LLM 回复 |

两种 mode 共享同一套硬件 + 协议,只是数据流方向相反。

## 当前 shadow-mobile + shadow-esp32 现状

| 模式 | 现状 | 评估 |
|---|---|---|
| **直播声卡模式** | 部分实现 | shadow-esp32 USB Audio OUT ✓(v2.4);shadow-mobile 路由 ✓(v2.5);**数字人 avatar 屏幕缺**(v2.6 需 Live2D / WebGL) |
| **语音助手模式** | 已实现 | `voice_conversation_screen.dart` 已有 LiteRT LLM + 语音对话;**v1 路径用 Phone-as-Engine,可选 fallback cortex** |
| **蓝牙耳机(任一 mode)** | 已支持 | Android `AudioManager` 系统级路由;v2.5 完成 |
| **数字人直播 + BT 耳机** | 已支持 | shadow-esp32 USB Audio → speaker,**v2.4/v2.5 完整** |
| **语音助手 + shadow-esp32 音箱** | 缺 | `voice_conversation_screen` 用 Phone 本机;**改走 shadow-esp32 USB Audio 需路由层改动** |
| **数字人 avatar** | 缺 | 直播声卡模式需要 Live2D / WebGL 屏幕 |

## 直播声卡模式(v2.6 实施)

完整数据流:
```
phone 上的数字人 avatar(Live2D / WebGL / 静态图片)
  ↓ TTS
phone 内存 PCM
  ↓ AudioTrack.write
USB Audio OUT → shadow-esp32 → I²S TX → 音箱
  ↑ 或者 BT 耳机
```

shadow-esp32 端:**完全不变**,v2.4 USB Audio 已支持。
shadow-mobile 端需新组件:
1. `digital_human_screen.dart` — 直播声卡模式屏幕
   - Live2D / WebGL avatar 渲染
   - TTS 文本输入(从 chat / 流)
   - 自动路由到 shadow-esp32 USB Audio(已有 v2.5 `UsbAudioRouter`)

## 语音助手模式(v2.6 增强现有 `voice_conversation_screen`)

完整数据流(已有 `voice_conversation_screen`):
```
shadow-esp32 I²S mic(PDM)
  ↓ opus encode + srtp protect + UDP send
phone ASR(用 cortex / neure / 本地 LiteRT)
  ↓
phone LLM(走 cortex / 本地 LiteRT)
  ↓
phone TTS
  ↓ AudioTrack.write
USB Audio OUT → shadow-esp32 → 音箱
  ↑ 或者 BT 耳机
```

**v2.6 增强**(让 voice 走 shadow-esp32 USB Audio 替代本机):
- 修改 `voice_conversation_screen` 的 audio output 路由
- 增加 UI 切换"Phone speaker / shadow-esp32 USB / BT headphone"
- 复用 v2.5 `UsbAudioRouter`

## 实施计划

| 任务 | 估时 | 内容 |
|---|---|---|
| v2.6 — Live2D avatar SDK 集成 | 1-2 周 | Live2D Cubism SDK + Flutter 集成 |
| v2.6 — TTS 流从数字人 → USB Audio | 1 周 | 自动从 Live2D 同步嘴型 + TTS 输出 |
| v2.6 — voice_conversation USB Audio 路由 | 0.5 周 | 复用 v2.5 `UsbAudioRouter` |
| v2.6 — settings 加 mode 选择器 | 0.5 周 | "Streamer / Assistant" 切换 |
| **总计** | **3-4 周** | |

## 当前代码完成度

| 模块 | 行数 | 状态 |
|---|---|---|
| `voice_conversation_screen.dart` | 200+ | ✅ 已有 LiteRT 语音助手模式 |
| `provisioning_screen.dart` | 209 | ✅ 配网流程(v2.5) |
| `usb_audio_routing_service.dart` | 78 | ✅ Android AudioManager 路由(v2.5) |
| `digital_human_screen.dart` | 缺 | 📋 v2.6 待实施 |
| TTS → Live2D 同步 | 缺 | 📋 v2.6 待实施 |

## 已知边界

| 项目 | 现状 | 升级 |
|---|---|---|
| **语音助手走本机** | Phone 资源有限 | v2.6 走 shadow-esp32 USB Audio |
| **数字人 avatar** | 缺 Live2D SDK | v2.6 集成 Live2D Cubism 或 react-three-fiber + VRM |
| **TTS + 嘴型同步** | 缺 | v2.6 整合 TTS 文本 + viseme 同步 |
| **人设 / 知识库** | 已有 | cortex flow 接入,自定义 |

## 实施记录

| 文件 | 状态 |
|---|---|
| `lib/screens/voice_conversation_screen.dart` | 已有(语音助手) |
| `lib/screens/digital_human_screen.dart` | v2.6 缺(数字人直播) |
| `lib/services/usb_audio_routing_service.dart` | v2.5 ✅ 通用(两 mode 共用)|
| `lib/widgets/live2d_player.dart` | v2.6 缺 |

## 引用

- Live2D Cubism SDK: https://www.live2d.com/en/sdk/about/
- VRM spec: https://vrm.dev/
- ADR-0001 shadow-esp32 §4.2:两种使用模式
- v2.5 实施记录: `docs/implementation-notes/2026-08-16-v2.5-android-ble-provisioning.md`
