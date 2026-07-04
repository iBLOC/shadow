import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:logging/logging.dart';

/// Prefrontal 嵌入式集群服务
/// 
/// 管理 Prefrontal 后台进程并提供 HTTP API 访问
class PrefrontalService {
  static final _log = Logger('PrefrontalService');
  
  final String host;
  final int port;
  final bool clusterEnabled;
  final String? apiToken;
  
  Process? _process;
  bool _isRunning = false;
  
  PrefrontalService({
    this.host = '127.0.0.1',
    this.port = 8082,
    this.clusterEnabled = true,
    this.apiToken,
  });
  
  /// 获取基础 URL
  String get baseUrl => 'http://$host:$port';
  
  /// 服务是否正在运行
  bool get isRunning => _isRunning;
  
  /// 启动 Prefrontal 服务
  /// 
  /// [executablePath] Prefrontal 可执行文件路径
  /// [configPath] 配置文件路径（可选）
  /// [modelsPath] 模型文件路径（可选）
  Future<void> start({
    required String executablePath,
    String? configPath,
    String? modelsPath,
  }) async {
    if (_isRunning) {
      _log.warning('Prefrontal 服务已在运行中');
      return;
    }
    
    _log.info('启动 Prefrontal 服务: $executablePath');
    
    try {
      final args = <String>[
        '--host', host,
        '--port', port.toString(),
      ];
      
      if (clusterEnabled) {
        args.add('--cluster-enabled');
      }
      
      if (configPath != null) {
        args.addAll(['--config', configPath]);
      }
      
      if (modelsPath != null) {
        args.addAll(['--models-path', modelsPath]);
      }
      
      _process = await Process.start(
        executablePath,
        args,
        mode: ProcessStartMode.detachedWithStdio,
      );
      
      // 等待服务启动
      await _waitForReady();
      
      _isRunning = true;
      _log.info('Prefrontal 服务启动成功: $baseUrl');
      
      // 监听进程输出
      _process!.stdout.listen((data) {
        _log.fine('Prefrontal stdout: ${String.fromCharCodes(data)}');
      });
      
      _process!.stderr.listen((data) {
        _log.warning('Prefrontal stderr: ${String.fromCharCodes(data)}');
      });
      
      // 监听进程退出
      _process!.exitCode.then((code) {
        _log.info('Prefrontal 进程退出，代码: $code');
        _isRunning = false;
        _process = null;
      });
      
    } catch (e, stack) {
      _log.severe('启动 Prefrontal 服务失败', e, stack);
      await stop();
      rethrow;
    }
  }
  
  /// 停止 Prefrontal 服务
  Future<void> stop() async {
    if (_process == null) {
      return;
    }
    
    _log.info('停止 Prefrontal 服务');
    
    try {
      _process!.kill(ProcessSignal.sigterm);
      
      // 等待进程退出（最多 5 秒）
      await _process!.exitCode.timeout(
        const Duration(seconds: 5),
        onTimeout: () {
          _log.warning('Prefrontal 进程未响应 SIGTERM，强制终止');
          _process!.kill(ProcessSignal.sigkill);
          return -1;
        },
      );
      
    } catch (e) {
      _log.warning('停止 Prefrontal 服务时出错: $e');
    } finally {
      _process = null;
      _isRunning = false;
    }
  }
  
  /// 等待服务就绪
  Future<void> _waitForReady({int maxAttempts = 30}) async {
    for (int i = 0; i < maxAttempts; i++) {
      try {
        final response = await http.get(Uri.parse('$baseUrl/health'));
        if (response.statusCode == 200) {
          _log.info('Prefrontal 服务就绪');
          return;
        }
      } catch (e) {
        // 服务还未就绪，继续等待
      }
      
      await Future.delayed(const Duration(milliseconds: 500));
    }
    
    throw TimeoutException('Prefrontal 服务启动超时');
  }
  
