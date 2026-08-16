import 'dart:async';
import 'package:flutter/foundation.dart';
import '../a2a/a2a_client.dart';
import '../a2a/a2a_message.dart';
import '../a2a/a2a_server.dart';
import 'actions.dart';
import 'mobile_actions_tools.dart';
import 'mobile_actions_viewmodel.dart';

/// MobileActionAgent
/// 处理设备控制请求的Agent
/// 使用FunctionGemma 270m模型
class MobileActionAgent {
  final MobileActionsTools _tools;
  final MobileActionsViewModel _viewModel;
  final A2AClient? _a2aClient;
  final A2AServer? _a2aServer;

  /// Agent Card描述
  static final agentCard = AgentCard(
    name: 'MobileActionAgent',
    description: '设备控制Agent，驱动FunctionGemma模型',
    protocolVersion: '1.0',
    url: 'ws://localhost:8083/a2a',
    skills: [
      const AgentSkill(
        id: 'flashlight',
        name: 'Flashlight',
        description: '开/关闪光灯',
      ),
      const AgentSkill(id: 'contacts', name: 'Contacts', description: '创建联系人'),
      const AgentSkill(id: 'calendar', name: 'Calendar', description: '创建日历事件'),
      const AgentSkill(id: 'email', name: 'Email', description: '发送邮件'),
      const AgentSkill(id: 'maps', name: 'Maps', description: '显示位置'),
      const AgentSkill(id: 'wifi', name: 'WiFi', description: '打开WiFi设置'),
    ],
    capabilities: AgentCapabilities(streaming: false, pushNotifications: false),
  );

  MobileActionAgent({
    MobileActionsTools? tools,
    MobileActionsViewModel? viewModel,
    A2AClient? a2aClient,
    A2AServer? a2aServer,
  }) : _tools = tools ?? MobileActionsTools(onActionCalled: (_) {}),
       _viewModel = viewModel ?? MobileActionsViewModel(),
       _a2aClient = a2aClient,
       _a2aServer = a2aServer {
    _setupA2A();
  }

  void _setupA2A() {
    // 设置A2A客户端的请求处理器
    _a2aClient?.setRequestHandler(_handleDelegateRequest);
  }

  /// 处理来自主Agent的委托请求
  Future<DelegateResponse> _handleDelegateRequest(
    DelegateRequest request,
  ) async {
    try {
      // 根据userRequest创建对应的Action
      final action = _parseUserRequest(request.userRequest);
      if (action == null) {
        return DelegateResponse(
          taskId: request.taskId,
          status: 'failed',
          error: 'Cannot understand request: ${request.userRequest}',
        );
      }

      // 执行Action
      final result = await _viewModel.performAction(action);

      return DelegateResponse(
        taskId: request.taskId,
        status: 'success',
        actionTaken: action.functionName,
        result: {'message': result},
      );
    } catch (e) {
      return DelegateResponse(
        taskId: request.taskId,
        status: 'failed',
        error: e.toString(),
      );
    }
  }

  /// 解析用户请求为Action
  /// 这个方法会被FunctionGemma模型的输出调用
  Action? parseAndExecute(String toolName, Map<String, dynamic> arguments) {
    final success = _tools.parseAndExecuteToolCall(toolName, arguments);
    if (!success) {
      debugPrint('[MobileActionAgent] Failed to execute tool: $toolName');
    }
    return null; // Action已通过onActionCalled回调触发
  }

  /// 直接执行Action（通过自然语言解析）
  Future<String> executeFromText(String userRequest) async {
    final action = _parseUserRequest(userRequest);
    if (action == null) {
      return '无法理解请求: $userRequest';
    }

    return _viewModel.performAction(action);
  }

  Action? _parseUserRequest(String request) {
    final lower = request.toLowerCase();

    // 闪光灯
    if (lower.contains('开灯') ||
        lower.contains('打开闪光灯') ||
        lower.contains('开启闪光灯')) {
      return FlashlightOnAction();
    }
    if (lower.contains('关灯') ||
        lower.contains('关闭闪光灯') ||
        lower.contains('关闭闪光灯')) {
      return FlashlightOffAction();
    }

    // WiFi
    if (lower.contains('wifi') ||
        lower.contains('无线网络') ||
        lower.contains('打开wifi')) {
      return OpenWifiAction();
    }

    // 联系人
    if (lower.contains('联系人') || lower.contains('创建联系人')) {
      // 简单提取姓名
      final nameMatch = RegExp(r'给\S+创建联系人|创建联系人\S+|联系人(.+)').firstMatch(lower);
      final name = nameMatch?.group(1)?.trim() ?? '新联系人';
      return CreateContactAction(name: name);
    }

    // 邮件
    if (lower.contains('邮件') ||
        lower.contains('发邮件') ||
        lower.contains('发送邮件')) {
      // 简单提取收件人
      final toMatch = RegExp(r'给(.+)发邮件|发给(.+)|至(.+)').firstMatch(lower);
      final to = toMatch?.group(1)?.trim() ?? '';
      return SendEmailAction(to: to, subject: '', body: '');
    }

    // 位置
    if (lower.contains('位置') || lower.contains('地图') || lower.contains('在哪里')) {
      // 简单提取位置
      final locMatch = RegExp(r'在(.+)的位置|显示(.+)').firstMatch(lower);
      final query = locMatch?.group(1)?.trim() ?? '';
      return ShowLocationAction(query: query);
    }

    // 日历
    if (lower.contains('日历') ||
        lower.contains('会议') ||
        lower.contains('日程') ||
        lower.contains('创建日程')) {
      // 简单提取标题
      final titleMatch = RegExp(r'创建(.+)会议|创建(.+)日程|(.+)会议').firstMatch(lower);
      final title = titleMatch?.group(1)?.trim() ?? '新事件';
      return CreateCalendarAction(
        title: title,
        startTime: DateTime.now().add(const Duration(hours: 1)),
      );
    }

    return null;
  }

  /// 连接A2A服务器（作为客户端）
  Future<void> connect(String serverUrl) async {
    await _a2aClient?.connect();
  }

  /// 断开连接
  Future<void> disconnect() async {
    await _a2aClient?.disconnect();
  }

  /// 启动A2A服务器（接受其他Agent的请求）
  Future<void> startServer() async {
    await _a2aServer?.start();
  }

  /// 停止A2A服务器
  Future<void> stopServer() async {
    await _a2aServer?.stop();
  }
}
