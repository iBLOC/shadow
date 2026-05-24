# ML Kit GenAI Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LiteRT direct API with ML Kit GenAI Prompt API for on-device LLM inference.

**Architecture:** Kotlin Platform Channel layer uses ML Kit's GenerativeModel API which automatically handles model download/management via Google Play Services. Flutter layer retains multi-agent architecture but simplified to ML Kit model selection. HuggingFace download logic is removed.

**Tech Stack:** ML Kit GenAI Prompt API (`com.google.mlkit:genai-prompt:1.0.0-beta2`), Kotlin Coroutines, Flutter Riverpod

---

## File Changes Overview

| File | Action |
|------|--------|
| `android/app/build.gradle.kts` | Modify: Add ML Kit dependency, remove LiteRT AAR |
| `android/app/src/main/kotlin/.../LitertEngine.kt` | Rewrite: Use ML Kit API |
| `android/app/src/main/kotlin/.../MainActivity.kt` | Modify: Update channel setup |
| `lib/litert_model.dart` | Modify: Simplify to ML Kit models |
| `lib/litert_engine.dart` | Rewrite: ML Kit via Platform Channel |
| `lib/services/model_download_service.dart` | Modify: Remove HuggingFace download |
| `lib/providers/chat_provider.dart` | Modify: Adapt to new API |

---

## Chunk 1: ML Kit Dependency & Build Configuration

**Files:**
- Modify: `shadow-mobile/android/app/build.gradle.kts`

- [ ] **Step 1: Update build.gradle.kts**

```kotlin
dependencies {
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta2")
}
```

Remove:
```kotlin
implementation("com.google.ai.edge.litertlm:litertlm-android:0.11.0")
```

- [ ] **Step 2: Verify build**

Run: `flutter build apk --debug`
Expected: BUILD SUCCESSFUL

---

## Chunk 2: Rewrite LitertEngine.kt with ML Kit API

