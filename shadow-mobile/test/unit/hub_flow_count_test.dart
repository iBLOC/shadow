import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 一个**数得出非零条数**的假端脑 client。
///
/// 它**记得自己被叫过几次** —— 这样「hub 到底有没有把共享那个 client 递进来」
/// 是能被直接断言的，而不是靠「本机 60080 上碰巧没人监听」来撞出一个 0。
///
/// ⚠️ 2026-11-03：hub 现在**一次取五项**（供应商 / 叶区 / MCP / 记忆 / 流程）
/// ⇒ ⇒ 假 client 必须**把五项都桩上** —— 少桩一项 ⇒ 那一项**打真网络**
/// ⇒ ⇒ 测试结果取决于本机 60080 上有谁在监听 ⇒ ⇒ 假红假绿都有
/// （实测：单跑绿、全量跑红，就是这么来的 —— 断的是同一条断言，
/// 根因却是「那一项打到了真网络」）。
class _FakeTelencephalonClient extends TelencephalonClient {
  _FakeTelencephalonClient(this._flows, {this.failWith, this.failProviders});

  final List<FlowMeta> _flows;

  /// 整个 client 都失败（模拟「端脑没起来」）。
  final Object? failWith;

  /// **只有**供应商这一项失败（模拟「就这一项读不到」）。
  final Object? failProviders;

  int calls = 0;
  int providerCalls = 0;

  @override
  Future<List<FlowMeta>> listFlows({
    String? name,
    String? tag,
    bool? isDraft,
  }) async {
    calls++;
    if (failWith != null) throw failWith!;
    return _flows;
  }

  @override
  Future<List<RegisteredProvider>> listProviders() async {
    providerCalls++;
    if (failWith != null) throw failWith!;
    if (failProviders != null) throw failProviders!;
    return const [];
  }

  @override
  Future<AgentsResponse> listAgents() async {
    calls++;
    if (failWith != null) throw failWith!;
    return AgentsResponse(
      telencephalonId: 't',
      instanceName: 'i',
      defaultAgent: '',
      agents: const [],
    );
  }

  @override
  Future<List<Map<String, dynamic>>> listMcpServers() async {
    calls++;
    if (failWith != null) throw failWith!;
    return const [];
  }
}

FlowMeta _flow(String id, String name) => FlowMeta(
  id: id,
  name: name,
  version: '1',
  isDraft: false,
  tags: const [],
);

/// 前额叶那几路计数全部返回空 —— 这一组只关心流程数。
PrefrontalClient _emptyPrefrontal() => PrefrontalClient(
  baseUrl: 'http://prefrontal.test',
  client: http_testing.MockClient((_) async => http.Response('[]', 200)),
);

