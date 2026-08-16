# Agent Soul 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** 实现 Agent Soul 系统，包括硬编码 System Prompt、可变 Soul/User Prompt、版本历史管理

**Architecture:**
- System Prompt 硬编码在 Flutter/Kotlin 代码中
- Soul 存储在 SQLite（当前）配合 Neo4j（版本历史图数据库）
- 主 Agent 可创建任务派发到 Prefrontal
- Agent 评估后自动修改 Soul（需附带理由）

**Tech Stack:** Flutter, SQLite, Neo4j, Prefrontal API

---

## 实现步骤

### 步骤 1: 扩展 SQLite 数据模型

**目标**: 在 SQLite 中添加 Soul 相关字段，支持 Soul 内容的存储

**文件**:
- 修改: `lib/services/database/agent_settings.dart`
- 修改: `lib/services/database/database_helper.dart`

**任务**:

- [ ] **Step 1.1: 扩展 AgentSettings 模型，添加 soul 字段**

```dart
// lib/services/database/agent_settings.dart
class AgentSettings {
  final String id;
  final String name;
  final String? description;
  final bool isEnabled;
  final Map<String, dynamic>? settings;
  final String? soul;  // 新增: Soul 内容

  const AgentSettings({
    required this.id,
    required this.name,
    this.description,
    this.isEnabled = true,
    this.settings,
    this.soul,  // 新增
  });

  // 更新 fromMap 和 toMap
  factory AgentSettings.fromMap(Map<String, dynamic> map) {
    return AgentSettings(
      // ... existing fields
      soul: map['soul'] as String?,  // 新增
    );
  }

  Map<String, dynamic> toMap() {
    return {
      // ... existing fields
      'soul': soul,  // 新增
    };
  }
}
```

- [ ] **Step 1.2: 扩展 database_helper.dart，添加 soul 字段到表**

```dart
// lib/services/database/database_helper.dart
await db.execute('''
  CREATE TABLE agent_settings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    settings TEXT,
    soul TEXT  -- 新增
  )
''');
```

- [ ] **Step 1.3: 更新 SQLite 表，添加 soul 列**

```bash
# 如果表已存在，需要迁移
ALTER TABLE agent_settings ADD COLUMN soul TEXT;
```

---

### 步骤 2: 创建 Neo4j 版本历史模型

**目标**: 定义 Soul 版本历史的节点和关系结构

**文件**:
- 创建: `lib/services/neo4j/neo4j_client.dart`
- 创建: `lib/services/neo4j/soul_version_graph.dart`

**任务**:

- [ ] **Step 2.1: 创建 Neo4j 客户端封装**

```dart
// lib/services/neo4j/neo4j_client.dart
class Neo4jClient {
  final String uri;
  final String user;
  final String password;

  Future<void> execute(String query, Map<String, dynamic> params) async {
    // 使用 neo4j_dart 或 http client 连接 Neo4j
  }

  Future<List<Map<String, dynamic>>> run(String query, Map<String, dynamic> params) async {
    // 执行查询并返回结果
  }
}
```

- [ ] **Step 2.2: 定义 SoulVersion 图节点模型**

```dart
// lib/services/neo4j/soul_version_graph.dart

class SoulVersionNode {
  final String id;
  final String content;
  final DateTime createdAt;
  final String source; // "user" | "agent"
  final int version;

  SoulVersionNode({
    required this.id,
    required this.content,
    required this.createdAt,
    required this.source,
    required this.version,
  });
}

class UserActionNode {
  final String id;
  final DateTime timestamp;
  final String actionType; // "edit" | "create"
}

class AgentEvaluationNode {
  final String id;
  final DateTime timestamp;
  final String summary;
  final String reason; // 修改理由
}

class TriggerEventNode {
  final String id;
  final String type; // "user_edit" | "agent_review"
  final String description;
}

class ConversationSummaryNode {
  final String id;
  final DateTime date;
  final String summary;
}
```

- [ ] **Step 2.3: 定义关系类型**

```dart
// lib/services/neo4j/soul_version_graph.dart

class SoulRelationships {
  static const String modifiedBy = 'modified_by';
  static const String reflects = 'reflects';
  static const String triggeredBy = 'triggered_by';
  static const String explains = 'explains';
  static const String contains = 'contains';
}
```

---

