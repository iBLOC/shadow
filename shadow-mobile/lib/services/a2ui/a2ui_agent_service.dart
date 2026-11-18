import 'dart:async';

import 'package:a2ui_core/a2ui_core.dart';
import 'package:a2ui_flutter/a2ui_flutter.dart';
// ⚠️ **基础目录在另一个库文件里** —— `basicCatalog()` 不在
// `package:a2ui_flutter/a2ui_flutter.dart` 的导出面 ⇒ 必须单独 import。
import 'package:a2ui_flutter/basic_catalog.dart';
import 'package:logging/logging.dart';

import 'a2ui_surface_events.dart';
import 'shadow_catalog.dart';
import 'shadow_key_sse_transport.dart';

/// 端脑连上了吗？
enum ConnectionStatus { disconnected, connecting, connected, error }

/// A2UI 的客户端服务 —— **官方协议栈 ＋ 自己写的传输**。
///
/// ## 它做什么
///
/// ❶ 把端脑吐的 **A2UI v1.0** 消息喂进官方 `MessageProcessor`
///    ⇒ ⇒ surface 才**存在**（不喂 ⇒ 界面是空白 ⇒ 失败长得像成功）。
/// ❷ 把「端脑的原话」与「端脑为什么失败」**送到界面上**
///    （以前这两样只进日志 ⇒ 手机上彻底消失）。
/// ❸ 维护 surface 名单（新增/删除都要**发一个新的 List** ——
///    `List == List` 是引用比较 ⇒ 发同一个对象 ⇒ 监听者可能不刷新）。
class A2uiAgentService {
  static final _logger = Logger('A2uiAgentService');

  late final MessageProcessor<ComponentImplementation> _processor;
  late final ShadowKeySseTransport _transport;
  final List<Subscription> _subscriptions = <Subscription>[];

  final List<String> _surfaceIds = <String>[];
  /// 清轮时删面 ⇒ ⇒ 抑制 `onSurfaceDeleted` 里那次发送。
  bool _suppressSurfaceEvents = false;
  final _surfaceIdsController = StreamController<List<String>>.broadcast();
  final _textReplyController = StreamController<String?>.broadcast();
  final _errorReasonController = StreamController<String?>.broadcast();
  final _connectionStatusController =
      StreamController<ConnectionStatus>.broadcast();

  /// 端脑的原话 —— 它这次没有画界面，而是回了一段话。
  String? _lastTextReply;

  /// 端脑这次**为什么失败**（401 / 网络 / 版本没对上）。
  String? _lastError;

  ConnectionStatus _connectionStatus = ConnectionStatus.disconnected;

