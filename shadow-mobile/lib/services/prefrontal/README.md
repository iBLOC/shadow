# Prefrontal Flutter 集成指南

本文档说明如何在 Shadow-Mobile 中集成和使用 Prefrontal 嵌入式集群服务。

## 架构概览

```
┌─────────────────────────────────────────────┐
│          Shadow-Mobile (Flutter)            │
│  ┌─────────────────────────────────────┐   │
│  │   PrefrontalClusterPage (UI)        │   │
│  │   PrefrontalNotifier (State)        │   │
│  │   PrefrontalService (HTTP Client)   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │ HTTP API
                    ▼
┌─────────────────────────────────────────────┐
│         Prefrontal (Rust Backend)           │
│  ┌─────────────────────────────────────┐   │
│  │   Supervisor (Cluster Manager)      │   │
│  │   AgentOrchestrator                 │   │
│  │   WasmRuntime                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 快速开始

### 1. 编译 Prefrontal 可执行文件

```bash
cd https://github.com/iBLOC/prefrontal
cargo build --release
```

可执行文件位于: `target/release/prefrontal`

### 2. 在 Flutter 中使用

#### 基础用法

```dart
import 'package:shadow_mobile/services/prefrontal/prefrontal_provider.dart';

// 1. 配置
final config = PrefrontalConfig(
  host: '127.0.0.1',
  port: 8082,
  clusterEnabled: true,
  executablePath: '/path/to/prefrontal',
);

// 2. 启动服务
final notifier = ref.read(prefrontalProvider.notifier);
await notifier.start(config);

// 3. 注册智能体
final spec = AgentSpec(
  id: 'weather-agent',
  name: 'Weather Agent',
  description: '查询天气信息',
  instructions: '你是一个天气查询助手...',
  model: {
    'provider': 'openai',
    'name': 'gpt-4',
  },
  tools: ['weather_api'],
);
await notifier.registerAgent(spec);

// 4. 加载 WASM 包
await notifier.loadPackage(
  agentId: 'weather-agent',
  packagePath: '/path/to/weather.wpkg',
);

// 5. 调用智能体
final result = await notifier.invokeAgent(
  agentId: 'weather-agent',
  input: '北京今天天气怎么样？',
);
print(result.output); // "北京今天晴朗，气温 25°C..."

// 6. 停止服务
await notifier.stop();
```

#### 使用 UI 页面

```dart
import 'package:shadow_mobile/services/prefrontal/prefrontal_cluster_page.dart';

// 在路由中添加
GoRoute(
  path: '/prefrontal',
  builder: (context, state) => const PrefrontalClusterPage(),
),
```

## API 参考

### PrefrontalService

底层 HTTP 客户端服务。

```dart
final service = PrefrontalService(
  host: '127.0.0.1',
  port: 8082,
  clusterEnabled: true,
);

// 启动
await service.start(executablePath: '/path/to/prefrontal');

// 健康检查
final health = await service.health();

// 注册智能体
await service.registerAgent(spec.toJson());

// 列出智能体
final agents = await service.listAgents();

// 加载 WASM 包
await service.loadPackage(
  agentId: 'agent-1',
  packagePath: '/path/to/agent.wpkg',
);

// 调用智能体
final result = await service.invokeAgent(
  agentId: 'agent-1',
  input: '你好',
);

// A2A 委托
await service.delegateTask(
  agentId: 'agent-1',
  peerUrl: 'http://peer:8082',
  payload: {'task': 'query_weather'},
);

// 停止
await service.stop();
```

### PrefrontalNotifier

Riverpod StateNotifier，管理服务状态。

```dart
final notifier = ref.read(prefrontalProvider.notifier);

// 启动
await notifier.start(config);

// 刷新智能体列表
await notifier.refreshAgents();

// 注册智能体
await notifier.registerAgent(spec);

// 加载 WASM 包
await notifier.loadPackage(
  agentId: 'agent-1',
  packagePath: '/path/to/agent.wpkg',
);

// 调用智能体
final result = await notifier.invokeAgent(
  agentId: 'agent-1',
  input: '你好',
);

// A2A 委托
await notifier.delegateTask(
  agentId: 'agent-1',
  peerUrl: 'http://peer:8082',
  payload: {'task': 'query_weather'},
);

// 健康检查
final health = await notifier.health();

