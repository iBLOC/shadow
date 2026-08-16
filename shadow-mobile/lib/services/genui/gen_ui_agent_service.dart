import 'dart:async';
import 'package:genui/genui.dart';
import 'package:genui_a2ui/genui_a2ui.dart';
import 'package:logging/logging.dart';

/// Connection status for A2A server
enum ConnectionStatus { disconnected, connecting, connected, error }

class GenUIAgentService {
  static final _logger = Logger('GenUIAgentService');

  late final A2uiMessageProcessor _messageProcessor;
  late final A2uiContentGenerator _contentGenerator;
  late final GenUiConversation _conversation;

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

  GenUIAgentService({required String serverUrl, Catalog? catalog}) {
    _logger.info('Initializing GenUIAgentService with server: $serverUrl');

    _messageProcessor = A2uiMessageProcessor(
      catalogs: [catalog ?? CoreCatalogItems.asCatalog()],
    );

    _contentGenerator = A2uiContentGenerator(serverUrl: Uri.parse(serverUrl));

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
    _surfaceIds.add(update.surfaceId);
    _surfaceIdsController.add(_surfaceIds);
  }

  void _onSurfaceDeleted(SurfaceRemoved update) {
    _logger.info('Surface deleted: ${update.surfaceId}');
    _surfaceIds.remove(update.surfaceId);
    _surfaceIdsController.add(_surfaceIds);
  }

  void sendMessage(String text) {
    if (text.trim().isEmpty) return;
    _logger.info('Sending message: $text');
    _updateConnectionStatus(ConnectionStatus.connecting);
    _conversation.sendRequest(UserMessage.text(text));
  }

  void disconnect() {
    _logger.info('Disconnecting from A2A server');
    _updateConnectionStatus(ConnectionStatus.disconnected);
    _lastError = null;
  }

  void dispose() {
    _logger.info('Disposing GenUIAgentService');
    _conversation.dispose();
    _messageProcessor.dispose();
    _contentGenerator.dispose();
    _surfaceIdsController.close();
    _connectionStatusController.close();
  }
}
