import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'actions.dart';

/// MobileActionAgent的Action执行器
/// 参考Gallery的MobileActionsViewModel实现
class MobileActionsViewModel {
  /// 执行Action
  Future<String> performAction(Action action) async {
    switch (action.type) {
      case ActionType.flashlightOn:
        return _turnOnFlashlight();
      case ActionType.flashlightOff:
        return _turnOffFlashlight();
      case ActionType.createContact:
        return _createContact(action as CreateContactAction);
      case ActionType.sendEmail:
        return _sendEmail(action as SendEmailAction);
      case ActionType.showLocation:
        return _showLocation(action as ShowLocationAction);
      case ActionType.openWifi:
        return _openWifiSettings();
      case ActionType.createCalendar:
        return _createCalendar(action as CreateCalendarAction);
    }
  }

  Future<String> _turnOnFlashlight() async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/flashlight');
      await platform.invokeMethod('turnOn');
      return '闪光灯已开启';
    } catch (e) {
      debugPrint('[MobileActionsViewModel] turnOnFlashlight failed: $e');
      return '闪光灯开启失败: $e';
    }
  }

  Future<String> _turnOffFlashlight() async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/flashlight');
      await platform.invokeMethod('turnOff');
      return '闪光灯已关闭';
    } catch (e) {
      debugPrint('[MobileActionsViewModel] turnOffFlashlight failed: $e');
      return '闪光灯关闭失败: $e';
    }
  }

  Future<String> _createContact(CreateContactAction action) async {
    try {
      // 使用mailto: Intent打开联系人应用
      final uri = Uri(
        scheme: 'mailto',
        path: action.email ?? '',
        queryParameters: {if (action.phone != null) 'phone': action.phone},
      );

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
        return '正在创建联系人: ${action.name}';
      } else {
        return '无法打开联系人应用';
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] createContact failed: $e');
      return '联系人创建失败: $e';
    }
  }

  Future<String> _sendEmail(SendEmailAction action) async {
    try {
      final uri = Uri(
        scheme: 'mailto',
        path: action.to,
        queryParameters: {'subject': action.subject, 'body': action.body},
      );

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
        return '邮件客户端已打开，收件人: ${action.to}';
      } else {
        return '无法打开邮件客户端';
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] sendEmail failed: $e');
      return '邮件发送失败: $e';
    }
  }

  Future<String> _showLocation(ShowLocationAction action) async {
    try {
      // 使用geo: Intent打开地图
      final uri = Uri(
        scheme: 'geo',
        path: '0,0',
        queryParameters: {'q': action.query},
      );

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
        return '正在显示位置: ${action.query}';
      } else {
        // 尝试使用Google Maps
        final googleMapsUri = Uri.parse(
          'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(action.query)}',
        );
        if (await canLaunchUrl(googleMapsUri)) {
          await launchUrl(googleMapsUri, mode: LaunchMode.externalApplication);
          return '正在显示位置: ${action.query}';
        }
        return '无法打开地图应用';
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] showLocation failed: $e');
      return '位置显示失败: $e';
    }
  }

  Future<String> _openWifiSettings() async {
    try {
      // 打开WiFi设置
      const platform = MethodChannel('com.ibloc.shadow/settings');
      await platform.invokeMethod('openWifiSettings');
      return 'WiFi设置已打开';
    } catch (e) {
      debugPrint('[MobileActionsViewModel] openWifiSettings failed: $e');
      return 'WiFi设置打开失败: $e';
    }
  }

  Future<String> _createCalendar(CreateCalendarAction action) async {
    try {
      // 使用日历Intent
      final uri = Uri(
        scheme: 'content',
        path: 'com.android.calendar',
        queryParameters: {
          'title': action.title,
          'begin': action.startTime.millisecondsSinceEpoch.toString(),
          if (action.endTime != null)
            'end': action.endTime!.millisecondsSinceEpoch.toString(),
          if (action.description != null) 'description': action.description,
          if (action.location != null) 'location': action.location,
        },
      );

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
        return '日历事件已创建: ${action.title}';
      } else {
        return '无法打开日历应用';
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] createCalendar failed: $e');
      return '日历事件创建失败: $e';
    }
  }
}
