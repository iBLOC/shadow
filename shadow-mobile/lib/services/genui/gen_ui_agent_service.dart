import 'dart:async';
import 'package:genui/genui.dart';
import 'package:genui_a2ui/genui_a2ui.dart';
import 'package:logging/logging.dart';

// ⚠️ **实现级导入**：上游**不导出**异常类型
// （`lib/genui_a2ui.dart` 只导出 connector 与 content generator）
// ⇒ 而我们要**按类型**读出 HTTP 状态码
// （那是**协议值**，不翻译 ⇒ 承「协议值留在英文」那条）。
// ignore_for_file: implementation_imports
import 'package:genui_a2ui/src/a2a/client/a2a_exception.dart';

import 'shadow_key_sse_transport.dart';

/// Connection status for A2A server
enum ConnectionStatus { disconnected, connecting, connected, error }

class GenUIAgentService {
  static final _logger = Logger('GenUIAgentService');

  late final A2uiMessageProcessor _messageProcessor;
  late final A2uiContentGenerator _contentGenerator;
  late final GenUiConversation _conversation;

  /// 端脑面的钥匙是怎么带出去的 —— 见
  /// [ShadowKeySseTransport] 的注释（为什么必须**请求时现读**）。
  late final ShadowKeySseTransport _transport;

  final List<String> _surfaceIds = [];
  final _surfaceIdsController = StreamController<List<String>>.broadcast();

  /// 端脑的**原话** —— 它这次没有画界面，而是回了一段话。
  ///
  /// ⚠️ 以前这段话**只进了日志**（`_logger.info`）⇒ 在手机上**彻底消失**
  /// ⇒ 用户看到的是一个空面板，分不清是「没内容」还是「端脑说了话」。
  final _textReplyController = StreamController<String?>.broadcast();

  /// 端脑这次**为什么失败**（401 / 网络 / A2A 任务失败）。
  ///
  /// ⚠️ 以前只存进 [_lastError] ⇒ **从来没有显示过** ⇒
  /// 界面把「失败」说成「未连接到端脑」（失败长得像没连上）。
  final _errorReasonController = StreamController<String?>.broadcast();

  ConnectionStatus _connectionStatus = ConnectionStatus.disconnected;
  final _connectionStatusController =
      StreamController<ConnectionStatus>.broadcast();
  String? _lastError;
  String? _lastTextReply;

  Stream<List<String>> get surfaceIdsStream => _surfaceIdsController.stream;
  List<String> get surfaceIds => List.unmodifiable(_surfaceIds);

  /// 端脑的原话（最近一次）。
  Stream<String?> get textReplyStream => _textReplyController.stream;
  String? get lastTextReply => _lastTextReply;

  /// 端脑这次失败的原因（最近一次）。
  Stream<String?> get errorReasonStream => _errorReasonController.stream;

  Stream<ConnectionStatus> get connectionStatusStream =>
      _connectionStatusController.stream;
  ConnectionStatus get connectionStatus => _connectionStatus;
  String? get lastError => _lastError;

  /// 往广播流里发一条 —— **已经关了就当作没这回事**。
  ///
  /// ⚠️ 为什么需要它：
  /// `dispose()` 会关掉 transport 的 `http.Client`（⇒ **在飞的请求当场断**）
  /// ⇒ 那次失败**在 dispose 之后**才回来 ⇒ ⇒ 它要往**已经关掉**的流里写
  /// ⇒ ⇒ 「Bad state: Cannot add new events after calling close」
  /// ⇒ ⇒ **未处理异常** ⇒ 真机上就是「App 崩了」
  /// —— 而它崩在一条**已经在收尾**的链路上（用户只是离开了 A2UI 面板）。
  ///
  /// ⚠️ 以前只有 `_reportFailure` 一处带了 `isClosed` 判断
  /// ⇒ 四个广播流里**其余**的迟到事件照样炸 ⇒ ⇒ 这里收成**一条规则、一处实现**。
  void _emit<T>(StreamController<T> controller, T value) {
    if (controller.isClosed) return;
    controller.add(value);
  }

  GenUiConversation get conversation => _conversation;
  A2uiMessageProcessor get messageProcessor => _messageProcessor;