**Files:**
- Rewrite: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/litert/LitertEngine.kt`

- [ ] **Step 1: Write new LitertEngine.kt using ML Kit API**

```kotlin
package com.ibloc.shadow.litert

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LitertEngine(private val context: Context) {
    private var generativeModel: GenerativeModel? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _downloadProgress = MutableStateFlow<Pair<Long, Long>?>(null)
    val downloadProgress: StateFlow<Pair<Long, Long>?> = _downloadProgress

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError

    private val _responseText = MutableStateFlow("")
    val responseText: StateFlow<String> = _responseText

    private var isStreaming = false

    suspend fun initialize(
        modelName: String = "gemma-4-it-4b",
        releaseStage: ModelReleaseStage = ModelReleaseStage.STABLE,
        preference: ModelPreference = ModelPreference.FAST
    ): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        _lastError.value = null

        try {
            val modelConfig = modelConfig {
                this.releaseStage = releaseStage
                this.preference = preference
            }

            val generationConfig = generationConfig {
                temperature = 1.0f
                topK = 4
            }

            generativeModel = Generation.getClient(modelConfig)
                .generativeModel(modelName, generationConfig)

            checkAndDownloadModel()
            return _isInitialized.value
        } catch (e: Exception) {
            Log.e("LitertEngine", "Initialization failed", e)
            _lastError.value = e.message
            _isLoading.value = false
            return false
        }
    }

    private suspend fun checkAndDownloadModel() {
        val model = generativeModel ?: return

        try {
            val status = model.checkStatus()
            when (status) {
                FeatureStatus.AVAILABLE -> {
                    model.warmup()
                    _isInitialized.value = true
                    _isLoading.value = false
                    Log.d("LitertEngine", "Model is available and ready")
                }
                FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING -> {
                    Log.d("LitertEngine", "Model needs download, starting download...")
                    model.download().collect { downloadStatus ->
                        when (downloadStatus) {
                            is DownloadStatus.DownloadStarted -> {
                                _downloadProgress.value = Pair(0L, downloadStatus.bytesToDownload)
                            }
                            is DownloadStatus.DownloadProgress -> {
                                _downloadProgress.value = Pair(
                                    downloadStatus.totalBytesDownloaded,
                                    downloadStatus.bytesToDownload
                                )
                            }
                            is DownloadStatus.DownloadCompleted -> {
                                _downloadProgress.value = null
                                model.warmup()
                                _isInitialized.value = true
                                _isLoading.value = false
                                Log.d("LitertEngine", "Model download completed")
                            }
                            is DownloadStatus.DownloadFailed -> {
                                _lastError.value = downloadStatus.e.message
                                _isLoading.value = false
                                Log.e("LitertEngine", "Download failed", downloadStatus.e)
                            }
                        }
                    }
                }
                FeatureStatus.UNAVAILABLE -> {
                    _lastError.value = "Model is unavailable on this device"
                    _isLoading.value = false
                }
                else -> {
                    _lastError.value = "Unknown model status: $status"
                    _isLoading.value = false
                }
            }
        } catch (e: Exception) {
            Log.e("LitertEngine", "Check/download failed", e)
            _lastError.value = e.message
            _isLoading.value = false
        }
    }

    suspend fun generateContentStream(prompt: String, image: Bitmap? = null) {
        if (!_isInitialized.value || generativeModel == null) {
            _lastError.value = "Model not initialized"
            return
        }

        if (isStreaming) {
            _lastError.value = "Already generating"
            return
        }

        isStreaming = true
        _responseText.value = ""

        try {
            val request = if (image != null) {
                generateContentRequest(
                    ImagePart(image),
                    TextPart(prompt)
                )
            } else {
                generateContentRequest(TextPart(prompt))
            }

            val flow = generativeModel!!.generateContentStream(request)

            flow.collect { response ->
                val text = response.candidates.firstOrNull()?.text ?: ""
                _responseText.value += text
            }
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
        } finally {
            isStreaming = false
        }
    }

    suspend fun generateContent(prompt: String, image: Bitmap? = null): String {
        if (!_isInitialized.value || generativeModel == null) {
            _lastError.value = "Model not initialized"
            return ""
        }

        try {
            val request = if (image != null) {
                generateContentRequest(
                    ImagePart(image),
                    TextPart(prompt)
                )
            } else {
                generateContentRequest(TextPart(prompt))
            }

            val response = generativeModel!!.generateContent(request)
            return response.candidates.firstOrNull()?.text ?: ""
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
            return ""
        }
    }

    fun release() {
        try {
            generativeModel?.close()
        } catch (_: Exception) {}
        generativeModel = null
        _isInitialized.value = false
        _isLoading.value = false
        _downloadProgress.value = null
        _responseText.value = ""
    }
}
```

- [ ] **Step 2: Run flutter analyze**

Run: `flutter analyze`
Expected: 0 errors

---

## Chunk 3: Update MainActivity.kt Channel Setup

**Files:**
- Modify: `shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/MainActivity.kt`

- [ ] **Step 1: Update setupLitertChannel for ML Kit**

Replace the existing `setupLitertChannel` method:

```kotlin
private fun setupLitertChannel(flutterEngine: FlutterEngine) {
    litertEngine = LitertEngine(this)

    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, LITERT_CHANNEL).setMethodCallHandler { call, result ->
        when (call.method) {
            "initialize" -> {
                val modelName = call.argument<String>("modelName") ?: "gemma-4-it-4b"
                val releaseStageStr = call.argument<String>("releaseStage") ?: "STABLE"
                val preferenceStr = call.argument<String>("preference") ?: "FAST"

                val releaseStage = when (releaseStageStr) {
                    "PREVIEW" -> ModelReleaseStage.PREVIEW
                    else -> ModelReleaseStage.STABLE
                }
                val preference = when (preferenceStr) {
                    "FULL" -> ModelPreference.FULL
                    else -> ModelPreference.FAST
                }

                scope.launch {
                    try {
                        val success = litertEngine?.initialize(modelName, releaseStage, preference) ?: false
                        result.success(success)
                    } catch (e: Exception) {
                        result.error("INIT_ERROR", e.message, null)
                    }
                }
            }
            "generateContent" -> {
                val prompt = call.argument<String>("prompt") ?: ""
                scope.launch {
                    try {
                        val response = litertEngine?.generateContent(prompt) ?: ""
                        result.success(response)
                    } catch (e: Exception) {
                        result.error("GEN_ERROR", e.message, null)
                    }
                }
            }
            "generateContentStream" -> {
                val prompt = call.argument<String>("prompt") ?: ""
                scope.launch {
                    try {
                        litertEngine?.generateContentStream(prompt)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("GEN_ERROR", e.message, null)
                    }
                }
            }
            "getResponseText" -> {
                result.success(litertEngine?.responseText?.value ?: "")
            }
            "isInitialized" -> {
                result.success(litertEngine?.isInitialized?.value ?: false)
            }
            "isLoading" -> {
                result.success(litertEngine?.isLoading?.value ?: false)
            }
            "getDownloadProgress" -> {
                val progress = litertEngine?.downloadProgress?.value
                result.success(progress?.let { mapOf("downloaded" to it.first, "total" to it.second) })
            }
            "getLastError" -> {
                result.success(litertEngine?.lastError?.value)
            }
            "release" -> {
                litertEngine?.release()
                result.success(true)
            }
            else -> result.notImplemented()
        }
    }
}
```

- [ ] **Step 2: Add ML Kit import**

```kotlin
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.ModelPreference
```

- [ ] **Step 3: Run flutter analyze**

Run: `flutter analyze`
Expected: 0 errors

---

## Chunk 4: Update Flutter litert_model.dart

**Files:**
- Modify: `shadow-mobile/lib/litert_model.dart`

- [ ] **Step 1: Simplify LiteRTModel for ML Kit**

Replace the model definitions to be simpler (no HuggingFace URLs needed):

```dart
class LiteRTModel {
  final String id;
  final String name;  // ML Kit model name
  final String displayName;
  final int minMemoryGb;
  final String description;
  final bool supportImage;
  final ModelReleaseStage releaseStage;
  final ModelPreference preference;

