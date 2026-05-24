# Shadow-Mobile 多模态对话助理设计

**日期:** 2026-05-19
**状态:** 设计阶段
**目标:** 实现支持多模态输入和语音输出的持续对话 Agent

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    shadow-mobile (Android)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────┐ │
│  │  语音输入   │   │  图像输入   │   │  摄像头输入 │   │ 文件输入│ │
│  │  (麦克风)   │   │  (相册)     │   │  (实时流)   │   │(PDF等)  │ │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └────┬───┘ │
│         │                  │                  │                 │      │
│         ▼                  ▼                  ▼                 ▼      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              GemmaEngine (LiteRT-LM Kotlin API)              │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  Contents.of(                                            │  │   │
│  │  │    Content.Text("用户文本"),                             │  │   │
│  │  │    Content.ImageFile(path),                              │  │   │
│  │  │    Content.AudioBytes(audioBytes)                        │  │   │
│  │  │  )                                                       │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  Gemma-4-E4B.litertlm (多模态本地推理)                     │   │
│  │  └── complexity: "simple" | "medium" | "complex"            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               SkillExecutor (复杂度判断)                      │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  { intent, params, complexity }                        │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  ├── simple/medium → 直接响应                               │   │
│  │  └── complex → HTTP POST /skills/execute                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              TTS Engine (Android 默认 TextToSpeech)          │   │
│  │  └── speak(responseText) → 语音输出                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP (结构化JSON)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Prefrontal (:8082)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /skills/execute                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  { intent, params, session_id, source }                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               Boa JS Engine                                  │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  skills/                                                │  │   │
│  │  │  ├── query-wikipedia/index.js                           │  │   │
│  │  │  ├── calculate-hash/index.js                             │  │   │
│  │  │  └── ...                                                 │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  window['skill_execute'] = async (params, context) => {...}  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Response: { success, result: { type, content, next_steps } } │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据模型

### 2.1 Gemma 指令格式

```json
{
  "intent": "skill_name | null",
  "params": {
    "query": "用户输入",
    "context": {}
  },
  "complexity": "simple | medium | complex",
  "source": "voice | image | camera | file | text",
  "session_id": "uuid"
}
```

### 2.2 Skill 执行请求 (Mobile → Prefrontal)

```json
{
  "intent": "query-wikipedia",
  "params": {
    "query": "什么是量子计算",
    "context": { "session_id": "uuid" }
  },
  "session_id": "uuid",
  "source": "voice"
}
```

### 2.3 Skill 执行响应 (Prefrontal → Mobile)

```json
{
  "success": true,
  "result": {
    "type": "text | image | webview",
    "content": "执行结果文本",
    "next_steps": []
  },
  "skill_execution_id": "uuid"
}
```

---

## 3. 目录结构

### 3.1 shadow-mobile (Kotlin + Flutter)

```
shadow-mobile/
├── lib/
│   ├── main.dart
│   ├── gemma_engine/                    # Gemma 本地推理
│   │   ├── gemma_engine.dart            # LiteRT-LM 封装
│   │   ├── conversation_manager.dart    # 对话会话管理
│   │   └── types.dart                  # 类型定义
│   ├── input_handlers/                 # 多模态输入处理
│   │   ├── audio_handler.dart          # 语音输入 (Whisper/麦克风)
│   │   ├── image_handler.dart          # 图像输入
│   │   ├── camera_handler.dart         # 摄像头输入
│   │   └── file_handler.dart          # 文件输入
│   ├── skill_executor.dart             # Skill 执行判断
│   ├── tts_engine.dart                 # Android TTS 封装
│   ├── prefrontal_client.dart           # 与 Prefrontal 通信
│   └── providers/                       # Riverpod providers
│       └── chat_provider.dart
├── android/
│   └── app/src/main/kotlin/com/shadow/mobile/
│       └── MainActivity.kt
└── pubspec.yaml
```

### 3.2 Prefrontal (Rust)

```
prefrontal/
├── src/
│   ├── skills/
│   │   ├── mod.rs
│   │   ├── loader.rs
│   │   ├── executor.rs
│   │   └── js_runtime.rs
│   └── main.rs
├── skills/                              # JS Skills
│   ├── query-wikipedia/
│   │   └── index.js
│   ├── calculate-hash/
│   │   └── index.js
│   └── ...
└── Cargo.toml
```

---

## 4. 实现步骤

### Phase 1: 基础对话 (MVP)

1. **GemmaEngine 集成**
   - 添加 LiteRT-LM 依赖
   - 实现 GemmaEngine 类，加载 Gemma-4-E4B.litertlm
   - 实现基础文本对话

2. **首页 UI**
   - 对话列表显示
   - 文本输入框
   - 消息发送/接收

3. **TTS 语音输出**
   - Android TextToSpeech 集成
   - 模型回复自动语音播报

### Phase 2: 多模态输入

4. **语音输入**
   - 麦克风录制
   - 音频处理

5. **图像输入**
   - 图片选择器
   - 图片发送给 Gemma

6. **摄像头输入**
   - 实时摄像头预览
   - 帧采样发送给 Gemma

7. **文件输入**
   - PDF/文档解析
   - 发送给 Gemma

### Phase 3: Skill 执行

8. **SkillExecutor**
   - 复杂度判断
   - 简单任务直接响应
   - 复杂任务转发 Prefrontal

9. **Prefrontal Boa 集成**
   - 添加 boa 依赖
   - 实现 JS Runtime
   - Skill 加载和执行

---

## 5. 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 本地推理 | LiteRT-LM (Kotlin API) | Gemma-4-E4B.litertlm |
| 多模态 | LiteRT-LM Content API | ImageFile, AudioBytes |
| TTS | Android TextToSpeech | 系统默认 |
| Skill 执行 | Boa JS Engine (Rust) | Prefrontal 端 |
| 对话状态 | Riverpod | Flutter 状态管理 |

---

## 6. 依赖配置

### shadow-mobile (pubspec.yaml)

```yaml
dependencies:
  flutter_riverpod: ^2.4.0
 http: ^1.1.0
  record: ^5.0.0          # 麦克风录制
  image_picker: ^1.0.0    # 图片选择
  camera: ^0.10.0          # 摄像头
  file_picker: ^6.0.0     # 文件选择
  android_tts: ^4.0.0      # TTS
```

### shadow-mobile (build.gradle.kts)

```kotlin
dependencies {
    implementation("com.google.ai.edge.litertlm:litertlm-android:latest.release")
}
```

---

## 7. 首页设计

```
┌─────────────────────────────────────────┐
│  ≡  Shadow Assistant            🎤 📷   │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 你: 今天天气怎么样？          │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🤖 助理: 今天晴天，温度25度...   │   │
│  │    🔊                           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 📷 [图片] 你: 分析这张图         │   │
│  └─────────────────────────────────┘   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  [📎] [输入框...]            [🎤] [发送]│
└─────────────────────────────────────────┘
```

**输入选项：**
- 📎 附件菜单（图片/摄像头/文件）
- 🎤 语音输入
- 📷 直接打开摄像头

**输出选项：**
- 🔊 TTS 播报按钮

---

## 8. 注意事项

1. **Gemma 模型文件**：需要从 HuggingFace 下载 Gemma-4-E4B.litertlm
2. **首次加载慢**：`engine.initialize()` 可能需要 10+ 秒，应在后台执行
3. **TTS 语言**：需要确保 TTS 支持中文
4. **权限申请**：麦克风、摄像头、存储权限
