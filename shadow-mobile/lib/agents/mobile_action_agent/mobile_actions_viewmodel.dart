import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'actions.dart';
import '../../l10n/current_l10n.dart';

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
      return currentL10n().actionFlashlightOnDone;
    } catch (e) {
      debugPrint('[MobileActionsViewModel] turnOnFlashlight failed: $e');
      return currentL10n().actionFlashlightOnFailed(e.toString());
    }
  }

  Future<String> _turnOffFlashlight() async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/flashlight');
      await platform.invokeMethod('turnOff');
      return currentL10n().actionFlashlightOffDone;
    } catch (e) {
      debugPrint('[MobileActionsViewModel] turnOffFlashlight failed: $e');
      return currentL10n().actionFlashlightOffFailed(e.toString());
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
        return currentL10n().actionCreatingContact(action.name);
      } else {
        return currentL10n().actionNoContactsApp;
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] createContact failed: $e');
      return currentL10n().actionContactFailed(e.toString());
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
        return currentL10n().actionEmailOpened(action.to);
      } else {
        return currentL10n().actionNoEmailApp;
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] sendEmail failed: $e');
      return currentL10n().actionEmailFailed(e.toString());
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
        return currentL10n().actionShowingLocation(action.query);
      } else {
        // 尝试使用Google Maps
        final googleMapsUri = Uri.parse(
          'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(action.query)}',
        );
        if (await canLaunchUrl(googleMapsUri)) {
          await launchUrl(googleMapsUri, mode: LaunchMode.externalApplication);
          return currentL10n().actionShowingLocation(action.query);
        }
        return currentL10n().actionNoMapsApp;
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] showLocation failed: $e');
      return currentL10n().actionLocationFailed(e.toString());
    }
  }

  Future<String> _openWifiSettings() async {
    try {
      // 打开WiFi设置
      const platform = MethodChannel('com.ibloc.shadow/settings');
      await platform.invokeMethod('openWifiSettings');
      return currentL10n().actionWifiOpened;
    } catch (e) {
      debugPrint('[MobileActionsViewModel] openWifiSettings failed: $e');
      return currentL10n().actionWifiFailed(e.toString());
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
        return currentL10n().actionCalendarCreated(action.title);
      } else {
        return currentL10n().actionNoCalendarApp;
      }
    } catch (e) {
      debugPrint('[MobileActionsViewModel] createCalendar failed: $e');
      return currentL10n().actionCalendarFailed(e.toString());
    }
  }
}
