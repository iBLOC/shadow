# Phase 4: 本地模型推理实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现双端本地模型推理 - Mobile 使用 MNN OpenAI API 服务器，Desktop 使用 Candle-VLLM

**Architecture:** 
- Mobile: MNN App 提供本地 OpenAI 兼容 API → Flutter/Prefrontal 通过 HTTP 调用
- Desktop: Candle-VLLM Rust 集成 → Prefrontal LLM Provider 直接调用
- 魔搭社区: 复用 MNN 预转换模型，下载后直接使用

**Tech Stack:** Rust (candle-vllm, prefrontal-core), Flutter (MNN Engine), Kotlin (JNI)

---

## Chunk 1: MNN OpenAI API 服务器集成 (Mobile)

**Files:**
- Modify: `shadow-mobile/lib/mnn_engine.dart` - 更新接口
- Create: `shadow-mobile/lib/services/model_download_service.dart` - 模型下载服务
- Modify: `shadow-mobile/lib/model_manager.dart` - 模型管理增强
- Create: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadowmobile/MnnApiService.kt` - API 服务包装

- [ ] **Step 1: 创建模型下载服务**

```dart
// shadow-mobile/lib/services/model_download_service.dart
import 'dart:io';
import 'package:http/http.dart' as http;
import 'dart:convert';

class ModelDownloadService {
  static const String modelListUrl = 'http://30.7.194.163:8080/models.json';
  
  Future<List<ModelInfo>> fetchModelList() async {
    final response = await http.get(Uri.parse(modelListUrl));
    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((m) => ModelInfo.fromJson(m)).toList();
    }
    throw Exception('Failed to load model list');
  }
  
  Future<File> downloadModel(String url, String savePath, void Function(int, int)? onProgress) async {
    final request = http.Request('GET', Uri.parse(url));
    final response = await http.Client().send(request);
    final file = File(savePath);
    final sink = file.openWrite();
    int received = 0;
    final contentLength = response.contentLength ?? 0;
    await for (final chunk in response.stream) {
      sink.add(chunk);
      received += chunk.length;
      onProgress?.call(received, contentLength);
    }
    await sink.close();
    return file;
  }
}

class ModelInfo {
  final String name;
  final String url;
  final String modelName;
  final String vendor;
  final double sizeGb;
  final List<String> tags;
  final String modelId;
  
  factory ModelInfo.fromJson(Map<String, dynamic> json) => ModelInfo(
    name: json['name'],
    url: json['url'],
    modelName: json['modelName'],
    vendor: json['vendor'],
    sizeGb: (json['size_gb'] as num).toDouble(),
    tags: List<String>.from(json['tags']),
    modelId: json['modelId'],
  );
}
```

- [ ] **Step 2: 更新 MNN Engine 接口**

修改 `shadow-mobile/lib/mnn_engine.dart` 添加:
```dart
/// 启动本地 OpenAI API 服务器
static Future<bool> startApiServer({
  required String modelPath,
  int port = 8080,
  int threadNum = 4,
}) async {
  if (!isSupported) return false;
  try {
    final result = await _channel.invokeMethod<bool>('startApiServer', {
      'modelPath': modelPath,
      'port': port,
      'threadNum': threadNum,
    });
    return result ?? false;
  } on PlatformException catch (e) {
    debugPrint('Failed to start API server: ${e.message}');
    return false;
  }
}

/// 停止 API 服务器
static Future<bool> stopApiServer() async {
  if (!isSupported) return false;
  try {
    final result = await _channel.invokeMethod<bool>('stopApiServer');
    return result ?? false;
  } on PlatformException catch (e) {
    debugPrint('Failed to stop API server: ${e.message}');
    return false;
  }
}
```

- [ ] **Step 3: 创建 Android MnnApiService**

```kotlin
// shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadowmobile/MnnApiService.kt
package com.ibloc.shadowmobile

import android.content.Context
import com.alibaba.mnnllm.android.MNN
import com.alibaba.mnnllm.api.openai.service.ApiServiceCoordinator

class MnnApiService(private val context: Context) {
    private val coordinator = ApiServiceCoordinator(context)
    
    fun initialize(): Boolean = coordinator.initialize()
    
    fun startApiServer(modelPath: String, port: Int, threadNum: Int): Boolean {
        return coordinator.startServer(modelPath)
    }
    
    fun stopApiServer() {
        coordinator.stopServer()
    }
    
    fun isServerRunning(): Boolean = coordinator.isServerRunning
    