  A2uiAgentService({
    required String serverUrl,
    required String? Function()? shadowKeyProvider,
    String? Function()? adminTokenProvider,
    String? Function()? localeProvider,
  }) {
    _transport = ShadowKeySseTransport(
      url: serverUrl,
      shadowKeyProvider: shadowKeyProvider,
      adminTokenProvider: adminTokenProvider,
      localeProvider: localeProvider,
    );
    // ⚠️ **两个目录都要注册** —— 官方基础目录（标准组件）＋
    // 我们自建的（两个业务组件）⇒ ⇒ v1.0 的「一个面里混多个目录」靠的就是它。
    _processor = MessageProcessor<ComponentImplementation>(
      catalogs: <Catalog<ComponentImplementation, FunctionImplementation>>[
        basicCatalog(),
        shadowCatalog(),
      ],
      defaultVersion: A2uiProtocolVersion.v1_0,
      // ⚠️ 一条坏消息不许把整批带崩 ⇒ 只报不抛（错误走 onError）。
      reportErrorsOnly: true,
    );
    _subscriptions.add(
      _processor.model.onSurfaceCreated.subscribe((surface) {
        _logger.info('Surface created: ${surface.id}');
        // ⚠️ 同一个 surface **重新**创建时**不能追加** ——
        // A2UI 的语义是「同一个界面被更新」，不是「每次请求开一个新界面」。
        if (!_surfaceIds.contains(surface.id)) {
          _surfaceIds.add(surface.id);
        }
        _emit(_surfaceIdsController, List.of(_surfaceIds));
      }),
    );
    _subscriptions.add(
      _processor.model.onSurfaceDeleted.subscribe((id) {
        _logger.info('Surface deleted: $id');
        _surfaceIds.remove(id);
        // ⚠️ **清轮时删面** ⇒ ⇒ 那次删除不该**再发一次空列表**
        //    （空列表＝「这一轮开始了」⇒ ⇒ 只该发一次）。
        if (_suppressSurfaceEvents) return;
        _emit(_surfaceIdsController, List.of(_surfaceIds));
      }),
    );
    _subscriptions.add(
      _processor.model.onError.subscribe((Object error) {
        _logger.warning('A2UI 协议层报错：$error');
        // ⚠️ **协议层的错也必须说给界面听** —— 只进日志 ⇒ ⇒ 界面上是
        //    「已连接，但端脑这次没给出界面」⇒ ⇒ **失败长得像成功**。
        //    （官方 SDK 的校验错只走 onError 这一个出口 ⇒ ⇒ 这里不接，
        //    那一格就永远是静的。）
        _reportFailure('A2UI 协议层拒收了这条消息：$error');
      }),
    );
  }

  Stream<List<String>> get surfaceIdsStream => _surfaceIdsController.stream;
  List<String> get surfaceIds => List.unmodifiable(_surfaceIds);

  Stream<String?> get textReplyStream => _textReplyController.stream;
  String? get lastTextReply => _lastTextReply;

  Stream<String?> get errorReasonStream => _errorReasonController.stream;
  String? get lastError => _lastError;

  Stream<ConnectionStatus> get connectionStatusStream =>
      _connectionStatusController.stream;
  ConnectionStatus get connectionStatus => _connectionStatus;

  /// 按 id 取 surface（渲染用）。
  SurfaceModel<ComponentImplementation>? surfaceById(String id) =>
      _processor.model.getSurface(id);

  /// 往广播流里发一条 —— **已经关了就当作没这回事**。
  ///
  /// ⚠️ 为什么需要它：`dispose()` 会关掉 transport 的 `http.Client`
  /// ⇒ 在飞的请求当场断 ⇒ 那个失败在 dispose 之后才回来
  /// ⇒ 往**已经关掉**的流里写 ⇒ 「Bad state: Cannot add new events after
  /// calling close」⇒ **未处理异常** ⇒ 真机上就是「App 崩了」。
  void _emit<T>(StreamController<T> controller, T value) {
    if (controller.isClosed) return;
    controller.add(value);
  }

  void _updateConnectionStatus(ConnectionStatus status) {
    if (_connectionStatus != status) {
      _connectionStatus = status;
      _emit(_connectionStatusController, status);
    }
  }

  void _reportFailure(Object error) {
    _logger.severe('A2UI 请求失败：$error');
    _lastError = error.toString();
    _emit(_errorReasonController, _lastError);
    _updateConnectionStatus(ConnectionStatus.error);
  }

  /// 把上一轮的结果清掉 —— 否则上一轮的原话 / 失败原因会留在界面上
  /// ⇒ 让人以为这一轮端脑又说了那句话 / 又失败了一次。
  void _resetRound() {
    _lastTextReply = null;
    _emit(_textReplyController, null);
    _lastError = null;
    _emit(_errorReasonController, null);
    // ⚠️ **上一轮的 surface 也要清掉** —— 一次请求 = 一次回答。
    // 否则端脑这次回**纯文本**时，界面还在渲染**上一轮**的 surface
    // ⇒ ⇒ 端脑的原话又被**盖住**了。
    _clearSurfaces();
  }

