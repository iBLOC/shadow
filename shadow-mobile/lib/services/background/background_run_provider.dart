import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../app_config_service.dart';
import 'background_run_service.dart';

/// 后台常驻的状态（设置页 + 状态徽章读它）。
class BackgroundRunState {
  /// 持久开关（AppConfigService.backgroundKeepAlive）。
  final bool enabled;

  /// 前台服务此刻在不在跑。
  final bool running;

  /// 本进程是否已在电池优化白名单里。
  final bool batteryExempt;

  const BackgroundRunState({
    this.enabled = true,
    this.running = false,
    this.batteryExempt = false,
  });

  BackgroundRunState copyWith({
    bool? enabled,
    bool? running,
    bool? batteryExempt,
  }) {
    return BackgroundRunState(
      enabled: enabled ?? this.enabled,
      running: running ?? this.running,
      batteryExempt: batteryExempt ?? this.batteryExempt,
    );
  }
}

/// 后台常驻 Notifier —— 开关的**唯一写入口**（设置页、
/// 通知上的「停止」按钮、端脑启动成功的自动拉起，都汇到这一层）。
class BackgroundRunNotifier extends StateNotifier<BackgroundRunState> {
  static final _log = Logger('BackgroundRunNotifier');

  final BackgroundRunService _service;
  final AppConfigService _config;

  BackgroundRunNotifier(this._service, this._config)
    : super(const BackgroundRunState()) {
    // 构造即恢复：开关读持久配置，运行/白名单状态问系统。
    state = BackgroundRunState(enabled: _config.backgroundKeepAlive);
    // 背景 isolate 的事件（started / heartbeat / stopped）⇒ 状态徽章跟着翻。
    FlutterForegroundTaskBridge.subscribe(_onTaskEvent);
    // 状态是**系统侧**的事实 ⇒ 只能异步刷新，不能在构造里 await。
    refresh();
  }

  Future<void> _onTaskEvent(Object data) async {
    if (data is Map && data['event'] is String) {
      await refresh();
    }
  }

  /// 把系统侧的真实状态搬进 state（服务在不在跑 / 白名单进没进）。
  Future<void> refresh() async {
    try {
      final running = await _service.isRunning;
      final batteryExempt = await _service.isIgnoringBatteryOptimizations;
      if (!mounted) return;
      state = state.copyWith(running: running, batteryExempt: batteryExempt);
    } catch (e) {
      // 非 Android 平台（测试 / 桌面 web 预览）没有这些通道 ——
      // 静默保持默认值，别让设置页因为一次探测失败而炸。
      _log.fine('刷新后台服务状态失败: $e');
    }
  }

  /// 设置页开关的入口：落盘 ＋ 立刻起/停服务（状态随后 refresh）。
  Future<void> setEnabled(bool value) async {
    state = state.copyWith(enabled: value);
    await _config.setBackgroundKeepAlive(value);
    try {
      if (value) {
        await _service.start();
      } else {
        await _service.stop();
      }
    } catch (e) {
      _log.warning('切后台常驻开关失败: $e');
    }
    await refresh();
  }

  /// 「端脑启动成功」那边的自动拉起入口：只有**开着**才拉。
  ///
  /// ⚠️ 失败不抛 —— 保活是增强，不能因为它把大脑启动流程拖红。
  Future<void> ensureRunningIfEnabled() async {
    if (!state.enabled) return;
    try {
      if (!await _service.isRunning) {
        await _service.start();
      }
      await refresh();
    } catch (e) {
      _log.warning('自动拉起前台服务失败: $e');
    }
  }

  /// 电池优化白名单入口（设置页那一行）。
  Future<void> requestBatteryExemption() async {
    try {
      await _service.requestIgnoreBatteryOptimization();
    } catch (e) {
      _log.warning('申请电池优化白名单失败: $e');
    }
    await refresh();
  }

  @override
  void dispose() {
    FlutterForegroundTaskBridge.unsubscribe(_onTaskEvent);
    super.dispose();
  }
}

/// 背景 isolate ⇄ UI isolate 的数据通道的一层薄桥 ——
/// 把 `FlutterForegroundTask.addTaskDataCallback` 的全局注册表
/// 包成可订阅/可退订的形状（notifier 生命周期与它对齐）。
class FlutterForegroundTaskBridge {
  static final List<void Function(Object)> _listeners = [];

  /// ⚠️ 必须在 main() 里、runApp 之前调（插件要求通信端口早于服务启动）。
  static void initCommunicationPort() {
    FlutterForegroundTask.initCommunicationPort();
    FlutterForegroundTask.addTaskDataCallback(_dispatch);
  }

  static void _dispatch(Object data) {
    for (final listener in List.of(_listeners)) {
      try {
        listener(data);
      } catch (_) {
        // 单个监听者炸了不许连累别的。
      }
    }
  }

  static void subscribe(void Function(Object) listener) =>
      _listeners.add(listener);

  static void unsubscribe(void Function(Object) listener) =>
      _listeners.remove(listener);
}

/// 默认服务实例 Provider
final backgroundRunServiceProvider = Provider<BackgroundRunService>((ref) {
  return BackgroundRunService();
});

/// 后台常驻 Provider
final backgroundRunProvider =
    StateNotifierProvider<BackgroundRunNotifier, BackgroundRunState>((ref) {
      final service = ref.watch(backgroundRunServiceProvider);
      return BackgroundRunNotifier(service, AppConfigService());
    });
