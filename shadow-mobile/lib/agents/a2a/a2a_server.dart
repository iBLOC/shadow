import 'dart:async';
import 'package:flutter/services.dart';
import 'a2a_message.dart';

/// A2A服务端
///
/// 注意: Flutter无法直接创建WebSocket服务器
/// 这个类的实现通过Platform Channel调用Android原生代码
class A2AServer {
  final int port;
  bool _isRunning = false;
  final _messageController = StreamController<A2AMessage>.broadcast();
  final _clients = <String, String>{}; // clientId -> agentId

  A2AServer({this.port = 8083});

  bool get isRunning => _isRunning;

  /// 启动A2A服务器
  ///
  /// 由于Flutter无法直接创建WebSocket服务器，
  /// 需要通过Platform Channel调用Android原生代码来实现
  Future<void> start() async {
    if (_isRunning) return;

    try {
      // 通过Platform Channel启动原生WebSocket服务器
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('startServer', {'port': port});

      _isRunning = true;
    } catch (e) {
      _isRunning = false;
      rethrow;
    }
  }

  /// 停止服务器
  Future<void> stop() async {
    if (!_isRunning) return;

    try {
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('stopServer');

      _isRunning = false;
      _clients.clear();
    } catch (e) {
      rethrow;
    }
  }

  /// 注册Agent
  Future<void> registerAgent(String agentId, AgentCard card) async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('registerAgent', {
        'agentId': agentId,
        'card': card.toJson(),
      });

      _clients[agentId] = agentId;
    } catch (e) {
      rethrow;
    }
  }

  /// 注销Agent
  Future<void> unregisterAgent(String agentId) async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('unregisterAgent', {'agentId': agentId});

      _clients.remove(agentId);
    } catch (e) {
      rethrow;
    }
  }

  /// 广播消息给所有客户端
  Future<void> broadcast(A2AMessage message) async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('broadcast', {'message': message.toJson()});
    } catch (e) {
      rethrow;
    }
  }

  /// 发送消息给指定客户端
  Future<void> sendTo(String clientId, A2AMessage message) async {
    try {
      const platform = MethodChannel('com.ibloc.shadow/a2a');

      await platform.invokeMethod('sendTo', {
        'clientId': clientId,
        'message': message.toJson(),
      });
    } catch (e) {
      rethrow;
    }
  }

  /// 消息流
  Stream<A2AMessage> get messages => _messageController.stream;

  void dispose() {
    stop();
    _messageController.close();
  }
}

/// 委托请求处理器类型
typedef DelegateHandler =
    Future<DelegateResponse> Function(
      String fromAgentId,
      DelegateRequest request,
    );
