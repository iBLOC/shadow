# Shadow-Mobile 多模态对话 Phase 1 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** 实现基于 Gemma-4-E4B 的本地对话能力 + TTS 语音输出

**Architecture:** 
- 使用 LiteRT-LM Kotlin API 替代现有 MNN 实现
- 通过 Platform Channel 与 Flutter 通信
- Android TextToSpeech 实现语音输出

**Tech Stack:** 
- LiteRT-LM Android SDK (com.google.ai.edge.litertlm:litertlm-android)
- Android TextToSpeech
- Riverpod 状态管理
- Platform Channel (MethodChannel)

---

## Chunk 1: 依赖配置

### Files:
- Modify: `android/app/build.gradle.kts`
- Modify: `pubspec.yaml`

- [ ] **Step 1: 添加 LiteRT-LM Android 依赖**

在 `android/app/build.gradle.kts` 的 `dependencies` 块添加:

```kotlin
dependencies {
    // ... existing
    implementation("com.google.ai.edge.litertlm:litertlm-android:latest.release")
}
```

- [ ] **Step 2: 添加 TTS 和录音依赖到 pubspec.yaml**

```yaml
dependencies:
  # ... existing
  record: ^5.0.0          # 麦克风录制
  image_picker: ^1.0.0    # 图片选择
  android_tts: ^4.0.0      # TTS (如果有) 或使用 android.speech.tts
```

- [ ] **Step 3: Commit**

```bash
cd https://github.com/iBLOC/shadow/shadow-mobile
git add -A
git commit -m "chore(mobile): add LiteRT-LM and TTS dependencies"
```

---

## Chunk 2: Kotlin GemmaEngine 实现

### Files:
- Create: `android/app/src/main/kotlin/com/ibloc/shadow/gemma/GemmaEngine.kt`
- Create: `android/app/src/main/kotlin/com/ibloc/shadow/gemma/ConversationManager.kt`
- Create: `android/app/src/main/kotlin/com/ibloc/shadow/tts/TtsManager.kt`
- Modify: `android/app/src/main/kotlin/com/ibloc/shadow/MainActivity.kt`

- [ ] **Step 1: 创建 GemmaEngine.kt**

```kotlin
package com.ibloc.shadow.gemma

import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class GemmaEngine {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized
    
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    
    suspend fun initialize(modelPath: String) {
        if (_isInitialized.value) return
        
        _isLoading.value = true
        try {
            val config = EngineConfig(
                modelPath = modelPath,
                backend = Backend.GPU()
            )
            engine = Engine(config)
            engine?.initialize()
            _isInitialized.value = true
        } finally {
            _isLoading.value = false
        }
    }
    
    suspend fun createConversation(systemInstruction: String? = null) {
        val convConfig = if (systemInstruction != null) {
            ConversationConfig(
                systemInstruction = Content.of(TextContent(systemInstruction))
            )
        } else null
        
        conversation = engine?.createConversation(convConfig)
    }
    
    suspend fun sendMessage(text: String): String {
        val conv = conversation ?: throw IllegalStateException("Conversation not created")
        return conv.sendMessage(Content.of(TextContent(text))).text
    }
    
    suspend fun sendMessageStream(text: String, onToken: (String) -> Unit) {
        val conv = conversation ?: throw IllegalStateException("Conversation not created")
        conv.sendMessageAsync(Content.of(TextContent(text))).collect { 
            onToken(it.toString())
        }
    }
    
    fun release() {
        conversation?.close()
        engine?.close()
        scope.cancel()
        _isInitialized.value = false
    }
}

private data class TextContent(val text: String) : Content.Text(text)
```

- [ ] **Step 2: 创建 TtsManager.kt**

```kotlin
package com.ibloc.shadow.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.*

class TtsManager(private val context: Context) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var isInitialized = false
    
    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking
    
    init {
        tts = TextToSpeech(context, this)
    }
    
    override fun onInit(status: Int) {
        isInitialized = status == TextToSpeech.SUCCESS
        if (isInitialized) {
            tts?.language = Locale.CHINESE
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) { _isSpeaking.value = true }
                override fun onDone(utteranceId: String?) { _isSpeaking.value = false }
                override fun onError(utteranceId: String?) { _isSpeaking.value = false }
            })
        }
    }
    
    fun speak(text: String, lang: String = "zh-CN") {
        if (!isInitialized) return
        val locale = when (lang) {
            "zh-CN" -> Locale.CHINA
            "en-US" -> Locale.US
            else -> Locale.getDefault()
        }
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tts_${System.currentTimeMillis()}")
    }
    
    fun stop() {
        tts?.stop()
        _isSpeaking.value = false
    }
    
    fun release() {
        tts?.stop()
        tts?.shutdown()
    }
}
```

- [ ] **Step 3: 修改 MainActivity.kt 添加 Platform Channel**

在 MainActivity.kt 中添加 Gemma 和 TTS 的 MethodChannel 处理:

```kotlin
// 在 MainActivity 类中添加
private val GEMMA_CHANNEL = "com.ibloc.shadow/gemma"
private val TTS_CHANNEL = "com.ibloc.shadow/tts"

private var gemmaEngine: GemmaEngine? = null
private var ttsManager: TtsManager? = null

// 在 onCreate 中初始化
ttsManager = TtsManager(this)

// 在 onDestroy 中释放
ttsManager?.release()

// 在 setupChannels 中添加
methodChannel.setMethodCallHandler { call, result ->
    when (call.method) {
        "gemma_initialize" -> {
            val modelPath = call.argument<String>("modelPath") ?: ""
            scope.launch {
                try {
                    gemmaEngine?.release()
                    gemmaEngine = GemmaEngine()
                    gemmaEngine?.initialize(modelPath)
                    gemmaEngine?.createConversation()
                    result.success(true)
                } catch (e: Exception) {
                    result.error("INIT_ERROR", e.message, null)
                }
            }
        }
        "gemma_send_message" -> {
            val text = call.argument<String>("text") ?: ""
            scope.launch {
                try {
                    val response = gemmaEngine?.sendMessage(text) ?: ""
                    result.success(response)
                } catch (e: Exception) {
                    result.error("SEND_ERROR", e.message, null)
                }
            }
        }
        "gemma_is_initialized" -> {
            result.success(gemmaEngine?.isInitialized?.value ?: false)
        }
        "gemma_release" -> {
            gemmaEngine?.release()
            result.success(true)
        }
        "tts_speak" -> {
            val text = call.argument<String>("text") ?: ""
            val lang = call.argument<String>("lang") ?: "zh-CN"
            ttsManager?.speak(text, lang)
            result.success(true)
        }
        "tts_stop" -> {
            ttsManager?.stop()
            result.success(true)
        }
        "tts_is_speaking" -> {
            result.success(ttsManager?.isSpeaking?.value ?: false)
        }
        else -> result.notImplemented()
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(mobile): add GemmaEngine and TtsManager Kotlin implementation"
```

---

## Chunk 3: Flutter GemmaEngine Dart 封装

### Files:
- Create: `lib/gemma_engine/gemma_engine.dart`
- Create: `lib/gemma_engine/types.dart`
- Create: `lib/tts_engine.dart`

- [ ] **Step 1: 创建 gemma_engine.dart**

```dart
import 'package:flutter/services.dart';

class GemmaEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/gemma');
  
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;
  
  Future<bool> initialize({String modelPath = '/data/local/tmp/gemma-4-e4b.litertlm'}) async {
    try {
      final result = await _channel.invokeMethod<bool>('gemma_initialize', {
        'modelPath': modelPath,
      });
      _isInitialized = result ?? false;
      return _isInitialized;
    } catch (e) {
      _isInitialized = false;
      return false;
    }
  }
  
  Future<String> sendMessage(String text) async {
    if (!_isInitialized) {
      throw StateError('GemmaEngine not initialized');
    }
    try {
      final result = await _channel.invokeMethod<String>('gemma_send_message', {
        'text': text,
      });
      return result ?? '';
    } catch (e) {
      throw Exception('Failed to send message: $e');
    }
  }
  
  Future<bool> release() async {
    try {
      await _channel.invokeMethod<bool>('gemma_release');
      _isInitialized = false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
```

- [ ] **Step 2: 创建 tts_engine.dart**

```dart
import 'package:flutter/services.dart';

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');
  
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {
    await _channel.invokeMethod<bool>('tts_speak', {
      'text': text,
      'lang': lang,
    });
  }
  
  Future<void> stop() async {
    await _channel.invokeMethod<bool>('tts_stop');
  }
  
  Future<bool> isSpeaking() async {
    final result = await _channel.invokeMethod<bool>('tts_is_speaking');
    return result ?? false;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(mobile): add GemmaEngine and TtsEngine Dart wrappers"
```

---

## Chunk 4: Chat Provider 改造

### Files:
- Modify: `lib/providers/chat_provider.dart`

- [ ] **Step 1: 更新 chat_provider.dart 添加 Gemma 模式**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../gemma_engine/gemma_engine.dart';
import '../tts_engine.dart';

enum ChatMode { agent2ui, gemma, off }

class ChatMessage {
  final String id;
  final String content;
  final bool isUser;
  final DateTime timestamp;
  final bool isStreaming;

  ChatMessage({
    required this.id,
    required this.content,
    required this.isUser,
    required this.timestamp,
    this.isStreaming = false,
  });
}