### 步骤 3: 创建 Soul 版本历史服务

**目标**: 实现 Soul 版本管理的 CRUD 操作

**文件**:
- 创建: `lib/services/soul_service.dart`
- 创建: `lib/services/neo4j/soul_history_repository.dart`

**任务**:

- [ ] **Step 3.1: 创建 SoulHistoryRepository**

```dart
// lib/services/neo4j/soul_history_repository.dart
class SoulHistoryRepository {
  final Neo4jClient _client;

  // 创建新版本
  Future<void> createSoulVersion({
    required String content,
    required String source,
    required String reason,
    String? conversationSummary,
    String? triggerType,
  }) async {
    // 1. 创建 SoulVersion 节点
    // 2. 创建 UserAction 或 AgentEvaluation 节点
    // 3. 创建 ModificationReason 节点
    // 4. 创建 TriggerEvent 节点（如果需要）
    // 5. 建立关系
  }

  // 获取版本历史
  Future<List<SoulVersionNode>> getVersionHistory(String agentId) async {
    // 查询并返回版本列表
  }

  // 获取版本详情
  Future<SoulVersionNode?> getVersion(String versionId) async {
    // 查询单个版本详情
  }

  // 获取当前活跃版本
  Future<SoulVersionNode?> getCurrentVersion(String agentId) async {
    // 查询最新版本
  }
}
```

- [ ] **Step 3.2: 创建 SoulService 作为高层接口**

```dart
// lib/services/soul_service.dart
class SoulService {
  final SoulHistoryRepository _historyRepo;
  final AgentRepository _agentRepo;

  // 获取当前 Soul
  Future<String?> getCurrentSoul(String agentId) async {
    final agent = await _agentRepo.getById(agentId);
    return agent?.soul;
  }

  // 用户直接修改 Soul
  Future<void> updateSoulByUser(String agentId, String newSoul) async {
    // 1. 更新 SQLite 中的 soul 字段
    // 2. 记录版本历史（source = "user"）
  }

  // Agent 评估后修改 Soul
  Future<void> updateSoulByAgent({
    required String agentId,
    required String newSoul,
    required String reason,
    String? conversationSummary,
  }) async {
    // 1. 更新 SQLite 中的 soul 字段
    // 2. 记录版本历史（source = "agent"，包含 reason）
  }

  // 获取版本历史（用于 UI 展示）
  Future<List<SoulVersionHistory>> getVersionHistory(String agentId) async {
    // 返回版本列表及关系信息
  }
}
```

---

### 步骤 4: 创建 Soul 管理界面

**目标**: 用户可以编辑 Soul 并查看版本历史

**文件**:
- 创建: `lib/screens/soul_screen.dart`
- 创建: `lib/widgets/soul_editor.dart`
- 创建: `lib/widgets/soul_version_history.dart`

**任务**:

- [ ] **Step 4.1: 创建 SoulScreen**

```dart
// lib/screens/soul_screen.dart
class SoulScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 布局:
    // - 上方: Soul 编辑器
    // - 下方: 版本历史列表
    return Scaffold(
      appBar: AppBar(title: Text('Soul 设置')),
      body: Column(
        children: [
          Expanded(child: SoulEditor()),
          Expanded(child: SoulVersionHistory()),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4.2: 创建 SoulEditor widget**

```dart
// lib/widgets/soul_editor.dart
class SoulEditor extends ConsumerStatefulWidget {
  @override
  ConsumerState<SoulEditor> createState() => _SoulEditorState();
}

