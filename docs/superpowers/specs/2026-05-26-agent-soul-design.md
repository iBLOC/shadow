# Agent Soul 架构设计

**日期**: 2026-05-26
**状态**: 已批准

## 概述

Shadow 项目中的 Agent 系统采用双层 Prompt 架构：
1. **System Prompt** - 硬编码，不允许用户修改
2. **Soul/User Prompt** - 可变，用于描述个人助理的性格习惯

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent System                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │  Chat Agent     │         │ Mobile Actions  │           │
│  │  (主 Agent)     │         │    Agent       │           │
│  ├─────────────────┤         ├─────────────────┤           │
│  │ System Prompt   │         │ System Prompt   │           │
│  │ (硬编码)        │         │ (硬编码)        │           │
│  ├─────────────────┤         └─────────────────┘           │
│  │ Soul/User Prompt│                                     │
│  │ (可变)          │                                     │
│  └────────┬────────┘                                     │
│           │                                               │
│           ▼                                               │
│  ┌─────────────────────────────────────────────────┐     │
│  │              Neo4j Graph Database                │     │
│  │                                                  │     │
│  │  (SoulVersion) ─modified_by→ (UserAction)       │     │
│  │       │                    (AgentEvaluation)     │     │
│  │       │                                            │     │
│  │       └──reflects→ (ConversationSummary)         │     │
│  │       │                                            │     │
│  │       └──triggered_by→ (TriggerEvent)           │     │
│  │                        │                          │     │
│  │                   (ModificationReason)           │     │
│  └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Agent 类型

### 1. Chat Agent (主 Agent)

**职责**:
- 拥有 Soul/User Prompt
- 可创建任务 → 发送到 Prefrontal
- 可调用 Mobile Actions Agent
- 每晚 review 当天对话，评估并更新 Soul

**System Prompt**: 硬编码在 Flutter/Kotlin 代码中

**Soul**: 描述个人助理的性格习惯，存储在 Neo4j

### 2. Mobile Actions Agent

**职责**:
- 执行简单操作（拍照、发送消息等）
- 仅拥有 System Prompt

## 数据结构 (Neo4j)

### 节点类型

| 节点 | 说明 | 属性 |
|------|------|------|
| `SoulVersion` | 每个版本的完整 Soul | id, content, createdAt, source, version |
| `UserAction` | 用户主动修改 | id, type, timestamp |
| `AgentEvaluation` | Agent 评估结果 | id, summary, timestamp |
| `ConversationSummary` | 触发修改的对话摘要 | id, summary, date |
| `TriggerEvent` | 触发事件 | id, type, description |
| `ModificationReason` | 修改原因 | id, reason, details |

### 关系类型

| 关系 | 方向 | 说明 |
|------|------|------|
| `modified_by` | SoulVersion → UserAction | 用户修改 |
| `modified_by` | SoulVersion → AgentEvaluation | Agent 修改 |
| `reflects` | SoulVersion → ConversationSummary | 基于对话总结 |
| `triggered_by` | SoulVersion → TriggerEvent | 由事件触发 |
| `explains` | TriggerEvent → ModificationReason | 事件原因 |

### Soul 内容结构

Soul 是描述"个人助理性格习惯"的文本：
- 用户提出的所有要求都可以
- System Prompt 优先级最高
- 内容可包括：
  - 语气/沟通风格
  - 称呼偏好
  - 专业领域/知识范围
  - 工作习惯
  - 响应格式偏好

## 修改流程

### 用户主动修改
1. 用户在设置界面编辑 Soul
2. 直接修改，无需确认
3. 创建新的 SoulVersion 节点
4. 创建 UserAction 节点
5. 建立关系

### Agent 评估修改
1. Agent 每晚 review 当天对话
2. 检测到用户习惯变化
3. 提出修改建议（必须附带理由）
4. 自动修改（无需用户确认）
5. 创建新的 SoulVersion 节点
6. 创建 AgentEvaluation 节点 + ModificationReason 节点
7. 建立关系

## 实现计划

### Phase 1: 数据模型扩展

1. 扩展 `agent_settings` 表添加 `soul` 字段
2. 创建 Neo4j 版本历史存储
3. 定义节点和关系类型

### Phase 2: Soul 管理界面

1. Soul 编辑页面
2. 版本历史查看
3. 版本对比功能

### Phase 3: Agent 集成

1. Agent 获取当前 Soul
2. Agent 评估并修改 Soul
3. 任务创建和派发

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Flutter |
| 状态存储 | SQLite (当前) → Neon (未来) |
| 图数据库 | Neo4j |
| 任务派发 | Prefrontal API |
| Agent 调用 | A2A 协议 |

## 参考

- OpenClaw Agent 架构
- SOUL.md 概念 (OpenClaw)
- System Prompt 构建模式 (OpenClaw)
