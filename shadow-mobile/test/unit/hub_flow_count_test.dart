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
class _FakeTelencephalonClient extends TelencephalonClient {
  _FakeTelencephalonClient(this._flows, {this.failWith});

  final List<FlowMeta> _flows;
  final Object? failWith;
  int calls = 0;

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
      String? seenPath;
      String? seenKey;
      final client = TelencephalonClient(
        baseUrl: 'http://endbrain.test',
        apiKey: 'the-shadow-key',
        client: http_testing.MockClient((request) async {
          seenPath = request.url.path;
          seenKey = request.headers['X-Shadow-Key'];
          return http.Response(jsonEncode(<Map<String, dynamic>>[]), 200);
        }),
      );
      final container = _containerWith(client);

      await container.read(hubNotifierProvider.notifier).loadAllCounts();

      expect(seenPath, '/api/flows');
      expect(
        seenKey,
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
}