  /// [shadowKeyProvider] 给出端脑面的钥匙（`X-Shadow-Key`）。
  ///
  /// ⚠️ 它是**回调**而不是值 —— 因为钥匙的设置时机与本服务的构造时机
  /// 是错开的（嵌入式大脑先给地址、宿主才给钥匙）⇒ 构造时取值会造出
  /// 一个「指着新地址、却还没带钥匙」的窗口 ⇒ 请求 401。
  /// 详见 [ShadowKeySseTransport]。
  ///
  /// 传 null ⇒ 不带这个头（端脑在开发模式下也放行）。
  /// [localeProvider] 给出用户当前的语言（`Accept-Language`）。
  ///
  /// ⚠️ 它是**回调**而不是值 —— 系统语言可以在 App 运行时改
  /// ⇒ 构造时取值 ⇒ 用户换语言后界面仍是旧语言。
  /// 详见 [ShadowKeySseTransport]。
  GenUIAgentService({
    required String serverUrl,
    Catalog? catalog,
    String? Function()? shadowKeyProvider,
    String? Function()? localeProvider,
  }) {
    _logger.info('Initializing GenUIAgentService with server: $serverUrl');

    _messageProcessor = A2uiMessageProcessor(
      catalogs: [catalog ?? CoreCatalogItems.asCatalog()],
    );

    // ⚠️ 必须**自己造** connector：默认那个把请求头焊死在
    // `A2uiAgentConnector` 内部（`a2ui_agent_connector.dart:36-40`），
    // 外面加不了钥匙。而端脑的 `/a2a` 现在**要钥匙**
    // （`telencephalon/src/api/a2ui_gateway.rs`）。
    _transport = ShadowKeySseTransport(
      url: serverUrl,
      shadowKeyProvider: shadowKeyProvider,
      localeProvider: localeProvider,
    );

    _contentGenerator = A2uiContentGenerator(
      serverUrl: Uri.parse(serverUrl),
      connector: buildShadowKeyConnector(
        serverUrl: serverUrl,
        transport: _transport,
      ),
    );

    _conversation = GenUiConversation(
      contentGenerator: _contentGenerator,
      a2uiMessageProcessor: _messageProcessor,
      onSurfaceAdded: _onSurfaceAdded,
      onSurfaceDeleted: _onSurfaceDeleted,
    );

    _setupListeners();
  }

  void _setupListeners() {
    _contentGenerator.textResponseStream.listen((text) {
      _logger.info('Text response from agent: $text');
      // ⚠️ **端脑的原话必须送到界面上** —— 以前只进日志 ⇒ 手机上消失。
      _lastTextReply = text;
      _emit(_textReplyController, text);
      _updateConnectionStatus(ConnectionStatus.connected);
    });

    _contentGenerator.errorStream.listen((error) {
      _logger.severe('Error from content generator: ${error.error}');
      _lastError = error.error.toString();
      // ⚠️ **失败的原因必须送到界面上** —— 以前只存起来，从不显示。
      _emit(_errorReasonController, _lastError);
      _updateConnectionStatus(ConnectionStatus.error);
    });

    // Also listen to A2UI message stream for connection confirmation
    _contentGenerator.a2uiMessageStream.listen((message) {
      _logger.fine('A2UI message received: ${message.runtimeType}');
      _updateConnectionStatus(ConnectionStatus.connected);
    });
  }

  void _updateConnectionStatus(ConnectionStatus status) {
    if (_connectionStatus != status) {
      _connectionStatus = status;
      _emit(_connectionStatusController, status);
    }
  }

  void _onSurfaceAdded(SurfaceAdded update) {
    _logger.info('Surface added: ${update.surfaceId}');
    // ⚠️ 同一个 surface **重新** `beginRendering` 时**不能追加** ——
    // A2UI 的语义是「同一个界面被更新」，不是「每次请求开一个新界面」。
    // 端脑那边按视图给稳定的 surface id（`shadow.tasks` / `shadow.agents`），
    // 所以第二次请求同一个视图会再触发一次 `SurfaceAdded`
    // ⇒ 追加的话列表里会出现两个一样的 surface。
    //
    // ⚠️ 另外**必须发一个新的 List**：`_surfaceIdsController.add(_surfaceIds)`
    // 发的是**同一个对象**，而 `List == List` 是引用比较 ⇒ Riverpod 可能
    // 判定「值没变」而**不通知**监听者 ⇒ 新 surface 根本不会出现。
    if (!_surfaceIds.contains(update.surfaceId)) {
      _surfaceIds.add(update.surfaceId);
    }
    _emit(_surfaceIdsController, List.of(_surfaceIds));
  }

  void _onSurfaceDeleted(SurfaceRemoved update) {
    _logger.info('Surface deleted: ${update.surfaceId}');
    _surfaceIds.remove(update.surfaceId);
    _emit(_surfaceIdsController, List.of(_surfaceIds));
  }