/// 造一个容器：共享的端脑 client 与前额叶 client 都是我们自己塞进去的。
ProviderContainer _containerWith(TelencephalonClient telencephalon) {
  final container = ProviderContainer(
    overrides: [
      telencephalonClientProvider.overrideWithValue(telencephalon),
      prefrontalClientProvider.overrideWithValue(_emptyPrefrontal()),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// 管理中枢的「流程数」这一格。
///
/// ⚠️ 这一格以前是个**会撒谎的 UI**：它自己 new 了一个端脑 client ——
/// **没带钥匙**、**地址指着外部端脑**（手机上没人监听那个端口）⇒
/// 流程数**恒为 0**，而 0 又被 `catch` 吞掉 ⇒「0 条流程」看起来像
/// 「真的没有流程」。
///
/// 这组测试钉的是三件事：
/// 1. 它用的是**共享那个**端脑 client（带钥匙、指着嵌入式端脑）；
/// 2. 它发出去的请求**真的带着 `X-Shadow-Key`** ⇒ 端脑面整体上锁之后
///    这条请求依然通（不然 App 会把自己锁在外面）；
/// 3. **读不到 ≠ 0** —— 读不到就要留下原因，不许变成一个看起来像真的数字。
void main() {
  group('管理中枢的流程计数', () {
    test('走的是共享那个端脑 client，而不是自己 new 一个没钥匙的', () async {
      final fake = _FakeTelencephalonClient([
        _flow('f1', 'A'),
        _flow('f2', 'B'),
        _flow('f3', 'C'),
      ]);
      final container = _containerWith(fake);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      final state = container.read(hubNotifierProvider);
      expect(
        fake.calls,
        greaterThanOrEqualTo(1),
        reason: 'hub 必须用共享那个端脑 client —— 自己 new 一个就没钥匙、地址也错',
      );
      expect(state.flowCount, 3);
      expect(state.flowError, isNull);
    });

    test('发出去的流程请求带着 X-Shadow-Key ⇒ 端脑面上锁后依然通', () async {
      final seenPaths = <String>[];
      final seenKeys = <String?>[];
      final client = TelencephalonClient(
        baseUrl: 'http://endbrain.test',
        apiKey: 'the-shadow-key',
        client: http_testing.MockClient((request) async {
          seenPaths.add(request.url.path);
          seenKeys.add(request.headers['X-Shadow-Key']);
          if (request.url.path == '/shadow/v1/agents') {
            return http.Response(
              jsonEncode(<String, dynamic>{
                'telencephalon': <String, dynamic>{},
                'agents': <dynamic>[],
              }),
              200,
            );
          }
          return http.Response(jsonEncode(<dynamic>[]), 200);
        }),
      );
      final container = _containerWith(client);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      // ⚠️ hub 一次取五项 ⇒ ⇒ 不能断言「最后一条是 /api/flows」
      // ⇒ ⇒ 断言「**其中一条**是 /api/flows」。
      final idx = seenPaths.indexOf('/api/flows');
      expect(idx, greaterThanOrEqualTo(0), reason: '流程数必须真的去问端脑');
      expect(
        seenKeys[idx],
        'the-shadow-key',
        reason: '没带钥匙 ⇒ 端脑面上锁之后这一格直接 401',
      );
      expect(container.read(hubNotifierProvider).flowError, isNull);
    });

    test('读不到时不许静默变成 0 —— 原因得留下（失败不能长得像成功）', () async {
      final fake = _FakeTelencephalonClient(
        const [],
        failWith: TelencephalonException('listFlows → 401'),
      );
      final container = _containerWith(fake);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      final state = container.read(hubNotifierProvider);
      expect(state.flowCount, 0);
      expect(
        state.flowError,
        contains('401'),
        reason: '读不到就必须留下原因 ⇒ UI 显示「未知」而不是「0 条流程」',
      );
    });
  });

  group('管理中枢的每一项各自记错（一张卡读不到 ≠ 别的卡也读不到）', () {
    test('就供应商这一项失败 ⇒ 只有供应商是未知，其余照常', () async {
      final fake = _FakeTelencephalonClient(
        [_flow('f1', 'A')],
        failProviders: TelencephalonException('GET /models/providers → 401'),
      );
      final container = _containerWith(fake);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      final state = container.read(hubNotifierProvider);
      expect(
        state.providerError,
        contains('401'),
        reason: '这一项读不到 ⇒ 原因得留下',
      );
      expect(state.agentError, isNull);
      expect(state.mcpError, isNull);
      expect(state.memoryError, isNull);
      expect(state.flowError, isNull);
      expect(state.flowCount, 1, reason: '别的项不该被这一项拖成未知');
    });

    test('技能数是「未知」而不是 0 —— 端脑没有技能登记表这张面', () async {
      final container = _containerWith(_FakeTelencephalonClient(const []));

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      final state = container.read(hubNotifierProvider);
      expect(
        state.skillError,
        isNotNull,
        reason: '端脑没有「技能登记表」⇒ 这个数未定义 ⇒ 不能显示成「0 个技能」',
      );
    });

    test('hub 打的是端脑面，不是前额叶旧方言', () async {
      final seenPaths = <String>[];
      final client = TelencephalonClient(
        baseUrl: 'http://endbrain.test',
        apiKey: 'k',
        client: http_testing.MockClient((request) async {
          seenPaths.add(request.url.path);
          if (request.url.path == '/shadow/v1/agents') {
            return http.Response(
              jsonEncode(<String, dynamic>{
                'telencephalon': <String, dynamic>{},
                'agents': <dynamic>[],
              }),
              200,
            );
          }
          return http.Response(jsonEncode(<dynamic>[]), 200);
        }),
      );
      final container = _containerWith(client);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      expect(seenPaths, contains('/models/providers'));
      expect(seenPaths, contains('/shadow/v1/agents'));
      expect(seenPaths, contains('/api/telencephalon/mcp/servers'));
      expect(seenPaths, contains('/api/flows'));
      // ⚠️ 旧方言那几条在端脑上**一律 404** ⇒ ⇒ 打它们 = 拿不到。
      expect(seenPaths, isNot(contains('/api/providers')));
      expect(seenPaths, isNot(contains('/api/agents')));
      expect(seenPaths, isNot(contains('/api/skills')));
      expect(seenPaths, isNot(contains('/api/mcp/servers')));
    });
  });
}