class ChatState {
  final List<ChatMessage> messages;
  final bool isLoading;
  final String? error;
  final ChatMode mode;

  ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.error,
    this.mode = ChatMode.off,
  });

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? isLoading,
    String? error,
    ChatMode? mode,
  }) {
    return ChatState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      mode: mode ?? this.mode,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final GemmaEngine _gemmaEngine;
  final TtsEngine _ttsEngine;

  ChatNotifier(this._gemmaEngine, this._ttsEngine) : super(ChatState());

  Future<void> initializeGemma() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final success = await _gemmaEngine.initialize();
      if (success) {
        state = state.copyWith(mode: ChatMode.gemma, isLoading: false);
      } else {
        state = state.copyWith(error: 'Failed to initialize Gemma', isLoading: false);
      }
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  Future<void> sendMessage(String text) async {
    if (state.mode != ChatMode.gemma) return;

    final userMessage = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: text,
      isUser: true,
      timestamp: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    );

    try {
      final response = await _gemmaEngine.sendMessage(text);
      final assistantMessage = ChatMessage(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        content: response,
        isUser: false,
        timestamp: DateTime.now(),
      );
      state = state.copyWith(
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      );
      // TTS speak
      await _ttsEngine.speak(response);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  Future<void> speakLastResponse() async {
    final lastAssistant = state.messages.lastWhere(
      (m) => !m.isUser,
      orElse: () => ChatMessage(id: '', content: '', isUser: false, timestamp: DateTime.now()),
    );
    if (lastAssistant.content.isNotEmpty) {
      await _ttsEngine.speak(lastAssistant.content);
    }
  }

  void setMode(ChatMode mode) {
    state = state.copyWith(mode: mode);
  }

  void clearMessages() {
    state = state.copyWith(messages: []);
  }
}

// Providers
final gemmaEngineProvider = Provider<GemmaEngine>((ref) => GemmaEngine());
final ttsEngineProvider = Provider<TtsEngine>((ref) => TtsEngine());
final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(gemmaEngineProvider),
    ref.watch(ttsEngineProvider),
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(mobile): integrate Gemma and TTS into chat provider"
```

---

## Chunk 5: ChatScreen UI 改造

### Files:
- Modify: `lib/screens/chat_screen.dart`

- [ ] **Step 1: 更新 chat_provider.dart 添加 Gemma 模式状态**

首先需要更新 chat_provider.dart 中的 ChatMode 枚举:

```dart
enum ChatMode { agent2ui, gemma, off }
```

并修改 `_LocalChatView` 的 `build` 方法，当 `chatState.mode == ChatMode.gemma` 时:
1. 显示 "Gemma" 标题而非 "Local"
2. 添加 TTS 播报按钮

- [ ] **Step 2: 添加 Gemma 模式切换 UI**

在 AppBar 的 mode toggle 处添加第三个选项:

```dart
// Mode toggle: Local (MNN) vs Gemma vs Agent2UI
IconButton(
  icon: Icon(
    chatState.mode == ChatMode.agent2UI 
        ? Icons.psychology 
        : chatState.mode == ChatMode.gemma
            ? Icons.smart_toy 
            : Icons.chat_bubble_outline,
  ),
  onPressed: () {
    // Cycle through modes: off -> gemma -> agent2ui
    final nextMode = switch (chatState.mode) {
      ChatMode.off => ChatMode.gemma,
      ChatMode.gemma => ChatMode.agent2ui,
      ChatMode.agent2ui => ChatMode.off,
    };
    ref.read(chatProvider.notifier).setMode(nextMode);
  },
),
```

- [ ] **Step 3: 添加 TTS 播报按钮**

在 `_LocalChatView` 的消息气泡旁添加 TTS 按钮:

```dart
// 在 MessageBubble 旁边添加 TTS 按钮
IconButton(
  icon: const Icon(Icons.volume_up),
  onPressed: () {
    ref.read(chatProvider.notifier).speakLastResponse();
  },
  tooltip: 'Speak response',
)
```

- [ ] **Step 4: Commit**

---

## Chunk 6: 验证和测试

- [ ] **Step 1: 确保 Gradle sync 成功**
- [ ] **Step 2: 确保 Flutter build 成功**
- [ ] **Step 3: 在设备上测试 Gemma 对话**
- [ ] **Step 4: 在设备上测试 TTS 语音输出**

---

## 注意事项

1. **Gemma 模型文件**: 需要从 HuggingFace 下载 `Gemma-4-E4B.litertlm` 放到设备
2. **权限申请**: 确保 AndroidManifest.xml 中有麦克风权限
3. **首次加载**: Gemma 初始化可能需要 10+ 秒，应显示 loading 状态
4. **TTS 语言**: 确保系统 TTS 支持中文

---

## 依赖文件

需要修改的文件列表:

| 文件 | 操作 |
|------|------|
| `android/app/build.gradle.kts` | 修改 |
| `pubspec.yaml` | 修改 |
| `android/app/src/main/kotlin/com/ibloc/shadow/gemma/GemmaEngine.kt` | 创建 |
| `android/app/src/main/kotlin/com/ibloc/shadow/gemma/ConversationManager.kt` | 创建 |
| `android/app/src/main/kotlin/com/ibloc/shadow/tts/TtsManager.kt` | 创建 |
| `android/app/src/main/kotlin/com/ibloc/shadow/MainActivity.kt` | 修改 |
| `lib/gemma_engine/gemma_engine.dart` | 创建 |
| `lib/gemma_engine/types.dart` | 创建 |
| `lib/tts_engine.dart` | 创建 |
| `lib/providers/chat_provider.dart` | 修改 |
| `lib/screens/chat_screen.dart` | 修改 |
