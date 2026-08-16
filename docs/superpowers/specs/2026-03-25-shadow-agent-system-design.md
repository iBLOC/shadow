# Shadow 移动端 Agent 系统设计规范

**版本：** 1.0
**日期：** 2026-03-25
**状态：** 设计中

---

## 1. 概述

### 1.1 项目定位

Shadow 移动端内置双Agent系统：
- **主Agent (Personal Assistant)**: 用户的AI影子，默认使用 Gemma4 E4B 模型，负责理解用户意图并调度任务
- **MobileActionAgent**: 设备控制Agent，使用 FunctionGemma 270m 模型，专注于快速设备操作

### 1.2 核心特性

- **任务分流**: 简单任务 → MobileActionAgent，复杂任务 → Prefrontal任务系统
- **引擎支持**: liteRT / MNN 双引擎，每种引擎通过 JSON 配置支持多种模型
- **A2A协议**: Agent 间通过 WebSocket 通信，支持跨进程/跨服务调用
- **Skill生态**: 支持 Gallery 格式的 Skill (JS Skills + Native Skills)
- **MCP支持**: 完整的 Model Context Protocol 工具调用

### 1.3 与 Gallery 的关系

本设计参考 [Google AI Edge Gallery](https://github.com/google-ai-edge/gallery) 的实现：
- Skill 格式完全复用 Gallery 的 SKILL.md 格式
- AgentTools 实现参考 Gallery 的 AgentTools.kt
- MobileActions 实现参考 Gallery 的 MobileActionsTask

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Shadow Mobile App                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        主Agent (Main Agent)                           │  │
│  │                                                                      │  │
│  │  模型: Gemma4 E4B (默认)                                             │  │
│  │  引擎: liteRT / MNN (可配置)                                        │  │
│  │                                                                      │  │
│  │  系统提示词: "你是用户的AI影子..."                                   │  │
│  │                                                                      │  │
│  │  可用工具:                                                           │  │
│  │  ├── load_skill          加载Skill指令                              │  │
│  │  ├── run_js             执行JS Skill                                │  │
│  │  ├── run_mcp_tool       调用MCP工具                                  │  │
│  │  ├── delegate_to_action_agent  委托给MobileActionAgent (A2A)       │  │
│  │  └── create_task        创建任务交给Prefrontal                       │  │
│  │                                                                      │  │
│  │  执行策略: 混合模式                                                  │  │
│  │  1. 尝试Skill/MCP执行                                               │  │
│  │  2. 失败 → 委托MobileActionAgent                                   │  │
│  │  3. 仍失败/复杂 → 创建任务                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                           A2A WebSocket                                    │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    MobileActionAgent                                  │  │
│  │                                                                      │  │
│  │  模型: FunctionGemma 270m (临时)                                    │  │
│  │  能力: 闪光灯/联系人/日历/邮件/地图/WiFi                           │  │
│  │                                                                      │  │
│  │  可被外部Agent通过A2A调用                                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                           任务创建 (HTTP)                                  │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │               Prefrontal Service (Rust, Port 8082)                   │  │
│  │                                                                      │  │
│  │  - 复杂任务执行                                                      │  │
│  │  - 内置Agent管理                                                    │  │
│  │  - Skill/MCP集成                                                    │  │
│  │  - 记忆存储 (Hippocampus)                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 双Agent职责分工

| 维度 | 主Agent | MobileActionAgent |
|------|---------|-------------------|
| **模型** | Gemma4 E4B | FunctionGemma 270m |
| **定位** | 协调者/路由 | 执行者/设备控制 |
| **能力** | Skill/MCP/任务创建 | 设备操作 |
| **响应速度** | 中等 | 快速 |
| **复杂度** | 处理复杂推理 | 简单操作 |

### 2.3 执行流程

```
用户输入: "开灯" 或 "帮我约明天下午3点会议"

┌─────────────────────────────────────────────────────────────┐
│  主Agent (Gemma4 E4B)                                       │
│                                                              │
│  1. 理解用户意图                                            │
│  2. 判断: 设备控制 → 委托MobileActionAgent                  │
│  3. 调用 A2A WebSocket → MobileActionAgent                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  MobileActionAgent (FunctionGemma 270m)                     │
│                                                              │
│  1. 接收委托请求                                            │
│  2. Function Calling → turnOnFlashlight                    │
│  3. 执行Android Intent                                     │
│  4. 返回结果                                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
主Agent展示结果给用户
```

---

## 3. 模型配置

### 3.1 引擎配置

#### liteRT 引擎配置 (`assets/config/litert_models.json`)

```json
{
  "engine": "litert",
  "models": [
    {
      "id": "gemma4-e4b",
      "name": "Gemma4 E4B",
      "description": "Google最新一代旗舰模型",
      "path": "models/gemma4-e4b-lite-rt.mnn",
      "context_length": 8192,
      "quantization": "q4km",
      "supports": ["chat", "reasoning", "function_calling"]
    },
    {
      "id": "gemma3-e4b",
      "name": "Gemma3 E4B",
      "description": "Gemma3系列高效模型",
      "path": "models/gemma3-e4b-lite-rt.mnn",
      "context_length": 8192,
      "quantization": "q4km",
      "supports": ["chat", "reasoning"]
    }
  ],
  "default_model": "gemma4-e4b"
}
```

#### MNN 引擎配置 (`assets/config/mnn_models.json`)

```json
{
  "engine": "mnn",
  "models": [
    {
      "id": "qwen2.5-1.5b",
      "name": "Qwen2.5 1.5B",
      "description": "通义千问轻量版",
      "path": "models/qwen2.5-1.5b-mnn",
      "context_length": 4096,
      "quantization": "q4km",
      "supports": ["chat"]
    },
    {
      "id": "deepseek-r1-1.5b",
      "name": "DeepSeek R1 1.5B",
      "description": "推理模型",
      "path": "models/deepseek-r1-1.5b-mnn",
      "context_length": 4096,
      "quantization": "q4km",
      "supports": ["chat", "reasoning"]
    }
  ],
  "default_model": "qwen2.5-1.5b"
}
```

### 3.2 引擎切换逻辑

```
设置页面
    │
    ├── 引擎选择: liteRT / MNN
    │
    └── 模型选择: 根据引擎加载对应JSON配置中的模型列表
```

---

## 4. A2A 协议设计

### 4.1 WebSocket 连接

```
┌─────────────────────────────────────────────────────────────┐
│                    A2A WebSocket Server                      │
│                         Port: 8083                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /ws/a2a                                                   │
│                                                              │
│  - 认证: Token-based (设备ID + 签名)                        │
│  - 心跳: 30s ping/pong                                     │
│  - 重连: 自动重连 + 指数退避                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 消息格式

```json
{
  "type": "delegate_request | delegate_response | task_push | task_result",
  "id": "uuid",
  "timestamp": "ISO8601",
  "payload": {}
}
```

#### 4.2.1 委托请求 (主Agent → MobileActionAgent)

```json
{
  "type": "delegate_request",
  "id": "req-uuid",
  "timestamp": "2026-03-25T10:00:00Z",
  "payload": {
    "task_id": "task-uuid",
    "user_request": "开灯",
    "required_capabilities": ["flashlight", "device_control"],
    "context": {
      "session_id": "session-uuid"
    }
  }
}
```

#### 4.2.2 委托响应 (MobileActionAgent → 主Agent)

```json
{
  "type": "delegate_response",
  "id": "resp-uuid",
  "timestamp": "2026-03-25T10:00:01Z",
  "payload": {
    "task_id": "task-uuid",
    "status": "success | failed | partial",
    "action_taken": "turnOnFlashlight",
    "result": {
      "message": "闪光灯已开启"
    },
    "error": null
  }
}
```

#### 4.2.3 任务结果 (MobileActionAgent → 主Agent)

```json
{
  "type": "task_result",
  "id": "result-uuid",
  "timestamp": "2026-03-25T10:00:02Z",
  "payload": {
    "task_id": "task-uuid",
    "status": "completed",
    "summary": "设备操作完成"
  }
}
```

### 4.3 A2A Agent Card

```json
{
  "name": "MobileActionAgent",
  "description": "设备控制Agent，驱动FunctionGemma模型",
  "protocol_version": "1.0",
  "url": "ws://localhost:8083/ws/a2a",
  "skills": [
    {
      "id": "flashlight",
      "name": "Flashlight",
      "description": "开/关闪光灯"
    },
    {
      "id": "contacts",
      "name": "Contacts",
      "description": "创建联系人"
    },
    {
      "id": "calendar",
      "name": "Calendar",
      "description": "创建日历事件"
    },
    {
      "id": "email",
      "name": "Email",
      "description": "发送邮件"
    },
    {
      "id": "maps",
      "name": "Maps",
      "description": "显示位置"
    },
    {
      "id": "wifi",
      "name": "WiFi",
      "description": "打开WiFi设置"
    }
  ],
  "capabilities": {
    "streaming": false,
    "push_notifications": false
  }
}
```

---

## 5. 主Agent 系统提示词

### 5.1 默认系统提示词

```
# 主Agent系统提示词

你是用户的AI影子，代表用户执行日常任务和操作。

## 核心角色

你是一个任务协调者，理解用户需求后：
1. 简单操作 → 委托给设备控制Agent
2. Skill/MCP → 直接调用
3. 复杂任务 → 创建任务交给任务系统

## 可用能力

### 1. Skill系统
Skill是模块化的能力扩展，通过自然语言触发。

可用Skill:
___SKILLS___

### 2. MCP工具
MCP (Model Context Protocol) 工具提供系统级能力。

可用MCP工具:
___TOOLS___

### 3. 设备控制 (MobileActionAgent)
用于快速设备操作，如：
- 开/关闪光灯
- 创建联系人
- 发送邮件
- 显示位置
- 创建日历事件
- 打开设置

### 4. 任务系统
对于复杂任务，创建任务交给任务系统执行。

## 执行策略 (混合模式)

对于每个用户请求，按顺序尝试：

1. **检查Skill**: 是否有匹配的Skill？
   - 是 → 调用 load_skill + run_js/run_intent

2. **检查MCP**: 是否有匹配的MCP工具？
   - 是 → 调用 run_mcp_tool

3. **检查设备控制**: 是否为设备操作？
   - 是 → 委托给 MobileActionAgent (A2A)

4. **执行失败或复杂任务**: 创建任务
   - 调用 create_task
   - 返回任务确认

## 决策规则

| 请求类型 | 动作 |
|----------|------|
| "开灯"、"关灯" | 委托MobileActionAgent |
| "发邮件给张三" | 委托MobileActionAgent |
| "创建明天下午3点会议" | 委托MobileActionAgent |
| 匹配某个Skill | 执行该Skill |
| 匹配MCP工具 | 调用MCP工具 |
| "帮我规划5日游" | 创建任务 |
| "研究竞品报告" | 创建任务 |

## 错误处理

- Skill/MCP执行失败 → 尝试委托MobileActionAgent
- 设备控制失败 → 建议创建任务
- 不确定 → 询问用户

## 输出格式

执行成功后，返回简洁的结果描述。
如果需要创建任务，返回:
- 任务标题
- 预计完成时间
- 下一步建议
```

### 5.2 可配置提示词

用户可在设置页面修改主Agent的默认提示词，存储于：
- **DataStore**: `agent_prompts.pb`

```protobuf
message AgentPrompts {
  string main_agent_system_prompt = 1;
  string mobile_action_system_prompt = 2;
}
```

---

## 6. Skill 系统

### 6.1 Skill格式 (复用Gallery)

```
shadow-mobile/
└── assets/
    └── skills/
        ├── query-wikipedia/
        │   ├── SKILL.md
        │   └── scripts/
        │       └── index.html
        ├── send-email/
        │   └── SKILL.md       # Native Intent
        └── calculate-hash/
            ├── SKILL.md
            └── scripts/
                └── index.html
```

### 6.2 SKILL.md 格式

```markdown
---
name: skill-name
description: Skill简短描述
metadata:
  homepage: https://github.com/...  # 可选
---

# Skill标题

一段简短的描述，说明这个Skill做什么。

## 指令

当用户请求[触发条件]时：

1. 使用 `load_skill` 加载此Skill的指令
2. 使用 `run_js` 执行脚本（如果是JS Skill）
   - scriptName: "index.html"
   - data: JSON参数

或使用 `run_intent` 执行Native操作（如果是Native Skill）
   - intent: "action_name"
   - parameters: {...}
```

### 6.3 Skill执行流程

```
主Agent接收到请求
    │
    ▼
load_skill("skill-name")
    │
    ▼
读取SKILL.md中的指令
    │
    ▼
run_js(skillName, scriptName, data)
    │
    ▼
Webview执行JS代码
    │
    ▼
返回结果
```

### 6.4 SkillManager实现

```kotlin
class SkillManager {
    // 加载内置Skill (assets/skills/)
    fun loadBuiltInSkills(): List<Skill>

    // 加载用户添加的Skill
    fun loadUserSkills(): List<Skill>

    // 获取选中的Skill列表
    fun getSelectedSkills(): List<Skill>

    // 添加用户Skill
    fun addSkill(url: String): Skill

    // 删除用户Skill
    fun removeSkill(name: String)
}
```

---

## 7. MCP 支持

### 7.1 MCP架构

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Manager                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MCP Server 1 (e.g., filesystem)                           │
│  ├── tools: read, write, list                              │
│  └── status: connected / disconnected                      │
│                                                              │
│  MCP Server 2 (e.g., custom)                               │
│  ├── tools: custom_tool_1, custom_tool_2                   │
│  └── status: connected / disconnected                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 MCP工具调用

```kotlin
class McpTools {
    // 获取所有已配置的MCP服务器的工具列表
    fun getToolsPrompt(): String

    // 执行MCP工具
    suspend fun callTool(
        serverName: String,
        toolName: String,
        arguments: Map<String, Any>
    ): ToolResult
}
```

### 7.3 MCP配置存储

```protobuf
message McpServers {
  repeated McpServer servers = 1;
}

message McpServer {
  string name = 1;
  string command = 2;
  repeated string args = 3;
  map<string, string> env = 4;
  bool enabled = 5;
  repeated Tool tools = 6;
}
```

---

## 8. 任务系统集成

### 8.1 任务创建流程

```
主Agent判断需要创建任务
    │
    ▼
create_task(title, description, priority)
    │
    ▼
HTTP POST /api/tasks → Prefrontal (Port 8082)
    │
    ▼
Prefrontal创建任务，加入任务队列
    │
    ▼
返回任务ID和预计完成时间
```

### 8.2 任务状态查询

```kotlin
class TaskService {
    // 创建任务
    suspend fun createTask(request: CreateTaskRequest): TaskResponse

    // 获取任务列表
    suspend fun getTasks(): List<TaskResponse>

    // 获取任务详情
    suspend fun getTask(taskId: String): TaskResponse

    // 取消任务
    suspend fun cancelTask(taskId: String): Boolean
}
```

---

## 9. UI设计

### 9.1 首页 (HomeScreen)

```
┌─────────────────────────────────────────────────────────────┐
│  Shadow                                         [设置] ⚙️  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │              主Agent 对话界面                          │  │
│  │                                                       │  │
│  │   [User] 帮我开灯                                     │  │
│  │                                                       │  │
│  │   [Agent] 好的，正在为您开灯...                        │  │
│  │                                                       │  │
│  │   [Agent] 已为您开启闪光灯 ✓                          │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  输入消息...                                    [发送] │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [首页]  [任务]  [记忆]  [设置]                             │
└─────────────────────────────────────────────────────────────┘
```

**说明**: 首页只显示主Agent，MobileActionAgent 对用户不可见，由主Agent内部调用。

### 9.2 Agent管理页面 (AgentsScreen)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Agent 管理                            [刷新] ⟳           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [头像] 主Agent                                      │  │
│  │         用户的AI影子                                  │  │
│  │         模型: Gemma4 E4B (liteRT)                   │  │
│  │         状态: 在线                                    │  │
│  │                                                       │  │
│  │         [切换模型]  [编辑提示词]                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [头像] MobileActionAgent                           │  │
│  │         设备控制Agent                               │  │
│  │         模型: FunctionGemma 270m                    │  │
│  │         状态: 在线                                    │  │
│  │                                                       │  │
│  │         [切换模型]                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 模型设置页面

```
┌─────────────────────────────────────────────────────────────┐
│  ← 模型设置                                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  主Agent                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  引擎:  [liteRT ▼]                                  │  │
│  │                                                       │  │
│  │  模型:  ○ Gemma4 E4B (默认)                         │  │
│  │         ○ Gemma3 E4B                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  MobileActionAgent                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  模型:  ○ FunctionGemma 270m (默认)                 │  │
│  │         ○ (预留更多模型)                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 提示词设置页面

```
┌─────────────────────────────────────────────────────────────┐
│  ← 提示词设置                              [保存]          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  主Agent系统提示词                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  你是一个任务协调者...                                │  │
│  │                                                       │  │
│  │                                                       │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [恢复默认]                                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. 文件结构

```
shadow-mobile/
├── lib/
│   ├── main.dart
│   ├── app/
│   │   └── shadow_app.dart
│   │
│   ├── agents/
│   │   ├── main_agent/
│   │   │   ├── main_agent.dart           # 主Agent核心
│   │   │   ├── main_agent_prompt.dart   # 系统提示词
│   │   │   └── main_agent_tools.dart    # 工具定义
│   │   │
│   │   ├── mobile_action_agent/
│   │   │   ├── mobile_action_agent.dart
│   │   │   ├── actions.dart             # Action类型定义
│   │   │   ├── mobile_actions_tools.dart
│   │   │   └── mobile_actions_viewmodel.dart
│   │   │
│   │   └── a2a/
│   │       ├── a2a_client.dart          # A2A WebSocket客户端
│   │       ├── a2a_server.dart          # A2A WebSocket服务端
│   │       ├── a2a_protocol.dart        # 消息协议
│   │       └── agent_card.dart          # Agent Card
│   │
│   ├── skills/
│   │   ├── skill_manager.dart
│   │   ├── skill.dart
│   │   └── skill_loader.dart
│   │
│   ├── mcp/
│   │   ├── mcp_manager.dart
│   │   └── mcp_tool.dart
│   │
│   ├── models/
│   │   ├── model_config.dart
│   │   ├── model_engine.dart           # 引擎抽象
│   │   ├── litert_engine.dart          # liteRT引擎
│   │   └── mnn_engine.dart             # MNN引擎
│   │
│   ├── services/
│   │   ├── prefrontal_client.dart       # Prefrontal API
│   │   └── task_service.dart           # 任务服务
│   │
│   ├── screens/
│   │   ├── home_screen.dart            # 首页
│   │   ├── agents_screen.dart          # Agent管理
│   │   ├── model_settings_screen.dart  # 模型设置
│   │   └── prompt_settings_screen.dart # 提示词设置
│   │
│   └── providers/
│       ├── agent_provider.dart
│       ├── model_provider.dart
│       └── skill_provider.dart
│
├── assets/
│   ├── config/
│   │   ├── litert_models.json
│   │   └── mnn_models.json
│   └── skills/
│       ├── query-wikipedia/
│       │   ├── SKILL.md
│       │   └── scripts/
│       │       └── index.html
│       └── send-email/
│           └── SKILL.md
│
└── android/
    └── app/src/main/
        └── kotlin/
            └── com/ibloc/shadow/
                ├── MainActivity.kt
                └── litert/
                    └── litert_engine.kt
```

---

## 11. 实现优先级

### Phase 1: 主Agent核心 (MVP)
1. [ ] 主Agent模型配置 (liteRT/MNN双引擎)
2. [ ] 主Agent系统提示词
3. [ ] 主Agent基础对话UI
4. [ ] SkillManager基础实现
5. [ ] 提示词可配置化

### Phase 2: MobileActionAgent
1. [ ] MobileActionAgent实现 (参考Gallery)
2. [ ] A2A WebSocket服务端
3. [ ] A2A WebSocket客户端
4. [ ] 主Agent → MobileActionAgent 委托

### Phase 3: 任务集成
1. [ ] 任务创建API
2. [ ] 任务列表UI
3. [ ] 主Agent → Prefrontal 任务创建

### Phase 4: 完善
1. [ ] MCP Manager集成
2. [ ] 更多内置Skill
3. [ ] 桌面端实现 (后续)

---

## 12. 依赖

| 组件 | 依赖 | 说明 |
|------|------|------|
| WebSocket | `web_socket_channel` | Dart WebSocket |
| HTTP | `http` | API调用 |
| Storage | `DataStore` | 配置存储 |
| JSON | `json_annotation` | 序列化 |

---

## 13. 参考

- [Google AI Edge Gallery](https://github.com/google-ai-edge/gallery)
- [A2A Protocol SDK (@a2a-js/sdk)](https://github.com/google-a2a/a2a-js)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
