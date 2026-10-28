import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../l10n/current_l10n.dart';
import 'encephalon_mobile_service.dart';

/// Encephalon 移动端状态
class EncephalonMobileState {
  final EncephalonMobileStatus status;
  final int? port;
  final String? errorMessage;

  const EncephalonMobileState({
    this.status = EncephalonMobileStatus.stopped,
    this.port,
    this.errorMessage,
  });

  EncephalonMobileState copyWith({
    EncephalonMobileStatus? status,
    int? port,
    String? errorMessage,
  }) {
    return EncephalonMobileState(
      status: status ?? this.status,
      port: port ?? this.port,
      errorMessage: errorMessage,
    );
  }
}

/// Encephalon 移动端状态机
enum EncephalonMobileStatus { stopped, starting, running, stopping, error }

/// Encephalon 移动端 Notifier
class EncephalonMobileNotifier extends StateNotifier<EncephalonMobileState> {
  static final _log = Logger('EncephalonMobileNotifier');

  final EncephalonMobileService _service;

  EncephalonMobileNotifier(this._service)
      : super(const EncephalonMobileState()) {
    _init();
  }

  Future<void> _init() async {
    // 检查运行时是否已经在跑（比如 App 被系统重建后进程还在）。
    try {
      final status = await _service.getStatus();
      if (status['running'] == true) {
        state = state.copyWith(
          status: EncephalonMobileStatus.running,
          port: status['port'] as int?,
        );
        _log.info('检测到嵌入式大脑已在运行, 端口: ${state.port}');
      }
    } catch (e) {
      _log.fine('初始化检查失败: $e');
    }
  }

  /// 启动嵌入式大脑
  Future<bool> start() async {
    if (state.status == EncephalonMobileStatus.running) {
      _log.warning('嵌入式大脑已在运行中');
      return true;
    }

    state = state.copyWith(
      status: EncephalonMobileStatus.starting,
      errorMessage: null,
    );

    try {
      final success = await _service.start();
      if (success) {
        state = state.copyWith(
          status: EncephalonMobileStatus.running,
          port: _service.port,
          errorMessage: null,
        );
        _log.info('嵌入式大脑启动成功, 端口: ${state.port}');
        return true;
      } else {
        state = state.copyWith(
          status: EncephalonMobileStatus.error,
          errorMessage: currentL10n().encephalonStartFailed,
        );
        return false;
      }
    } catch (e, stack) {
      _log.severe('启动嵌入式大脑失败', e, stack);
      state = state.copyWith(
        status: EncephalonMobileStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// 停止嵌入式大脑
  Future<bool> stop() async {
    if (state.status == EncephalonMobileStatus.stopped) {
      return true;
    }

    state = state.copyWith(status: EncephalonMobileStatus.stopping);

    try {
      await _service.stop();
      state = const EncephalonMobileState();
      _log.info('嵌入式大脑已停止');
      return true;
    } catch (e, stack) {
      _log.severe('停止嵌入式大脑失败', e, stack);
      state = state.copyWith(
        status: EncephalonMobileStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// 健康检查
  Future<bool> healthCheck() async {
    return _service.isHealthy();
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }
}

/// 默认服务实例 Provider
final encephalonMobileServiceProvider = Provider<EncephalonMobileService>((ref) {
  return EncephalonMobileService();
});

/// Encephalon 移动端 Provider
final encephalonMobileProvider =
    StateNotifierProvider<EncephalonMobileNotifier, EncephalonMobileState>((ref) {
  final service = ref.watch(encephalonMobileServiceProvider);
  return EncephalonMobileNotifier(service);
});

/// 运行时状态 Provider
final encephalonMobileStatusProvider = Provider<EncephalonMobileStatus>((ref) {
  return ref.watch(encephalonMobileProvider).status;
});

/// 端口 Provider
final encephalonMobilePortProvider = Provider<int?>((ref) {
  return ref.watch(encephalonMobileProvider).port;
});