  /// 把上一轮的面从模型里删掉。
  ///
  /// ⚠️ **官方 SDK 不许同一个面被重复 create** ⇒ ⇒ 上一轮的面必须
  /// **从模型里删掉** ⇒ ⇒ 否则这一轮的 createSurface 会被拒
  /// ⇒ ⇒ 那一轮「没有界面」⇒ ⇒ 失败长得像成功。
  ///
  /// ⚠️ **两个坑**（都踩过）：
  /// ❶ 删面会触发 `onSurfaceDeleted` ⇒ ⇒ 回调里会把名单**改掉**
  ///     ⇒ ⇒ **不能一边遍历一边改**（并发修改异常）。
  /// ❷ 那次回调还会**再发一次空列表** ⇒ ⇒ 「空列表＝这一轮开始」
  ///     就有了第二种含义 ⇒ ⇒ 这里**先清名单**并**抑制**那次发送
  ///     ⇒ ⇒ 空列表**只发一次**。
  void _clearSurfaces() {
    if (_surfaceIds.isEmpty) return;
    final stale = List<String>.of(_surfaceIds);
    _surfaceIds.clear();
    _suppressSurfaceEvents = true;
    for (final id in stale) {
      _processor.model.deleteSurface(id);
    }
    _suppressSurfaceEvents = false;
    _emit(_surfaceIdsController, List.of(_surfaceIds));
  }

