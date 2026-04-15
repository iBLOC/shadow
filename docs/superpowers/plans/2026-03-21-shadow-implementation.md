# Shadow 系统实现计划

**版本：** 1.0
**日期：** 2026-03-21
**项目：** Shadow (影) - AI 用户分身系统

---

## 概述

本计划描述了 Shadow 系统的实现路径，从核心连接能力到完整的双端实现。

## 实现阶段

### Phase 1: 核心连接 (MVP) — 预计 2-3 周

**目标：** 建立 Shadow 与 Resonance 的基础连接能力

#### 1.1 mDNS 服务发现
- [ ] 在 Resonance 中实现 `_shadow._tcp` mDNS 服务广播
- [ ] 在 Shadow-Desktop 中实现 mDNS 服务发现
- [ ] 在 Shadow-Mobile 中实现 mDNS 服务发现
- [ ] 单元测试：服务发现成功

#### 1.2 mTLS 双向认证
- [ ] 设计 CA 证书体系
- [ ] 在 Resonance 中实现证书签发端点
- [ ] 在 Shadow 中实现证书请求和存储
- [ ] 实现 TLS 连接建立和双向验证
- [ ] 单元测试：mTLS 握手成功

#### 1.3 A2A 协议基础
- [ ] 定义 A2A 消息格式 (JSON Schema)
- [ ] 在 Shadow 中实现能力注册消息
- [ ] 在 Resonance 中实现能力接收和存储
- [ ] 单元测试：能力注册成功

#### 1.4 WebSocket 任务推送
- [ ] 在 Resonance 中实现 WebSocket 端点
- [ ] 在 Shadow 中实现 WebSocket 客户端
- [ ] 实现任务推送消息格式
- [ ] 实现任务响应消息格式
- [ ] 集成测试：完整任务推送流程

**交付物：** Shadow 能够连接到 Resonance 并接收任务

---

### Phase 2: Prefrontal 集成 — 预计 2 周

**目标：** 将 Prefrontal 作为 Shadow 的任务执行引擎

#### 2.1 Prefrontal Rust 库集成
- [ ] 将 Prefrontal 打包为可复用 Rust crate
- [ ] 在 Shadow-Desktop 中通过 Cargo 依赖集成
- [ ] 在 Shadow-Mobile 中通过 Platform Channel 调用
- [ ] 验证：Prefrontal 任务执行成功

#### 2.2 Hippocampus 记忆集成
- [ ] 实现 Hippocampus HTTP 客户端
- [ ] 在 Prefrontal 中集成 MemoryBackend trait
- [ ] 实现任务执行过程中的记忆存储
- [ ] 验证：记忆存储和检索成功

#### 2.3 会话管理
- [ ] 实现 Shadow 会话创建和销毁
- [ ] 实现 Prefrontal 会话与 Shadow 会话的映射
- [ ] 实现会话历史查询
- [ ] 验证：多会话并发执行

**交付物：** Shadow 能够执行任务并存储记忆

---

### Phase 3: 双端 UI 基础 — 预计 3 周

**目标：** 建立双端的基础 UI 和 Agent2UI 框架

#### 3.1 Shadow-Desktop UI
- [ ] 设计并实现 Shadow Dashboard
- [ ] 实现任务列表和状态展示
- [ ] 实现模型配置界面
- [ ] 实现设置页面 (Resonance 连接、证书)
- [ ] 验证：UI 与 Prefrontal/Hippocampus 正确通信

#### 3.2 Shadow-Mobile UI
- [ ] 设计并实现 Shadow Dashboard
- [ ] 实现任务列表和状态展示
- [ ] 实现模型配置界面
- [ ] 实现设置页面
- [ ] 验证：UI 与 Prefrontal/Hippocampus 正确通信

#### 3.3 CopilotKit 集成 (Desktop)
- [ ] 研究 CopilotKit 集成方案
- [ ] 实现 CopilotKit Panel 组件
- [ ] 实现 CopilotKit 与 Prefrontal 的桥接
- [ ] 实现自然语言任务输入
- [ ] 验证：对话式任务创建成功

#### 3.4 flutter_genui 集成 (Mobile)
- [ ] 研究 flutter_genui 集成方案
- [ ] 实现 flutter_genui 对话组件
- [ ] 实现与 Prefrontal 的桥接
- [ ] 实现自然语言任务输入
- [ ] 验证：对话式任务创建成功

**交付物：** 双端都有可用的基础 UI 和 Agent2UI

---

### Phase 4: 本地模型推理 — 预计 3-4 周

**目标：** 实现 MNN 和 candle-vllm 本地推理

#### 4.1 Candle-VLLM 集成 (Desktop)
- [ ] 研究 candle-vllm 架构和 API
- [ ] 设计 Rust 集成层
- [ ] 实现模型加载和推理接口
- [ ] 与 Prefrontal LLM Provider 集成
- [ ] 实现模型热加载和切换
- [ ] 验证：本地模型推理成功

