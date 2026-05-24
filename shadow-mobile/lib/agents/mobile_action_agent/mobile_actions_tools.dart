import 'package:flutter/foundation.dart';
import '../a2a/a2a_message.dart';
import 'actions.dart';

/// MobileActionAgent的工具定义
/// 参考Gallery的AgentTools.kt实现
class MobileActionsTools {
  final void Function(Action) onActionCalled;

  MobileActionsTools({required this.onActionCalled});

  /// 开启闪光灯
  Map<String, String> turnOnFlashlight() {
    onActionCalled(FlashlightOnAction());
    return {'result': 'Flashlight turned on'};
  }

  /// 关闭闪光灯
  Map<String, String> turnOffFlashlight() {
    onActionCalled(FlashlightOffAction());
    return {'result': 'Flashlight turned off'};
  }

  /// 创建联系人
  Map<String, String> createContact(
    String name, {
    String? phone,
    String? email,
  }) {
    onActionCalled(CreateContactAction(name: name, phone: phone, email: email));
    return {'result': 'Contact creation initiated', 'name': name};
  }

  /// 发送邮件
  Map<String, String> sendEmail(String to, String subject, String body) {
    onActionCalled(SendEmailAction(to: to, subject: subject, body: body));
    return {'result': 'Email compose opened', 'to': to};
  }

  /// 显示位置
  Map<String, String> showLocation(String query) {
    onActionCalled(ShowLocationAction(query: query));
    return {'result': 'Map opened', 'query': query};
  }

  /// 打开WiFi设置
  Map<String, String> openWifiSettings() {
    onActionCalled(OpenWifiAction());
    return {'result': 'WiFi settings opened'};
  }

  /// 创建日历事件
  Map<String, String> createCalendarEvent(
    String title,
    String startTime, {
    String? endTime,
    String? description,
    String? location,
  }) {
    onActionCalled(
      CreateCalendarAction(
        title: title,
        startTime: DateTime.parse(startTime),
        endTime: endTime != null ? DateTime.parse(endTime) : null,
        description: description,
        location: location,
      ),
    );
    return {'result': 'Calendar event created', 'title': title};
  }

  /// 解析Function Calling结果并触发Action
  /// 返回是否成功触发了Action
  bool parseAndExecuteToolCall(
    String toolName,
    Map<String, dynamic> arguments,
  ) {
    try {
      switch (toolName) {
        case 'turnOnFlashlight':
          turnOnFlashlight();
          return true;
        case 'turnOffFlashlight':
          turnOffFlashlight();
          return true;
        case 'createContact':
          createContact(
            arguments['name'] as String,
            phone: arguments['phone'] as String?,
            email: arguments['email'] as String?,
          );
          return true;
        case 'sendEmail':
          sendEmail(
            arguments['to'] as String,
            arguments['subject'] as String,
            arguments['body'] as String,
          );
          return true;
        case 'showLocation':
          showLocation(arguments['query'] as String);
          return true;
        case 'openWifiSettings':
          openWifiSettings();
          return true;
        case 'createCalendarEvent':
          createCalendarEvent(
            arguments['title'] as String,
            arguments['startTime'] as String,
            endTime: arguments['endTime'] as String?,
            description: arguments['description'] as String?,
            location: arguments['location'] as String?,
          );
          return true;
        default:
          debugPrint('[MobileActionsTools] Unknown tool: $toolName');
          return false;
      }
    } catch (e) {
      debugPrint('[MobileActionsTools] Error executing tool $toolName: $e');
      return false;
    }
  }
}
