import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:logging/logging.dart';

import '../../l10n/current_l10n.dart';

/// 后台常驻服务 —— Android 前台服务保活的 Dart 侧薄封装。
///
/// 客户端要求「支持后台运行」：端脑（libencephalon.so）与 MNN 引擎都活在
/// App 进程里，一切后台/息屏进程就可能被系统掐掉。前台服务 + 常驻通知是
/// Android 的标准保活契约（Android 14+ 必须带 dataSync 类型，manifest 已配对）。
///
/// 本类只管**生命周期**（起/停/状态/权限），不持有任何业务 ——
/// 它保活的是**整个进程**，进程活着，端脑、引擎、BLE、USB 音频就都活着。
class BackgroundRunService {
  static final Logger _log = Logger('BackgroundRunService');

  // 单例
  static final BackgroundRunService _instance =
      BackgroundRunService._internal();
  factory BackgroundRunService() => _instance;
  BackgroundRunService._internal();

  /// 常驻通知的 id —— 固定值：重启服务（updateService）时系统按 id 找回
  /// 同一条通知；换 id 会留下僵尸通知。
  static const int _serviceId = 9301;

  /// 通知「停止」按钮的 wire id（TaskHandler 按 it 分派）。
  static const String _stopButtonId = 'stop';

  /// 心跳间隔 —— onRepeatEvent 的触发周期。它只做**可观测性**
  /// （往 UI isolate 发一条心跳），不做健康检查（见 handler 的注释）。
  static const Duration _heartbeatInterval = Duration(minutes: 5);

  // ⚠️ 插件的 isInitialized 标记是 @visibleForTesting —— 幂等性自己记。
  bool _initialized = false;

  /// 幂等初始化 —— start() 前必须先走这一步。
  ///
  /// ⚠️ iOS 侧未开工（ios/ 连麦克风用途声明都没有），传默认选项即可：
  /// 插件在 iOS 上不启动前台服务，不会产生副作用。
  Future<void> ensureInitialized() {
    if (_initialized) return Future.value();
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'shadow_background',
        channelName: currentL10n().backgroundKeepAlive,
        channelDescription: currentL10n().backgroundKeepAliveHint,
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
        // 常驻通知不该打断用户：不响、不震、不闪角标，只在内容变化时更新。
        enableVibration: false,
        playSound: false,
        showBadge: false,
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        // 心跳（可观测性），不做轮询任务。
        eventAction: ForegroundTaskEventAction.repeat(
          _heartbeatInterval.inMilliseconds,
        ),
        // ⚠️ **划掉任务 ≠ 停止** ——「常驻」语义：服务继续跑，
        // 真要停走设置开关或通知上的「停止」按钮。
        stopWithTask: false,
        // 息屏后 CPU 得继续跑（推理/流式都在后台发生）。
        allowWakeLock: true,
        // 开机自启不做 —— 那是另一档授权，不该默认带走。
        autoRunOnBoot: false,
      ),
    );
    _initialized = true;
    return Future.value();
  }

  /// 起前台服务（幂等语义由调用方保证 —— 先看 [isRunning]）。
  ///
  /// 返回 true = 服务已在运行；false = 权限被拒或系统拒绝启动
  /// （错误进日志，调用方据此把设置里的状态徽章翻成「未运行」）。
  Future<bool> start() async {
    await ensureInitialized();
    if (await isRunning) return true;

    // Android 13+ 不批 POST_NOTIFICATIONS ⇒ 通知不显示，但服务照样跑。
    // 先问一次，用户拒了不阻塞 ——「保活」不依赖「看得见」。
    final permission = await FlutterForegroundTask.checkNotificationPermission();
    if (permission != NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }

    final l10n = currentL10n();
    final result = await FlutterForegroundTask.startService(
      serviceId: _serviceId,
      serviceTypes: [ForegroundServiceTypes.dataSync],
      notificationTitle: l10n.backgroundServiceTitle,
      notificationText: l10n.backgroundServiceText,
      notificationButtons: [
        NotificationButton(id: _stopButtonId, text: l10n.backgroundStop),
      ],
      callback: backgroundTaskCallback,
    );
    final ok = result is ServiceRequestSuccess;
    if (ok) {
      _log.info('前台服务已启动（id=$_serviceId, type=dataSync）');
    } else {
      _log.warning('前台服务启动失败: $result');
    }
    return ok;
  }

  /// 停前台服务（设置开关 / 通知按钮都汇到这里）。
  Future<bool> stop() async {
    if (!await isRunning) return true;
    final result = await FlutterForegroundTask.stopService();
    final ok = result is ServiceRequestSuccess;
    _log.info(ok ? '前台服务已停止' : '前台服务停止失败: $result');
    return ok;
  }

  Future<bool> get isRunning => FlutterForegroundTask.isRunningService;

  /// 已经在电池优化白名单里？（ true = 系统不会对本进程做激进省电。）
  Future<bool> get isIgnoringBatteryOptimizations =>
      FlutterForegroundTask.isIgnoringBatteryOptimizations;

  /// 弹系统对话框申请加入电池优化白名单。
  ///
  /// ⚠️ 只在用户点「申请」时调用 —— 这是**另一档授权**，不捆在
  /// 「后台常驻」开关上默认弹。
  Future<bool> requestIgnoreBatteryOptimization() =>
      FlutterForegroundTask.requestIgnoreBatteryOptimization();
}

/// 通知按钮 wire id → 后台常驻（供设置页展示用，别在别处发明字符串）。
const String backgroundStopButtonId = 'stop';

/// 任务入口 —— **必须是顶层函数**（后台 isolate 反射不了闭包）。
@pragma('vm:entry-point')
void backgroundTaskCallback() {
  FlutterForegroundTask.setTaskHandler(BackgroundKeepAliveHandler());
}

/// 常驻期间的空转 handler。
///
/// ⚠️ **这里不做端脑健康检查**：TaskHandler 跑在独立的背景 isolate 里，
/// 而 MethodChannel 的 handler 注册在主 isolate 的 messenger 上 ——
/// 背景 isolate 里调 `EncephalonMobileService` 的通道只会拿到
/// notImplemented。保活的意义在「进程活着」，进程活着这件事由
/// 系统用前台服务契约保证，不需要这里再轮询谁。
class BackgroundKeepAliveHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    FlutterForegroundTask.sendDataToMain(
      const <String, Object>{'event': 'started'},
    );
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // 心跳：让 UI isolate 知道服务还活着（设置页状态徽章据此翻绿）。
    FlutterForegroundTask.sendDataToMain(<String, Object>{
      'event': 'heartbeat',
      'timestamp': timestamp.millisecondsSinceEpoch,
    });
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    FlutterForegroundTask.sendDataToMain(
      const <String, Object>{'event': 'stopped'},
    );
  }

  @override
  void onNotificationButtonPressed(String id) {
    if (id == backgroundStopButtonId) {
      // 通知上的「停止」= 用户明确不要常驻 ⇒ 直接停服务；
      // UI isolate 收到 stopped 事件后同步设置页的状态。
      FlutterForegroundTask.stopService();
    }
  }
}