    fun getServerPort(): Int? = coordinator.getServerPort()
}
```

- [ ] **Step 4: 更新 MainActivity.kt 添加 API 服务方法**

在 MainActivity.kt 的平台通道中添加:
```kotlin
when (call.method) {
    "startApiServer" -> {
        val modelPath = call.argument<String>("modelPath") ?: ""
        val port = call.argument<Int>("port") ?: 8080
        val threadNum = call.argument<Int>("threadNum") ?: 4
        val result = mnnApiService.startApiServer(modelPath, port, threadNum)
        result.success(result)
    }
    "stopApiServer" -> {
        mnnApiService.stopApiServer()
        result.success(true)
    }
    // ... existing methods
}
```

- [ ] **Step 5: 验证编译**

```bash
cd /home/ibloc/Projects/shadow/shadow-mobile && flutter analyze
```

---

## Chunk 2: Candle-VLLM Rust 集成 (Desktop)

**Files:**
- Modify: `shadow-desktop/src-tauri/Cargo.toml` - 添加 candle-vllm 依赖
- Create: `shadow-desktop/src-tauri/src/candle_vllm.rs` - VLLM 封装
- Modify: `prefrontal/src/llm.rs` - 添加 VLLM Provider
- Modify: `prefrontal/src/client.rs` - 支持配置选择 Provider

- [ ] **Step 1: 添加 Cargo 依赖**

修改 `shadow-desktop/src-tauri/Cargo.toml`:
```toml
[dependencies]
candle-vllm = { git = "https://github.com/EricLBuehler/candle-vllm" }
```

- [ ] **Step 2: 创建 CandleVllm 模块**

```rust
// shadow-desktop/src-tauri/src/candle_vllm.rs
use candle_vllm::{Vllm, VllmOptions};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct CandleVllmEngine {
    engine: Arc<RwLock<Option<Vllm>>>,
    model_path: String,
}

impl CandleVllmEngine {
    pub fn new(model_path: String) -> Self {
        Self {
            engine: Arc::new(RwLock::new(None)),
            model_path,
        }
    }
    
    pub async fn load(&self) -> Result<(), String> {
        let options = VllmOptions::default()
            .with_model(&self.model_path);
        
        let vllm = Vllm::new(options)
            .map_err(|e| format!("Failed to load VLLM: {}", e))?;
        
        *self.engine.write().await = Some(vllm);
        Ok(())
    }
    
    pub async fn infer(&self, prompt: &str) -> Result<String, String> {
        let engine = self.engine.read().await;
        let engine = engine.as_ref()
            .ok_or_else(|| "Engine not loaded".to_string())?;
        
        let output = engine.run(prompt)
            .map_err(|e| format!("Inference failed: {}", e))?;
        
        Ok(output)
    }
    
    pub fn is_loaded(&self) -> bool {
        self.engine.try_read()
            .map(|g| g.is_some())
            .unwrap_or(false)
    }
}
```

- [ ] **Step 3: 在 Prefrontal 中添加 VllmProvider**

在 `prefrontal/src/llm.rs` 添加:
```rust
pub struct VllmProvider {
    engine: Arc<CandleVllmEngine>,
}

impl VllmProvider {
    pub fn new(model_path: String) -> Self {
        Self {
            engine: Arc::new(CandleVllmEngine::new(model_path)),
        }
    }
}

#[async_trait]
impl LlmProvider for VllmProvider {
    fn name(&self) -> &str {
        "candle-vllm"
    }
    
    async fn chat(&self, request: LlmRequest) -> Result<LlmResponse> {
        let prompt = request.messages.iter()
            .filter_map(|m| m.content.clone())
            .collect::<Vec<_>>()
            .join("\n");
        
        let output = self.engine.infer(&prompt).await?;
        
        Ok(LlmResponse {
            id: "candle".to_string(),
            choices: vec![LlmChoice {
                message: LlmMessage {
                    role: "assistant".to_string(),
                    content: Some(output),
                    tool_calls: vec![],
                    tool_call_id: None,
                },
                finish_reason: "stop".to_string(),
            }],
            usage: LlmUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        })
    }
}
```

- [ ] **Step 4: 更新 PrefrontalConfig 支持 provider 选择**

修改 `prefrontal/src/client.rs`:
```rust
#[derive(Debug, Clone, Deserialize)]
pub struct PrefrontalConfig {
    pub llm_provider: String,  // "openai" | "anthropic" | "candle-vllm"
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub max_tokens: Option<usize>,
    pub temperature: Option<f32>,
    pub local_model_path: Option<String>,  // For candle-vllm
}
```

- [ ] **Step 5: 验证编译**

```bash
cd /home/ibloc/Projects/prefrontal && cargo check
cd /home/ibloc/Projects/shadow/shadow-desktop && cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Chunk 3: 模型管理界面增强

**Files:**
- Modify: `shadow-mobile/lib/screens/model_management_screen.dart` - 添加下载功能
- Modify: `shadow-mobile/lib/providers/chat_provider.dart` - 集成 API 服务器
- Create: `shadow-desktop/src/pages/ModelsPage.tsx` - Desktop 模型管理

- [ ] **Step 1: Mobile 模型下载 UI**