#### 4.2 MNN 集成 (Mobile)
- [ ] 完成 MNN JNI 桥接 (现有 stub 的生产实现)
- [ ] 实现 MNN 模型加载和推理
- [ ] 实现 OpenAI 兼容 API 服务器
- [ ] 与 Prefrontal HTTP 客户端集成
- [ ] 验证：MNN 本地推理成功

#### 4.3 魔搭社区下载
- [ ] 研究魔搭社区 API
- [ ] 实现模型搜索和下载功能
- [ ] 实现 MNN/candle 模型格式转换
- [ ] 集成到模型管理界面
- [ ] 验证：成功下载并运行模型

**交付物：** 双端都能运行本地模型

---

### Phase 5: 自动化操作 — 预计 2 周

**目标：** 实现 Agent2UI 的自动化操作能力

#### 5.1 Android 无障碍服务 (Mobile)
- [ ] 完善 PrefrontalAccessibilityService
- [ ] 实现手势派发 (点击、滑动、输入)
- [ ] 实现基于文本的节点查找和操作
- [ ] 与 flutter_genui 自动化接口集成
- [ ] 验证：成功自动化操作 App

#### 5.2 CopilotKit 自动化 (Desktop)
- [ ] 研究 CopilotKit 自动化 API
- [ ] 实现桌面自动化能力
- [ ] 与 CopilotKit Agent2UI 集成
- [ ] 验证：成功自动化桌面操作

**交付物：** Agent 能够自动化操作设备和应用

---

### Phase 6: 模型评分同步 — 预计 1 周

**目标：** 实现 Resonance Benchmark 评分同步

#### 6.1 Benchmark 服务
- [ ] 在 Resonance 中实现模型 Benchmark 逻辑
- [ ] 实现评分更新 WebSocket 推送
- [ ] 实现历史评分查询 API

#### 6.2 Shadow 评分处理
- [ ] 实现评分消息接收和缓存
- [ ] 实现评分展示界面
- [ ] 实现基于评分的模型自动选择
- [ ] 验证：评分同步和显示成功

**交付物：** Shadow 始终拥有最新的模型评分

---

## 依赖关系

```
Phase 1 (核心连接)
    │
    ├── 1.1 mDNS 发现
    ├── 1.2 mTLS 认证
    ├── 1.3 A2A 协议
    └── 1.4 WebSocket 推送
            │
            ▼
Phase 2 (Prefrontal 集成)
    ├── 2.1 Prefrontal 库集成
    ├── 2.2 Hippocampus 记忆
    └── 2.3 会话管理
            │
            ▼
Phase 3 (双端 UI)
    ├── 3.1 Desktop UI
    ├── 3.2 Mobile UI
    ├── 3.3 CopilotKit (Desktop)
    └── 3.4 flutter_genui (Mobile)
            │
            ├────────────────────┐
            ▼                      ▼
Phase 4 (本地推理)         Phase 6 (评分同步)
    ├── 4.1 Candle-VLLM             6.1 Benchmark 服务
    ├── 4.2 MNN                     6.2 评分处理
    └── 4.3 魔搭下载
            │
            ▼
Phase 5 (自动化)
    ├── 5.1 Android 无障碍
    └── 5.2 CopilotKit 自动化
```

## 优先级建议

### 建议顺序

1. **Phase 1 + Phase 2** (MVP)：建立核心连接和执行能力
2. **Phase 3** (UI)：提供用户交互界面
3. **Phase 4** (本地推理)：减少对云端依赖
4. **Phase 5** (自动化)：扩展 Agent 能力
5. **Phase 6** (评分同步)：优化模型选择

### 资源分配建议

| 角色 | Phase 1-2 | Phase 3 | Phase 4 | Phase 5-6 |
|------|-----------|---------|---------|-----------|
| 后端 (Rust) | 核心连接 | Prefrontal | Candle-VLLM | 自动化 |
| 移动端 (Flutter) | mDNS | UI | MNN | flutter_genui |
| 桌面端 (React) | mDNS | UI | 集成 | CopilotKit |
| 系统/DevOps | mTLS 证书 | - | 模型下载 | - |

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| MNN 集成复杂度高 | 高 | 使用现有 stub，逐步替换为真实实现 |
| CopilotKit 不适合需求 | 中 | Phase 3 前先做 POC 验证 |
| mTLS 证书管理复杂 | 中 | 使用现有 PKI 工具 (mkcert, step-ca) |
| 性能问题 (本地推理) | 中 | 明确模型规格要求，选择合适模型大小 |

## 下一步

1. **Phase 1 启动**：从 mDNS 服务发现开始
2. **并行工作**：Resonance mDNS 广播和 Shadow 发现客户端可以并行开发
3. **POC 验证**：在 Phase 3 开始前，验证 CopilotKit 和 flutter_genui 的适用性