  /// 健康检查
  Future<Map<String, dynamic>> health() async {
    final response = await http.get(
      Uri.parse('$baseUrl/health'),
      headers: _headers(),
    );
    
    if (response.statusCode != 200) {
      throw Exception('健康检查失败: ${response.statusCode}');
    }
    
    return json.decode(response.body);
  }
  
  /// 注册智能体
  Future<Map<String, dynamic>> registerAgent(Map<String, dynamic> spec) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/cluster/agents'),
      headers: _headers(),
      body: json.encode(spec),
    );
    
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('注册智能体失败: ${response.statusCode}');
    }
    
    return json.decode(response.body);
  }
  
  /// 列出所有智能体
  Future<List<Map<String, dynamic>>> listAgents() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/cluster/agents'),
      headers: _headers(),
    );
    
    if (response.statusCode != 200) {
      throw Exception('列出智能体失败: ${response.statusCode}');
    }
    
    return List<Map<String, dynamic>>.from(json.decode(response.body));
  }
  
  /// 加载 WASM 智能体包
  Future<void> loadPackage({
    required String agentId,
    String? packagePath,
    String? packageId,
    String? version,
  }) async {
    final body = <String, dynamic>{
      'agent_id': agentId,
    };
    
    if (packagePath != null) {
      body['package_path'] = packagePath;
    }
    
    if (packageId != null) {
      body['package_id'] = packageId;
    }
    
    if (version != null) {
      body['version'] = version;
    }
    
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/cluster/agents/$agentId/load-package'),
      headers: _headers(),
      body: json.encode(body),
    );
    
    if (response.statusCode != 200) {
      throw Exception('加载 WASM 包失败: ${response.statusCode}');
    }
  }
  
  /// 调用智能体
  Future<Map<String, dynamic>> invokeAgent({
    required String agentId,
    required String input,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/cluster/agents/$agentId/invoke'),
      headers: _headers(),
      body: json.encode({'input': input}),
    );
    
    if (response.statusCode != 200) {
      throw Exception('调用智能体失败: ${response.statusCode}');
    }
    
    return json.decode(response.body);
  }
  
  /// A2A 委托任务
  Future<Map<String, dynamic>> delegateTask({
    required String agentId,
    required String peerUrl,
    required Map<String, dynamic> payload,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/cluster/agents/$agentId/delegate'),
      headers: _headers(),
      body: json.encode({
        'peer_url': peerUrl,
        'payload': payload,
      }),
    );
    
    if (response.statusCode != 200) {
      throw Exception('委托任务失败: ${response.statusCode}');
    }
    
    return json.decode(response.body);
  }
  
  /// 获取请求头
  Map<String, String> _headers() {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    
    if (apiToken != null) {
      headers['Authorization'] = 'Bearer $apiToken';
    }
    
    return headers;
  }
  
  /// 释放资源
  Future<void> dispose() async {
    await stop();
  }
}

/// Prefrontal 智能体规范
class AgentSpec {
  final String id;
  final String name;
  final String description;
  final String instructions;
  final Map<String, dynamic> model;
  final List<String> tools;
  
  AgentSpec({
    required this.id,
    required this.name,
    required this.description,
    required this.instructions,
    required this.model,
    this.tools = const [],
  });
  
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'instructions': instructions,
    'model': model,
    'tools': tools,
  };
  
  factory AgentSpec.fromJson(Map<String, dynamic> json) => AgentSpec(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String,
    instructions: json['instructions'] as String,
    model: json['model'] as Map<String, dynamic>,
    tools: List<String>.from(json['tools'] ?? []),
  );
}

/// Prefrontal 调用结果
class InvokeResult {
  final String output;
  final int fuelConsumed;
  final int memoryUsedMb;
  final int durationMs;
  
  InvokeResult({
    required this.output,
    required this.fuelConsumed,
    required this.memoryUsedMb,
    required this.durationMs,
  });
  
  factory InvokeResult.fromJson(Map<String, dynamic> json) => InvokeResult(
    output: json['output'] as String,
    fuelConsumed: json['fuel_consumed'] as int,
    memoryUsedMb: json['memory_used_mb'] as int,
    durationMs: json['duration_ms'] as int,
  );
}