修改 `shadow-mobile/lib/screens/model_management_screen.dart`:
```dart
class ModelDownloadDialog extends StatefulWidget {
  final ModelInfo model;
  
  @override
  State<ModelDownloadDialog> createState() => _ModelDownloadDialogState();
}

class _ModelDownloadDialogState extends State<ModelDownloadDialog> {
  double _progress = 0;
  bool _downloading = false;
  
  Future<void> _startDownload() async {
    setState(() => _downloading = true);
    final downloadService = ModelDownloadService();
    final savePath = '${applicationDocumentsDirectory}/models/${widget.model.modelName}';
    
    await downloadService.downloadModel(
      widget.model.url,
      savePath,
      (received, total) {
        setState(() {
          _progress = received / total;
        });
      },
    );
    
    setState(() => _downloading = false);
  }
}
```

- [ ] **Step 2: Mobile Chat Provider 集成 API 服务器**

修改 `shadow-mobile/lib/providers/chat_provider.dart`:
```dart
class ChatProvider extends StateNotifier<ChatState> {
  Future<void> initialize() async {
    // Try to start MNN API server if model is loaded
    final modelPath = '${applicationDocumentsDirectory}/models/selected';
    final started = await MNNEngine.startApiServer(
      modelPath: modelPath,
      port: 8080,
    );
    
    if (started) {
      // Configure Prefrontal to use local API
      // Update state accordingly
    }
  }
}
```

- [ ] **Step 3: Desktop 模型管理页面增强**

修改 `shadow-desktop/src/pages/ModelsPage.tsx`:
```tsx
export function ModelsPage() {
  const { t } = useTranslation();
  const [models, setModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadLocalModels();
  }, []);
  
  const loadLocalModels = async () => {
    setLoading(true);
    try {
      const result = await invoke<string[]>('list_local_models');
      setModels(result.map(path => ({ path, name: path.split('/').pop() })));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('models.title')}</h1>
      </header>
      <div className="models-grid">
        {models.map(model => (
          <ModelCard key={model.path} model={model} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 验证编译**

```bash
cd /home/ibloc/Projects/shadow/shadow-mobile && flutter analyze
cd /home/ibloc/Projects/shadow/shadow-desktop && pnpm tsc --noEmit
```

---

## Chunk 4: 魔搭社区集成 (使用 MNN 预转换模型)

**Files:**
- Modify: `shadow-mobile/lib/services/model_download_service.dart` - 使用 MNN 模型列表
- Create: `shadow-mobile/lib/model_config.dart` - 模型配置

- [ ] **Step 1: 使用 MNN 模型列表**

MNN 使用预转换模型，URL: `http://30.7.194.163:8080/models.json`

```dart
// shadow-mobile/lib/services/model_download_service.dart
class MnnModelSource {
  static const String baseUrl = 'http://30.7.194.163:8080';
  
  Future<List<MnnModelInfo>> getAvailableModels() async {
    final response = await http.get(Uri.parse('$baseUrl/models.json'));
    if (response.statusCode == 200) {
      return parseMnnModels(response.body);
    }
    throw Exception('Failed to fetch MNN models');
  }
  
  List<MnnModelInfo> parseMnnModels(String jsonString) {
    final data = json.decode(jsonString);
    final models = data['models'] as List;
    return models.map((m) => MnnModelInfo(
      name: m['name'],
      url: m['url'],
      modelName: m['modelName'],
      vendor: m['vendor'],
      sizeGb: m['size_gb'].toDouble(),
      tags: List<String>.from(m['tags']),
      categories: List<String>.from(m['categories']),
      modelId: m['modelId'],
    )).toList();
  }
}
```

- [ ] **Step 2: 创建模型配置**

```dart
// shadow-mobile/lib/model_config.dart
class ModelConfig {
  final String id;
  final String name;
  final ModelSource source;
  final ModelBackend backend;
  final int contextLength;
  final List<String> capabilities;
  
  bool get isLocal => source == ModelSource.local;
  bool get supportsVision => capabilities.contains('vision');
  bool get supportsAudio => capabilities.contains('audio');
}

enum ModelSource { local, cloud, mnn }
enum ModelBackend { mnn, candle, openai, anthropic }
```

- [ ] **Step 3: 验证编译**

```bash
cd /home/ibloc/Projects/shadow/shadow-mobile && flutter analyze
```

---

## 验证步骤

1. **Mobile MNN**:
   - 运行 `flutter run` 在 Android 设备
   - 调用 `MNNEngine.startApiServer()` 启动 API 服务器
   - 验证 `curl http://localhost:8080/v1/models` 返回模型列表

2. **Desktop Candle**:
   - 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
   - 下载 Qwen 模型权重
   - 验证推理输出

3. **模型下载**:
   - 测试 `ModelDownloadService.downloadModel()`
   - 验证模型文件正确解压

## 后续

- Phase 4 完成后，可选优化:
  - 模型热加载/切换
  - 推理性能优化
  - 缓存管理