  /// 发一句话（面板那个输入框）。
  void sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _logger.info('Sending message: $text');
    _resetRound();
    _updateConnectionStatus(ConnectionStatus.connecting);
    unawaited(_run(_requestBody(text: text)));
  }

  /// 跑一次请求：收事件 → 喂 processor → 把原话/失败**说出去**。
  Future<void> _run(Map<String, Object?> body) async {
    try {
      final events = await _collect(body);
      // ⚠️ **旧形状 = 版本没对上** ⇒ 必须**响亮地报**，
      // 不许静默忽略（否则界面「什么都没有」⇒ 失败长得像成功）。
      final legacy = a2uiLegacyMessagesFromEvents(events);
      if (legacy.isNotEmpty) {
        _reportFailure(
          '对端回了 A2UI v0.8 的旧形状（本客户端声明的是 v1.0）',
        );
        return;
      }
      // ⚠️ **载荷发成了 JSON 字符串** ⇒ ⇒ 官方 SDK 的提取器只认 Map
      //    ⇒ ⇒ 整条消息被跳过 ⇒ ⇒ 界面上「什么都没有」
      //    ⇒ ⇒ **失败长得像成功** ⇒ ⇒ 必须**响亮地报出来**
      //    （桌面端那一侧已经这么做了 ⇒ ⇒ 两端一致：都拒收，但都说真话）。
      if (hasStringA2uiPayload(events)) {
        _reportFailure(
          '端脑把 A2UI 载荷发成了 JSON 字符串（官方 v1.0 要求是对象）',
        );
        return;
      }
      ingestSurfaceEvents(events);
      // ⚠️ **协议层报错 ⇒ 不许再报「已连接」** —— 那一格必须说真话。
      if (_lastError != null) {
        _updateConnectionStatus(ConnectionStatus.error);
        return;
      }
      final texts = a2uiTextPartsFromEvents(events);
      if (texts.isNotEmpty) {
        _lastTextReply = texts.join(' ').trim();
        _emit(_textReplyController, _lastTextReply);
      }
      _updateConnectionStatus(ConnectionStatus.connected);
    } catch (error) {
      _reportFailure(error);
    }
  }

  Future<List<Map<String, Object?>>> _collect(
    Map<String, Object?> body,
  ) async {
    final events = <Map<String, Object?>>[];
    await for (final event in _transport.sendStream(body)) {
      events.add(event);
    }
    return events;
  }

  /// 按视图取 surface 的**原始 A2A 事件**。
  ///
  /// ❶ **取回原始事件** —— 客户端工具 `show_a2ui_surface` 要的就是这一份
  ///    **逐字同形**的东西 ⇒ ⇒ 两端吃的是**同一批字节**。
  /// ❷ **喂进 processor** —— A2UI 的界面不是「HTTP 回来的」，
  ///    而是「**消息喂进 processor 之后才存在**」的 ⇒ ⇒ 不喂 ⇒ 空白。
  Future<List<Map<String, Object?>>> fetchSurfaceEvents(String view) async {
    try {
      final events = await _collect(_requestBody(view: view));
      ingestSurfaceEvents(events);
      return events;
    } catch (error) {
      _reportFailure(error);
      rethrow;
    }
  }

  /// 把一批**原始 A2A 事件**喂进 processor —— surface 才存在。
  void ingestSurfaceEvents(List<Map<String, Object?>> events) {
    final messages = a2uiV1MessagesFromEvents(events);
    if (messages.isEmpty) return;
    _processor.processMessages(messages);
  }

  /// 把一批 **AG-UI 承载的 ops** 喂进 processor —— surface 才存在。
  ///
  /// ⚠️ 这是**官方 activity 的 content**（A2UI v1.0 消息数组）⇒ ⇒
  /// **零翻译** ⇒ ⇒ 端脑不合规就是官方 SDK 拒 ⇒ ⇒ 界面如实不画。
  ///
  /// ⚠️ **上一轮的面要先删** —— 官方 SDK 不许同一个面被重复 create
  /// ⇒ ⇒ 否则这一轮的 createSurface 会被拒 ⇒ ⇒ 那一轮「没有界面」
  /// ⇒ ⇒ **失败长得像成功**。
  void ingestA2uiOps(List<Map<String, Object?>> ops) {
    if (ops.isEmpty) return;
    _clearSurfaces();
    _processor.processMessages(ops);
  }

  /// 「我要看哪个视图」的那次请求体。
  ///
  /// ⚠️ **与桌面端同一处形状** ⇒ ⇒ 两端问端脑的方式一样。
  ///
  /// ⚠️ 视图名**同时**写在两处（`metadata.a2ui.view` 与
  /// `parts[].text` 的 `a2ui:<view>`）—— 端脑两处都认。
  ///
  /// ⚠️ **能力协商对象必须带** —— `a2uiRendererCapabilities["1.0"]`
  /// 是官方规范里「渲染器报自己支持哪些版本/目录」的那一格
  /// ⇒ ⇒ 端脑按它决定吐 v1.0。
  Map<String, Object?> _requestBody({String? view, String? text}) {
    final metadata = <String, Object?>{
      'a2uiRendererCapabilities': <String, Object?>{
        '1.0': <String, Object?>{
          'supportedCatalogIds': <String>[basicCatalogId, shadowCatalogId],
        },
      },
    };
    if (view != null) {
      metadata['a2ui'] = <String, Object?>{'view': view};
    }
    return <String, Object?>{
      'jsonrpc': '2.0',
      'method': 'message/stream',
      'params': <String, Object?>{
        'configuration': null,
        'metadata': null,
        'message': <String, Object?>{
          'kind': 'message',
          'messageId': 'shadow-view-${DateTime.now().microsecondsSinceEpoch}',
          'role': 'user',
          'parts': <Map<String, Object?>>[
            <String, Object?>{
              'kind': 'text',
              'text': view != null ? 'a2ui:$view' : (text ?? ''),
            },
          ],
          'metadata': metadata,
        },
      },
    };
  }

  /// 关掉一切（连接、流、processor）。
  Future<void> dispose() async {
    for (final subscription in _subscriptions) {
      subscription.unsubscribe();
    }
    _subscriptions.clear();
    _processor.dispose();
    // ⚠️ transport 带着 `http.Client` ⇒ 不关 ⇒ socket 泄漏。
    _transport.close();
    await _surfaceIdsController.close();
    await _connectionStatusController.close();
    await _textReplyController.close();
    await _errorReasonController.close();
  }
}