class _SoulEditorState extends ConsumerState<SoulEditor> {
  late TextEditingController _controller;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _loadCurrentSoul();
  }

  Future<void> _loadCurrentSoul() async {
    final soul = await ref.read(soulServiceProvider).getCurrentSoul('chat');
    _controller.text = soul ?? '';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: TextField(
            controller: _controller,
            maxLines: null,
            expands: true,
            decoration: InputDecoration(
              hintText: '描述你的个人助理的性格和习惯...',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() => _hasChanges = true),
          ),
        ),
        if (_hasChanges)
          ElevatedButton(
            onPressed: _saveSoul,
            child: Text('保存'),
          ),
      ],
    );
  }

  Future<void> _saveSoul() async {
    await ref.read(soulServiceProvider).updateSoulByUser(
      'chat',
      _controller.text,
    );
    setState(() => _hasChanges = false);
  }
}
```

- [ ] **Step 4.3: 创建 SoulVersionHistory widget**

```dart
// lib/widgets/soul_version_history.dart
class SoulVersionHistory extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(soulHistoryProvider);

    return ListView.builder(
      itemCount: history.length,
      itemBuilder: (context, index) {
        final version = history[index];
        return ListTile(
          leading: CircleAvatar(
            child: Text(version.version.toString()),
          ),
          title: Text('v${version.version} - ${version.source}'),
          subtitle: Text(version.reason ?? '无理由'),
          trailing: Text(_formatDate(version.createdAt)),
          onTap: () => _showVersionDetail(context, version),
        );
      },
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day} ${date.hour}:${date.minute}';
  }
}
```

---

### 步骤 5: 集成到现有 Agent 管理

**目标**: 将 Soul 管理集成到 agents_screen.dart

**文件**:
- 修改: `lib/screens/agents_screen.dart`

**任务**:

- [ ] **Step 5.1: 添加 Soul 设置入口**

```dart
// 在 _AgentCard 中添加设置按钮
class _AgentCard extends ConsumerWidget {
  final AgentSettings agent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Column(
        children: [
          // ... existing UI
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: () => _showSoulSettings(context),
                icon: const Icon(Icons.person),
                label: const Text('Soul'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showSoulSettings(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => SoulScreen()),
    );
  }
}
```

---

### 步骤 6: Agent 评估修改流程

**目标**: Agent 可以在对话中检测用户习惯并更新 Soul

**文件**:
- 创建: `lib/services/agent_review_service.dart`

**任务**:

- [ ] **Step 6.1: 创建 AgentReviewService**

```dart
// lib/services/agent_review_service.dart
class AgentReviewService {
  final SoulService _soulService;
  final HippocampusClient _hippocampus;

  // 每晚 review 当天对话
  Future<void> nightlyReview() async {
    // 1. 从 Hippocampus 获取今天的对话摘要
    final todayConversations = await _hippocampus.getTodayConversations();

    // 2. 分析对话，提取用户习惯
    final habits = await _analyzeHabits(todayConversations);

    // 3. 对比当前 Soul
    final currentSoul = await _soulService.getCurrentSoul('chat');

    // 4. 如果有变化，提出修改建议
    if (_hasSignificantChange(habits, currentSoul)) {
      final newSoul = await _generateNewSoul(currentSoul, habits);
      final reason = _generateReason(habits);

      // 5. 自动更新（附带理由）
      await _soulService.updateSoulByAgent(
        agentId: 'chat',
        newSoul: newSoul,
        reason: reason,
        conversationSummary: todayConversations.summary,
      );
    }
  }

  Future<List<Habit>> _analyzeHabits(List<Conversation> conversations) async {
    // 使用 LLM 分析对话，提取习惯
  }

  bool _hasSignificantChange(List<Habit> habits, String currentSoul) {
    // 检测是否有显著变化
  }

  String _generateNewSoul(String currentSoul, List<Habit> habits) async {
    // 生成新 Soul 内容
  }

  String _generateReason(List<Habit> habits) {
    // 生成修改理由
  }
}
```

---

## 文件清单

### 新建文件
- `lib/services/neo4j/neo4j_client.dart`
- `lib/services/neo4j/soul_version_graph.dart`
- `lib/services/neo4j/soul_history_repository.dart`
- `lib/services/soul_service.dart`
- `lib/services/agent_review_service.dart`
- `lib/screens/soul_screen.dart`
- `lib/widgets/soul_editor.dart`
- `lib/widgets/soul_version_history.dart`

### 修改文件
- `lib/services/database/agent_settings.dart`
- `lib/services/database/database_helper.dart`
- `lib/screens/agents_screen.dart`

---

## 依赖

```yaml
# pubspec.yaml
dependencies:
  neo4j_dart: ^0.1.0  # 或使用 http client 连接 Neo4j
```

---

## 测试计划

- [ ] Unit test: SoulService.getCurrentSoul
- [ ] Unit test: SoulService.updateSoulByUser
- [ ] Unit test: SoulService.updateSoulByAgent
- [ ] Widget test: SoulEditor 文本保存
- [ ] Widget test: SoulVersionHistory 列表渲染