  void sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _logger.info('Sending message: $text');
    // ⚠️ **先把上一轮的结果清掉** —— 否则上一轮的原话 / 失败原因会留在
    // 界面上 ⇒ 让人以为这一轮端脑又说了那句话 / 又失败了一次。
    _lastTextReply = null;
    _emit(_textReplyController, null);
    _lastError = null;
    _emit(_errorReasonController, null);
    // ⚠️ **上一轮的 surface 也要清掉** —— **一次请求 = 一次回答**。
    //
    // 否则端脑这次回**纯文本**（它不画界面）时，界面还在渲染**上一轮**的
    // surface ⇒ ⇒ 端脑的原话又被**盖住**了 ⇒ 同一个病（话上不了屏）。
    if (_surfaceIds.isNotEmpty) {
      _surfaceIds.clear();
      _emit(_surfaceIdsController, List.of(_surfaceIds));
    }
    _updateConnectionStatus(ConnectionStatus.connecting);
    // ⚠️ **必须接住这个 future**。
    //
    // `GenUiConversation.sendRequest` 只是 `return contentGenerator.sendRequest(...)`
    // （`genui-0.7.0/lib/src/facade/gen_ui_conversation.dart:160-164`）⇒
    // 它**不 await** ⇒ 里面的异常会变成**未处理**的异步错误
    // （Flutter 里会打到 errorZone ⇒ 真机上可能弹错误框）。
    //
    // 什么时候真会抛？**dispose 的时候还有请求在飞** ——
    // `dispose()` 会关掉 transport 的 http.Client ⇒ 那个还在飞的流被中止
    // ⇒ `A2AException.network` ⇒ 一路冒到这里。
    //
    // ⚠️⚠️ **接住它不只是「别炸」—— 它是 HTTP 层失败的**唯一**出口**：
    // `contentGenerator.errorStream` **只**报 A2A 的**任务状态**失败
    // （`genui_a2ui-0.7.0/lib/src/a2ui_agent_connector.dart:164-173`）
    // ⇒ 而 **HTTP 层**的失败（401 / 404 / 500 / 连接被拒）
    // **不会**进那条流
    // ⇒ 以前这里只打一行 warning ⇒ 状态停在 `connecting`
    // ⇒ ⇒ **失败长得像「还在连」**。
    // ⇒ 现在这条 future 也**如实上报**（见 [_reportFailure]）。
    _conversation
        .sendRequest(UserMessage.text(text))
        .catchError((Object error, StackTrace stackTrace) {
      _reportFailure(error);
    });
  }

  /// 把一次失败（**任何来源**）如实报出去。
  ///
  /// ⚠️ 为什么要单独一个方法：`errorStream` **只**报 A2A 的**任务状态**失败
  /// （`a2ui_agent_connector.dart:164-173`）⇒ **HTTP 层**的失败
  /// （401 / 404 / 500 / 连接被拒）走的是**异常**那条路 ⇒
  /// 以前只在 `sendMessage` 里打一行 warning ⇒ 界面停在「正在连接端脑…」
  /// ⇒ ⇒ **失败长得像「还在连」**。
  void _reportFailure(Object error) {
    final reason = _describeFailure(error);
    _logger.warning('A2UI 失败: $reason');
    _lastError = reason;
    // ⚠️ dispose 之后这条流可能已经关了 ⇒ [_emit] 会自动跳过。
    _emit(_errorReasonController, reason);
    _updateConnectionStatus(ConnectionStatus.error);
  }

  /// 把一次失败翻成一句**能给人看**的话。
  ///
  /// ⚠️ **状态码是协议值**（`HTTP 401`）⇒ 留在原样，**不翻译**
  /// （承「协议值不翻」那条：两端对同一个协议值要说同一句话）。
  static String _describeFailure(Object error) {
    if (error is A2AHttpException) {
      final reason = error.reason?.trim();
      final head = 'HTTP ${error.statusCode}';
      return (reason == null || reason.isEmpty) ? head : '$head $reason';
    }
    if (error is A2ANetworkException) {
      final message = error.message.trim();
      return message.isEmpty ? 'network error' : message;
    }
    return error.toString();
  }

  void disconnect() {
    _logger.info('Disconnecting from A2A server');
    _updateConnectionStatus(ConnectionStatus.disconnected);
    _lastError = null;
    _emit(_errorReasonController, null);
  }

  void dispose() {
    _logger.info('Disposing GenUIAgentService');
    // ⚠️ `_conversation.dispose()` **已经**会 dispose 它持有的
    // `contentGenerator` 和 `a2uiMessageProcessor`
    // （见 genui 包的 `GenUiConversation.dispose`）。
    //
    // 这里再 dispose 一遍就是**双重释放**：
    // `A2uiContentGenerator.dispose()` 里的 `_isProcessing.dispose()`
    // 会抛「A ValueNotifier<bool> was used after being disposed」。
    //
    // 这个坑以前一直藏着 —— Agent2UI 压根**进不去**（唯一入口是
    // 本地模型下载框里的「Use Agent2UI」逃生口）。下载框下线、
    // 补了常驻入口之后，它第一次真的被 dispose 到。
    _conversation.dispose();
    // ⚠️ 上游的 `A2uiAgentConnector.dispose()` **只**关两个
    // StreamController（`a2ui_agent_connector.dart:302-309`）⇒ transport
    // （以及它那个 http.Client）**没人关** ⇒ socket 泄漏。
    // 上游默认路径也有这个问题；我们自己造了 transport ⇒ 顺手关掉。
    _transport.close();
    _surfaceIdsController.close();
    _connectionStatusController.close();
    _textReplyController.close();
    _errorReasonController.close();
  }
}
