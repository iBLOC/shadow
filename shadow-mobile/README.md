# Prefrontal 前额叶

> 移动端本地大语言模型应用 | MNN 推理引擎 | MCP Skill 管理

## 项目简介

Prefrontal（前额叶）是一款面向移动端的本地大语言模型应用，基于 **MNN** 深度学习推理框架开发，旨在为用户提供完全本地化、隐私优先的 AI 对话体验。

### 核心特性

- **本地 LLM 推理**: 基于 MNN-LLM 引擎，支持在移动设备本地运行大语言模型，无需网络连接
- **多模态支持**: 文本对话、图像理解、语音处理（规划中）
- **MCP Skill 管理**: 内置 MCP（Model Context Protocol）Skill 框架，支持扩展 AI 能力
- **隐私优先**: 所有数据本地处理，确保用户隐私安全
- **高性能**: 充分利用移动端 CPU/GPU 算力，针对 ARM 架构深度优化

## 技术架构

```
┌─────────────────────────────────────────────┐
│                 Flutter UI                   │
│  (Dart / Riverpod / GoRouter)              │
├─────────────────────────────────────────────┤
│              Platform Channel                │
├─────────────────────────────────────────────┤
│              MNN-LLM Engine                 │
│  ┌─────────────────────────────────────┐   │
│  │  LLM 推理 │ Vision │ Audio │ Diffu  │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│           Native Backend (C++)              │
│  CPU / OpenCL / Metal / NPU                 │
└─────────────────────────────────────────────┘
```

## MNN Android LLM 集成方案评估

### 方案概述

经过对 [MNN](https://github.com/alibaba/MNN) 源码库的调研，确定以下 Android 平台 LLM 部署方案：

### 1. MNN-LLM 能力

| 能力 | 支持情况 |
|------|----------|
| 文本生成 | ✅ 支持 |
| 视觉理解 (VLM) | ✅ 支持 |
| 语音识别/生成 | ✅ 支持 |
| 图像生成 (Diffusion) | ✅ 支持 |

### 2. 性能基准

- **CPU 推理**: 比 llama.cpp 快 **8.6x** (prefill)，**2.3x** (decode)
- **模型支持**: Qwen, Gemma, Llama, Baichuan, Yi, DeepSeek, InternLM, Phi, Smolm 等
- **量化支持**: 4bit / 8bit 量化，AWQ、HQQ、GPTQ 算法

### 3. Android 编译配置

```bash
cd project/android
mkdir build_64 && cd build_64
../build_64.sh \
  -DMNN_BUILD_LLM=true \
  -DMNN_LOW_MEMORY=true \
  -DMNN_CPU_WEIGHT_DEQUANT_GEMM=true \
  -DMNN_SUPPORT_TRANSFORMER_FUSE=true \
  -DMNN_ARM82=true \
  -DMNN_OPENCL=true \
  -DLLM_SUPPORT_VISION=true \
  -DLLM_SUPPORT_AUDIO=true \
  -DMNN_BUILD_DIFFUSION=ON
```

### 4. Flutter 集成路径

由于 MNN 主要面向 Native 开发，Flutter 集成需要通过以下方式：

1. **Platform Channel**: 使用 MethodChannel 与原生 Android/iOS 通信
2. **JNI 封装**: 将 MNN C++ 库封装为 Kotlin/Swift 接口
3. **模型加载**: 通过 assets 或文件系统加载 .mnn 模型文件

### 5. 推荐的模型

| 模型 | 参数 | 场景 |
|------|------|------|
| Qwen2.5-0.5B | 0.5B | 入门级设备 |
| Qwen2.5-1.5B | 1.5B | 主流设备 |
| Qwen2.5-3B | 3B | 高端设备 |
| DeepSeek-R1 | 1.5B+ | 推理任务 |

## 快速开始

### 环境要求

- Flutter SDK >= 3.47.0（Dart SDK >= 3.13.0）
- Android SDK (API 24+)
BP|

### 设置 MNN 库路径

项目需要指向 MNN 编译后的库。有两种方式：

1. **设置环境变量**（推荐）：
```bash
export MNN_ROOT=/path/to/MNN
```

2. **修改 CMakeLists.txt**：`android/app/src/main/cpp/CMakeLists.txt`
```

### 模型部署

1. 从 ModelScope 或 HuggingFace 下载 MNN 格式模型
2. 将模型文件放置到 `assets/models/` 目录
3. 配置文件 `config.json` 设置推理参数

## 项目结构

```
prefrontal-flutter/
├── lib/
│   ├── main.dart              # 应用入口
│   ├── app/                   # 应用配置
│   ├── features/              # 功能模块
│   │   ├── chat/              # 对话功能
│   │   ├── skills/            # MCP Skill 管理
│   │   └── settings/          # 设置功能
│   ├── core/                  # 核心组件
│   │   ├── mnn/               # MNN 引擎封装
│   │   └── storage/           # 本地存储
│   └── shared/                # 共享组件
├── android/                   # Android 原生代码
│   └── app/src/main/java/
│       └── com/prefrontal/    # JNI 封装
└── assets/
    └── models/               # LLM 模型文件
```

## Roadmap

- [x] 完成 MNN 引擎的 Flutter 封装
- [x] 实现基础文本对话功能
- [ ] 添加 MCP Skill 框架
- [ ] 集成视觉理解能力
- [ ] 优化性能与内存占用

## 参考资源

- [MNN 官方仓库](https://github.com/alibaba/MNN)
- [MNN-LLM 文档](https://mnn-docs.readthedocs.io/en/latest/transformers/llm.html)
- [MnnLlmChat Android Demo](https://github.com/alibaba/MNN/tree/master/apps/Android/MnnLlmChat)
- [ModelScope MNN 模型](https://modelscope.cn/organization/MNN)

## License

Apache License 2.0
