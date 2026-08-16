/// 主Agent可用工具定义
class MainAgentTool {
  final String name;
  final String description;
  final Map<String, ToolParam> parameters;

  const MainAgentTool({
    required this.name,
    required this.description,
    required this.parameters,
  });
}

/// 工具参数定义
class ToolParam {
  final String type;
  final String description;
  final bool required;

  const ToolParam({
    required this.type,
    required this.description,
    this.required = true,
  });
}

/// 主Agent工具注册表
class MainAgentToolsRegistry {
  static const loadSkill = MainAgentTool(
    name: 'load_skill',
    description: '加载Skill指令到上下文',
    parameters: {
      'skill_name': ToolParam(type: 'string', description: '要加载的Skill名称'),
    },
  );

  static const runJs = MainAgentTool(
    name: 'run_js',
    description: '执行JS Skill',
    parameters: {
      'skill_name': ToolParam(type: 'string', description: 'Skill名称'),
      'script_name': ToolParam(type: 'string', description: '脚本名称'),
      'data': ToolParam(type: 'string', description: '传递给脚本的数据'),
    },
  );

  static const runMcpTool = MainAgentTool(
    name: 'run_mcp_tool',
    description: '调用MCP工具',
    parameters: {
      'tool_name': ToolParam(type: 'string', description: '工具名称'),
      'input': ToolParam(type: 'string', description: '工具输入参数(JSON)'),
    },
  );

  static const delegateToActionAgent = MainAgentTool(
    name: 'delegate_to_action_agent',
    description: '委托请求给MobileActionAgent执行设备控制',
    parameters: {
      'task': ToolParam(type: 'string', description: '用户请求任务描述'),
      'required_capabilities': ToolParam(
        type: 'array',
        description: '需要的设备能力',
        required: false,
      ),
    },
  );

  static const createTask = MainAgentTool(
    name: 'create_task',
    description: '创建复杂任务交给Prefrontal执行',
    parameters: {
      'title': ToolParam(type: 'string', description: '任务标题'),
      'description': ToolParam(
        type: 'string',
        description: '任务详细描述',
        required: false,
      ),
      'priority': ToolParam(
        type: 'string',
        description: '优先级: high, normal, low',
        required: false,
      ),
    },
  );

  /// 获取所有工具
  static List<MainAgentTool> get allTools => [
    loadSkill,
    runJs,
    runMcpTool,
    delegateToActionAgent,
    createTask,
  ];

  /// 根据名称查找工具
  static MainAgentTool? findTool(String name) {
    try {
      return allTools.firstWhere((t) => t.name == name);
    } catch (_) {
      return null;
    }
  }

  /// 获取工具的描述列表（用于prompt）
  static List<String> getToolDescriptions() {
    return allTools.map((tool) {
      final params = tool.parameters.entries
          .map((e) => '  - ${e.key}: ${e.value.description}')
          .join('\n');
      return '${tool.name}: ${tool.description}\n$params';
    }).toList();
  }
}
