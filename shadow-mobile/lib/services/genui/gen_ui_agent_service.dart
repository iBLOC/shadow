import 'dart:async';
import 'package:genui/genui.dart';
import 'package:genui_a2ui/genui_a2ui.dart';
import 'package:logging/logging.dart';

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

  ConnectionStatus _connectionStatus = ConnectionStatus.disconnected;
  final _connectionStatusController =
      StreamController<ConnectionStatus>.broadcast();
  String? _lastError;

  Stream<List<String>> get surfaceIdsStream => _surfaceIdsController.stream;
  List<String> get surfaceIds => List.unmodifiable(_surfaceIds);

  Stream<ConnectionStatus> get connectionStatusStream =>
      _connectionStatusController.stream;
  ConnectionStatus get connectionStatus => _connectionStatus;
  String? get lastError => _lastError;

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
      _updateConnectionStatus(ConnectionStatus.connected);
    });

    _contentGenerator.errorStream.listen((error) {
      _logger.severe('Error from content generator: ${error.error}');
      _lastError = error.error.toString();
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
      _connectionStatusController.add(status);
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
    _surfaceIdsController.add(List.of(_surfaceIds));
  }

  void _onSurfaceDeleted(SurfaceRemoved update) {
    _logger.info('Surface deleted: ${update.surfaceId}');
    _surfaceIds.remove(update.surfaceId);
    _surfaceIdsController.add(List.of(_surfaceIds));
  }

  void sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _logger.info('Sending message: $text');
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
    // ⚠️ **接住它不会丢信息**：同一个错误**已经**通过
    // `contentGenerator.errorStream` → `ContentGeneratorError` 走过了
    // （`_setupListeners` 里已经记进 `_lastError` 并把状态置成 `error`
    // ⇒ 界面看得到）⇒ 这条 future 只是**同一条错误的第二个出口**。
    _conversation
        .sendRequest(UserMessage.text(text))
        .catchError((Object error, StackTrace stackTrace) {
      _logger.warning('A2UI 请求失败: $error');
    });
  }

  void disconnect() {
    _logger.info('Disconnecting from A2A server');
    _updateConnectionStatus(ConnectionStatus.disconnected);
    _lastError = null;
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
  }
}