  const LiteRTModel({
    required this.id,
    required this.name,
    required this.displayName,
    required this.minMemoryGb,
    required this.description,
    required this.supportImage,
    required this.releaseStage,
    required this.preference,
  });
}

enum ModelReleaseStage { stable, preview }

enum ModelPreference { fast, full }

class LiteRTModels {
  static const gemma4E4B = LiteRTModel(
    id: 'gemma4-e4b',
    name: 'gemma-4-it-4b',
    displayName: 'Gemma-4-E4B',
    minMemoryGb: 12,
    description: 'Gemma 4 4B parameters, supports image input',
    supportImage: true,
    releaseStage: ModelReleaseStage.stable,
    preference: ModelPreference.fast,
  );

  static const gemma3_1B = LiteRTModel(
    id: 'gemma3-1b',
    name: 'gemma-3n-e4b',
    displayName: 'Gemma-3-1B',
    minMemoryGb: 6,
    description: 'Gemma 3 1B, lightweight for mobile devices',
    supportImage: false,
    releaseStage: ModelReleaseStage.stable,
    preference: ModelPreference.fast,
  );

  static List<LiteRTModel> get allModels => [gemma4E4B, gemma3_1B];

  static LiteRTModel? getById(String id) {
    try {
      return allModels.firstWhere((m) => m.id == id);
    } catch (_) {
      return null;
    }
  }

  static LiteRTModel get defaultModel => gemma4E4B;
}
```

- [ ] **Step 2: Keep Agent classes unchanged** (they don't need HuggingFace info)

---

## Chunk 5: Update Flutter litert_engine.dart

**Files:**
- Rewrite: `shadow-mobile/lib/litert_engine.dart`

- [ ] **Step 1: Update to use ML Kit via Platform Channel**

```dart
import 'dart:io';
import 'package:flutter/services.dart';
import 'litert_model.dart';

class LitertEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/litert');

  LiteRTModel _currentModel = LiteRTModels.defaultModel;
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  String? _lastError;
  String? get lastError => _lastError;

  String _responseText = "";
  String get responseText => _responseText;

  LiteRTModel get currentModel => _currentModel;

  void setModel(LiteRTModel model) {
    _currentModel = model;
  }

  Future<bool> initialize() async {
    try {
      final result = await _channel.invokeMethod<bool>('initialize', {
        'modelName': _currentModel.name,
        'releaseStage': _currentModel.releaseStage == ModelReleaseStage.preview
            ? 'PREVIEW'
            : 'STABLE',
        'preference': _currentModel.preference == ModelPreference.full
            ? 'FULL'
            : 'FAST',
      });

      _isInitialized = result ?? false;
      if (!_isInitialized) {
        _lastError = await _channel.invokeMethod<String>('getLastError');
      }
      return _isInitialized;
    } catch (e) {
      _lastError = e.toString();
      _isInitialized = false;
      return false;
    }
  }

  Future<String> generateContent(String prompt) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      final result = await _channel.invokeMethod<String>('generateContent', {
        'prompt': prompt,
      });
      return result ?? '';
    } catch (e) {
      throw Exception('Failed to generate content: $e');
    }
  }

  Future<void> generateContentStream(String prompt) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      await _channel.invokeMethod<bool>('generateContentStream', {
        'prompt': prompt,
      });
    } catch (e) {
      throw Exception('Failed to generate content stream: $e');
    }
  }

  Future<String?> getResponseText() async {
    try {
      return await _channel.invokeMethod<String>('getResponseText');
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, int>?> getDownloadProgress() async {
    try {
      final result = await _channel.invokeMethod<Map>('getDownloadProgress');
      if (result == null) return null;
      return {
        'downloaded': (result['downloaded'] as num?)?.toInt() ?? 0,
        'total': (result['total'] as num?)?.toInt() ?? 0,
      };
    } catch (e) {
      return null;
    }
  }

  Future<bool> release() async {
    try {
      await _channel.invokeMethod<bool>('release');
      _isInitialized = false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
```

---

## Chunk 6: Update model_download_service.dart

**Files:**
- Modify: `shadow-mobile/lib/services/model_download_service.dart`

- [ ] **Step 1: Remove HuggingFace download logic, keep network utilities**

Simplify to remove model download (ML Kit handles this), keep:
- Network type detection
- WiFi/mobile check utilities

```dart
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';

enum NetworkType { wifi, mobile, unknown }

class NetworkUtils {
  static Future<NetworkType> getNetworkType() async {
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity.contains(ConnectivityResult.wifi)) {
      return NetworkType.wifi;
    } else if (connectivity.contains(ConnectivityResult.mobile)) {
      return NetworkType.mobile;
    }
    return NetworkType.unknown;
  }

  static Future<bool> isWifi() async {
    return await getNetworkType() == NetworkType.wifi;
  }

  static Stream<List<ConnectivityResult>> watchConnectivity() {
    return Connectivity().onConnectivityChanged;
  }
}
```

---

## Chunk 7: Verify Build

- [ ] **Step 1: Run flutter build apk --debug**

Run: `flutter build apk --debug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Check APK contents**

Run: `unzip -l build/app/outputs/flutter-apk/app-debug.apk | grep -E "mlkit|genai"`
Expected: Should show ML Kit libraries

---

## Chunk 8: Update Chat Provider (Minimal)

**Files:**
- Modify: `shadow-mobile/lib/providers/chat_provider.dart`

- [ ] **Step 1: Update to use new LitertEngine API**

Change from:
```dart
final litertEngine = LitertEngine();
await litertEngine.initialize(modelPath: path);
```

To:
```dart
final litertEngine = LitertEngine();
litertEngine.setModel(agent.model);
await litertEngine.initialize();
```

---

## Verification Checklist

- [ ] `flutter analyze` passes with 0 errors
- [ ] `flutter build apk --debug` succeeds
- [ ] APK contains ML Kit libraries
- [ ] App doesn't crash on startup
- [ ] Model initialization works (may require device with Play Services)
