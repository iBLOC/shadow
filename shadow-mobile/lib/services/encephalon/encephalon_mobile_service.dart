import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:logging/logging.dart';

/// Encephalon（大脑）嵌入式运行时服务
///
/// 与桌面端 `shadow-desktop/src-tauri/src/lib.rs` 的
/// `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })` **同源**：
/// 同一套大脑（thalamus + ACP 总线 + telencephalon + 单一 neuron），
/// 只是跑在 Android App 进程内（libencephalon.so），而不是外部进程。
///
/// 与 `PrefrontalMobileService` 的关键差别：**推理不走 HTTP**。
/// `infer` 把 OpenAI 兼容请求体直接送进 neuron 的进程内 adapter 管线，
/// 返回 (HTTP 状态码, 响应体) —— 没有 socket、没有 CORS、不用等端口就绪。
///
/// 通信流程：
/// ```
/// Flutter UI
///   ↓ MethodChannel (com.ibloc.shadow/encephalon_runtime)
/// MainActivity (Kotlin)
///   ↓ JNI (nativeStart / nativeInfer / ...)
/// libencephalon.so (Rust, cdylib)
///   ↓ 进程内调用，不绕 socket
/// Embedded → thalamus + ACP 总线 + telencephalon + 单一 neuron
/// ```
class EncephalonMobileService {
  static final _log = Logger('EncephalonMobileService');

  /// MethodChannel 名称（与 Kotlin 端一致）。
  static const _channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  final int? preferredPort;

  int? _port;
  bool _isRunning = false;

  int? _agentPort;

  EncephalonMobileService({this.preferredPort});

  /// neuron HTTP 面（OpenAI 兼容）的端口。没在跑是 null。
  int? get port => _port;

  /// 端脑 HTTP 面（shadow API + A2A gateway + agent 管理）的端口。
  ///
  /// 移动端「改嵌大脑」之后，App 的会话 / agent / MCP / skills 就走这条面
  /// —— 同一套端脑跑在 App 进程里，不再依赖外部 telencephalon 进程。
  ///
  /// null = 大脑没在跑；0 = 大脑在跑但这条面没起来（此时 App 仍可用
  /// neuron 面做推理，agent 面只能退回外部端脑）。
  int? get agentPort => _agentPort;

  /// 运行时是否已启动。
  bool get isRunning => _isRunning;

  /// 设置 LLM 上游（OpenAI 兼容）。**必须在 [start] 之前调用。**
  ///
  /// neuron 的 remote 引擎只认环境变量，而 Android App 进程的环境变量由
  /// zygote 决定、宿主注入不了 —— 于是「手机上跑一个云端模型」只能走这条
  /// 程序化通道。注册进去之后，叶区会改用 [model] 这个 id 去请求 neuron's
  /// OpenAI 面。
  ///
  /// [baseUrl] 要**含 `/v1`**（neuron 拼的是 `{baseUrl}/chat/completions`）。
  /// [apiKey] 为空 = 不带 Authorization 头。三个都传空串 = 清空配置。
  Future<bool> setLlmProvider({
    required String baseUrl,
    required String apiKey,
    required String model,
  }) async {
    try {
      final result = await _channel.invokeMethod<bool>('setLlmProvider', {
        'baseUrl': baseUrl,
        'apiKey': apiKey,
        'model': model,
      });
      return result ?? false;
    } catch (e, stack) {
      _log.severe('设置 LLM 上游异常', e, stack);
      return false;
    }
  }

  /// 启动嵌入式大脑。
  ///
  /// [preferredPort] 是 neuron HTTP 面的期望端口；null / 0 表示随机分配。
  ///
  /// [dataDir] 是 App 的私有目录（Android 上是 `context.filesDir`）：
  /// 端脑的 flow（工作流）存储要写在那里 —— Android 没有 `$HOME`，
  /// 进程工作目录是 `/`（不可写），不给目录 flow 就写不进去。
  Future<bool> start({int? preferredPort, String? dataDir}) async {
    if (_isRunning) {
      _log.warning('Encephalon 已在运行中');
      return true;
    }

    try {
      _log.info('启动 Encephalon 嵌入式运行时...');
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'start',
        {
          'port': preferredPort ?? this.preferredPort ?? 0,
          if (dataDir != null && dataDir.isNotEmpty) 'dataDir': dataDir,
        },
      );

      if (result == null || result['success'] != true) {
        _log.severe('启动 Encephalon 失败: $result');
        return false;
      }

      _port = result['port'] as int?;
      _agentPort = result['agentPort'] as int?;
      _isRunning = true;
      _log.info(
        'Encephalon 嵌入式运行时已启动, 端口: $_port, 端脑面: ${_agentPort ?? 0}',
      );
      return true;
    } catch (e, stack) {
      _log.severe('启动 Encephalon 异常', e, stack);
      return false;
    }
  }

  /// 停止嵌入式大脑。
  Future<bool> stop() async {
    if (!_isRunning) {
      return true;
    }

    try {
      _log.info('停止 Encephalon 嵌入式运行时...');
      final result = await _channel.invokeMethod<bool>('stop');

      _isRunning = false;
      _port = null;
      _agentPort = null;

      _log.info('Encephalon 嵌入式运行时已停止, result: $result');
      return result ?? true;
    } catch (e, stack) {
      _log.severe('停止 Encephalon 异常', e, stack);
      return false;
    }
  }

  /// 健康检查。
  Future<bool> isHealthy() async {
    try {
      final result = await _channel.invokeMethod<bool>('isHealthy');
      return result ?? false;
    } catch (e) {
      _log.warning('健康检查失败: $e');
      return false;
    }
  }

  /// 获取运行时状态：running / port / agentPort / healthy。
  Future<Map<String, dynamic>> getStatus() async {
    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getStatus',
      );
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      _log.warning('获取状态失败: $e');
      return {
        'running': false,
        'port': 0,
        'agentPort': 0,
        'healthy': false,
      };
    }
  }

  /// 进程内推理。
  ///
  /// [path] 是 OpenAI 兼容路径，例如 `/v1/chat/completions`；
  /// [body] 是请求体原始字节（JSON）。
  ///
  /// 返回 null 表示调用失败（.so 没加载、运行时没起、native 报错）。
  Future<EncephalonInference?> infer({
    required String path,
    required Uint8List body,
  }) async {
    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'infer',
        {'path': path, 'body': body},
      );
      if (result == null) {
        return null;
      }

      final status = result['status'] as int? ?? 0;
      final raw = result['body'];
      final payload = raw is Uint8List
          ? raw
          : Uint8List.fromList(List<int>.from(raw as List? ?? const []));

      return EncephalonInference(status: status, body: payload);
    } catch (e, stack) {
      _log.severe('进程内推理异常', e, stack);
      return null;
    }
  }

  /// 释放资源（停止运行时）。
  Future<void> dispose() async {
    await stop();
  }
}

/// 推理结果：HTTP 状态码 + 原始响应体。
class EncephalonInference {
  final int status;
  final Uint8List body;

  const EncephalonInference({required this.status, required this.body});

  /// 2xx 视为成功。
  bool get isSuccess => status >= 200 && status < 300;

  /// 响应体按 UTF-8 解码（宽容模式 —— 模型偶尔会吐非 UTF-8 片段，
  /// 严格模式会直接抛，那不该让一次推理整体失败）。
  String get bodyText => utf8.decode(body, allowMalformed: true);
}
