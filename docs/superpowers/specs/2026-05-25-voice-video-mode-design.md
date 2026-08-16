# Shadow Mobile 持续对话模式设计

**状态**: 实验性
**日期**: 2026-05-25

## 目标

实现两种新的聊天模式：
- **语音模式（Voice Mode）**: 持续语音对话，VAD 控制录音和发送
- **视频模式（Video Mode）**: 持续视频+音频对话

## 技术方案

### 依赖
- `vad: ^0.0.5` - Silero VAD 语音活动检测
- `permission_handler: ^11.3.1` - 权限管理

### 核心流程

**语音模式**：
1. 用户开始说话 → VAD 检测到 speech_start
2. 持续录音（同时 Mic 录音）
3. 用户停止说话 → VAD 检测到 speech_end
4. 发送音频片段给 LLM（≤30秒自动分段）
5. 接收回复 → TTS 播放
6. 继续监听

**视频模式**：
1. 用户开始说话 → VAD 检测到 speech_start
2. 持续录音 + 每秒采集 1 帧视频
3. speech_end → 组合发送
4. >30秒自动分段多次发送
5. TTS 播放回复
6. 继续监听

### 组件

| 组件 | 文件 | 职责 |
|------|------|------|
| VadService | `services/vad_service.dart` | Silero VAD 封装 |
| AudioSegmentCollector | `services/audio_segment_collector.dart` | 音频分片（≤30s） |
| VideoFrameCollector | `services/video_frame_collector.dart` | 视频帧采集 |
| ConversationModeProvider | `providers/conversation_mode_provider.dart` | 模式状态管理 |

### Gemma 限制

- 音频最大 30 秒
- 视频最大 60 秒（1fps）
- 超出自动分段

## 实现状态

- [x] 添加依赖 (vad, permission_handler, flutter_ai_toolkit)
- [x] VadService 封装 (lib/services/vad_service.dart)
- [x] AudioSegmentCollector (lib/services/audio_segment_collector.dart)
- [x] VideoFrameCollector (lib/services/video_frame_collector.dart)
- [x] ConversationModeProvider (lib/providers/conversation_mode_provider.dart)
- [x] ChatScreen 集成 (模式切换按钮)
- [x] LiteRTProvider 实现 LlmProvider 接口 (lib/providers/ai/litert_provider.dart)
- [x] VoiceConversationScreen (lib/screens/voice_conversation_screen.dart)
- [x] 原生 Kotlin LiteRT 支持音频/视频 Content

## 已知问题

1. Kotlin 代码未编译验证（Java 环境未安装）
2. `Content.AudioBytes` / `Content.ImageBytes` API 需要实际设备测试验证
