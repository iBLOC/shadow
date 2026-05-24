import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'a2a_message.dart';

/// 委托回调类型
typedef DelegateCallback =
    Future<DelegateResponse> Function(DelegateRequest request);

/// A2A客户端
/// 用于与其他Agent通信
class A2AClient {
  final String serverUrl;
  final String agentId;
  WebSocketChannel? _channel;
  final _messageController = StreamController<A2AMessage>.broadcast();
  final _pendingRequests = <String, Completer<A2AMessage>>{};
  DelegateCallback? _requestHandler;
  bool _isConnected = false;
  Timer? _heartbeatTimer;

  A2AClient({required this.serverUrl, required this.agentId});

  bool get isConnected => _isConnected;

  /// 设置请求处理器（当收到委托请求时调用）
  void setRequestHandler(DelegateCallback? handler) {
    _requestHandler = handler;
  }

  /// 连接到A2A服务器
  Future<void> connect() async {
    if (_isConnected) return;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(serverUrl));
      _isConnected = true;

      _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnect,
      );

      // 启动心跳
      _startHeartbeat();

      debugPrint('[A2AClient] Connected to $serverUrl');
    } catch (e) {
      _isConnected = false;
      debugPrint('[A2AClient] Connection failed: $e');
      rethrow;
    }
  }

  /// 断开连接
  Future<void> disconnect() async {
    _stopHeartbeat();
    await _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    debugPrint('[A2AClient] Disconnected');
  }

  /// 发送委托请求并等待响应
  Future<DelegateResponse> delegate(DelegateRequest request) async {
    if (!_isConnected || _channel == null) {
      throw StateError('A2A client not connected');
    }

    final message = A2AMessage(
      type: A2AMessageType.delegateRequest,
      id: request.taskId,
      payload: request.toPayload(),
    );

    final completer = Completer<A2AMessage>();
    _pendingRequests[message.id] = completer;

    _channel!.sink.add(message.toJsonString());

    try {
      final response = await completer.future.timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('A2A request timeout'),
      );

      final payload = response.payload;
      return DelegateResponse(
        taskId: payload['task_id'] as String,
        status: payload['status'] as String,
        actionTaken: payload['action_taken'] as String?,
        result: payload['result'] as Map<String, dynamic>?,
        error: payload['error'] as String?,
      );
    } finally {
      _pendingRequests.remove(request.taskId);
    }
  }

  /// 发送消息
  Future<void> send(A2AMessage message) async {
    if (!_isConnected || _channel == null) {
      throw StateError('A2A client not connected');
    }
    _channel!.sink.add(message.toJsonString());
  }

  void _handleMessage(dynamic data) {
    try {
      final message = A2AMessage.fromJsonString(data as String);

      // 检查是否是响应
      if (_pendingRequests.containsKey(message.id)) {
        _pendingRequests[message.id]!.complete(message);
        return;
      }

      // 检查是否是请求（需要处理）
      if (message.type == A2AMessageType.delegateRequest &&
          _requestHandler != null) {
        _handleDelegateRequest(message);
        return;
      }

      // 其他消息
      _messageController.add(message);
    } catch (e) {
      debugPrint('[A2AClient] Failed to handle message: $e');
    }
  }

  Future<void> _handleDelegateRequest(A2AMessage message) async {
    if (_requestHandler == null) return;

    try {
      final request = DelegateRequest.fromPayload(message.payload);
      final response = await _requestHandler!(request);

      final responseMessage = A2AMessage(
        type: A2AMessageType.delegateResponse,
        id: message.id,
        payload: response.toPayload(),
      );

      await send(responseMessage);
    } catch (e) {
      debugPrint('[A2AClient] Failed to handle delegate request: $e');
    }
  }

  void _handleError(dynamic error) {
    debugPrint('[A2AClient] WebSocket error: $error');
    _isConnected = false;
  }

  void _handleDisconnect() {
    debugPrint('[A2AClient] WebSocket disconnected');
    _isConnected = false;
    _stopHeartbeat();
  }

  void _startHeartbeat() {
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isConnected && _channel != null) {
        try {
          _channel!.sink.add('{"type":"ping"}');
        } catch (_) {}
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  /// 消息流
  Stream<A2AMessage> get messages => _messageController.stream;

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