// 停止
await notifier.stop();
```

### Provider

```dart
// 服务状态
final state = ref.watch(prefrontalProvider);
print(state.status); // PrefrontalStatus.running
print(state.agents); // List<AgentSpec>

// 智能体列表
final agents = ref.watch(agentsProvider);

// 服务状态
final status = ref.watch(prefrontalStatusProvider);
```

## 完整示例

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/services/prefrontal/prefrontal_provider.dart';

class WeatherApp extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(prefrontalProvider.notifier);
    final state = ref.watch(prefrontalProvider);

    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('天气助手')),
        body: Column(
          children: [
            // 启动服务
            ElevatedButton(
              onPressed: state.status == PrefrontalStatus.stopped
                  ? () async {
                      await notifier.start(const PrefrontalConfig(
                        executablePath: '/path/to/prefrontal',
                      ));
                    }
                  : null,
              child: const Text('启动服务'),
            ),

            // 注册智能体
            ElevatedButton(
              onPressed: state.status == PrefrontalStatus.running
                  ? () async {
                      await notifier.registerAgent(AgentSpec(
                        id: 'weather',
                        name: 'Weather Agent',
                        description: '查询天气',
                        instructions: '你是天气助手...',
                        model: {'provider': 'openai', 'name': 'gpt-4'},
                      ));
                    }
                  : null,
              child: const Text('注册智能体'),
            ),

            // 加载 WASM 包
            ElevatedButton(
              onPressed: state.status == PrefrontalStatus.running
                  ? () async {
                      await notifier.loadPackage(
                        agentId: 'weather',
                        packagePath: '/path/to/weather.wpkg',
                      );
                    }
                  : null,
              child: const Text('加载 WASM 包'),
            ),

            // 调用智能体
            ElevatedButton(
              onPressed: state.status == PrefrontalStatus.running
                  ? () async {
                      final result = await notifier.invokeAgent(
                        agentId: 'weather',
                        input: '北京天气',
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(result.output)),
                      );
                    }
                  : null,
              child: const Text('查询天气'),
            ),
          ],
        ),
      ),
    );
  }
}
```

## 配置选项

### PrefrontalConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `host` | String | '127.0.0.1' | 服务地址 |
| `port` | int | 8082 | 服务端口 |
| `clusterEnabled` | bool | true | 是否启用集群模式 |
| `apiToken` | String? | null | API 访问令牌 |
| `executablePath` | String | 必填 | Prefrontal 可执行文件路径 |
| `configPath` | String? | null | 配置文件路径 |
| `modelsPath` | String? | null | 模型文件路径 |

## 错误处理

```dart
try {
  await notifier.start(config);
} on TimeoutException {
  // 服务启动超时
  print('启动超时');
} on SocketException {
  // 网络连接失败
  print('网络错误');
} catch (e) {
  // 其他错误
  print('错误: $e');
}
```

## 调试

启用日志：

```dart
import 'package:logging/logging.dart';

void main() {
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.message}');
  });
  
  runApp(MyApp());
}
```

## 常见问题

### Q: 如何找到 Prefrontal 可执行文件路径？

A: 编译后位于 `target/release/prefrontal`，可以将其复制到应用的 assets 目录或使用绝对路径。

### Q: 服务启动失败怎么办？

A: 检查：
1. 可执行文件路径是否正确
2. 端口是否被占用
3. 查看日志输出（`Logger.root.level = Level.ALL`）

### Q: 如何管理多个智能体？

A: 使用 `registerAgent()` 注册多个智能体，然后通过 `agents` 列表管理它们。

### Q: A2A 委托如何使用？

A: 调用 `delegateTask()` 将任务委托给其他 Prefrontal 实例：

```dart
await notifier.delegateTask(
  agentId: 'local-agent',
  peerUrl: 'http://peer:8082',
  payload: {'task': 'complex_query'},
);
```

## 下一步

1. **创建 WASM 智能体包** - 使用 Rust 编写 `.wpkg` 智能体
2. **实现 Resonance 联邦** - 跨区域 Prefrontal 实例同步
3. **添加区块链认证** - 为 mindset 添加签名验证

## 参考文档

- [Prefrontal API 文档](https://github.com/ibloc/prefrontal/docs/API.md)
- [WASM 智能体开发指南](https://github.com/ibloc/prefrontal/docs/WASM_AGENT.md)
- [Resonance 联邦协议](https://github.com/ibloc/resonance/docs/FEDERATION.md)
