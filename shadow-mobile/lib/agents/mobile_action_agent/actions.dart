import 'package:flutter/material.dart';

/// Action类型枚举
enum ActionType {
  flashlightOn,
  flashlightOff,
  createContact,
  sendEmail,
  showLocation,
  openWifi,
  createCalendar,
}

/// Action基类
abstract class Action {
  final ActionType type;
  final IconData icon;
  final String functionName;
  final Map<String, String> parameters;

  const Action({
    required this.type,
    required this.icon,
    required this.functionName,
    required this.parameters,
  });

  /// 获取人类可读的Action描述
  String get displayName;
}

/// 闪光灯开启Action
class FlashlightOnAction extends Action {
  FlashlightOnAction()
    : super(
        type: ActionType.flashlightOn,
        icon: Icons.flashlight_on,
        functionName: 'turnOnFlashlight',
        parameters: const {},
      );

  @override
  String get displayName => '开启闪光灯';
}

/// 闪光灯关闭Action
class FlashlightOffAction extends Action {
  FlashlightOffAction()
    : super(
        type: ActionType.flashlightOff,
        icon: Icons.flashlight_off,
        functionName: 'turnOffFlashlight',
        parameters: const {},
      );

  @override
  String get displayName => '关闭闪光灯';
}

/// 创建联系人Action
class CreateContactAction extends Action {
  final String name;
  final String? phone;
  final String? email;

  CreateContactAction({required this.name, this.phone, this.email})
    : super(
        type: ActionType.createContact,
        icon: Icons.person_add,
        functionName: 'createContact',
        parameters: {
          'name': name,
          if (phone != null) 'phone': phone,
          if (email != null) 'email': email,
        },
      );

  @override
  String get displayName => '创建联系人: $name';
}

/// 发送邮件Action
class SendEmailAction extends Action {
  final String to;
  final String subject;
  final String body;

  SendEmailAction({required this.to, required this.subject, required this.body})
    : super(
        type: ActionType.sendEmail,
        icon: Icons.email,
        functionName: 'sendEmail',
        parameters: {'to': to, 'subject': subject, 'body': body},
      );

  @override
  String get displayName => '发送邮件到: $to';
}

/// 显示位置Action
class ShowLocationAction extends Action {
  final String query;

  ShowLocationAction({required this.query})
    : super(
        type: ActionType.showLocation,
        icon: Icons.location_on,
        functionName: 'showLocation',
        parameters: {'query': query},
      );

  @override
  String get displayName => '显示位置: $query';
}

/// 打开WiFi设置Action
class OpenWifiAction extends Action {
  OpenWifiAction()
    : super(
        type: ActionType.openWifi,
        icon: Icons.wifi,
        functionName: 'openWifiSettings',
        parameters: const {},
      );

  @override
  String get displayName => '打开WiFi设置';
}

/// 创建日历事件Action
class CreateCalendarAction extends Action {
  final String title;
  final DateTime startTime;
  final DateTime? endTime;
  final String? description;
  final String? location;

  CreateCalendarAction({
    required this.title,
    required this.startTime,
    this.endTime,
    this.description,
    this.location,
  }) : super(
         type: ActionType.createCalendar,
         icon: Icons.calendar_today,
         functionName: 'createCalendarEvent',
         parameters: {
           'title': title,
           'start_time': startTime.toIso8601String(),
           if (endTime != null) 'end_time': endTime.toIso8601String(),
           if (description != null) 'description': description,
           if (location != null) 'location': location,
         },
       );

  @override
  String get displayName => '创建日历事件: $title';
}

/// Action工厂类
class ActionFactory {
  /// 从类型创建Action
  static Action? fromType(ActionType type, Map<String, String> parameters) {
    switch (type) {
      case ActionType.flashlightOn:
        return FlashlightOnAction();
      case ActionType.flashlightOff:
        return FlashlightOffAction();
      case ActionType.createContact:
        return CreateContactAction(
          name: parameters['name'] ?? '',
          phone: parameters['phone'],
          email: parameters['email'],
        );
      case ActionType.sendEmail:
        return SendEmailAction(
          to: parameters['to'] ?? '',
          subject: parameters['subject'] ?? '',
          body: parameters['body'] ?? '',
        );
      case ActionType.showLocation:
        return ShowLocationAction(query: parameters['query'] ?? '');
      case ActionType.openWifi:
        return OpenWifiAction();
      case ActionType.createCalendar:
        return CreateCalendarAction(
          title: parameters['title'] ?? '',
          startTime: parameters['start_time'] != null
              ? DateTime.parse(parameters['start_time']!)
              : DateTime.now(),
          endTime: parameters['end_time'] != null
              ? DateTime.parse(parameters['end_time']!)
              : null,
          description: parameters['description'],
          location: parameters['location'],
        );
    }
  }
}
