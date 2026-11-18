import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shadow_mobile/screens/memory_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';

/// 「移动端记忆读不出来」那一族（2026-11-17）。
///
/// ## 这一刀钉住的是哪几格
///
/// ❶ **列表走 `GET /api/memory`** —— 以前走的是 `searchMemory('')`
///    （**空查询的搜索**）⇒ ⇒ 空查询在混合检索里没有词 ⇒ ⇒ 得分低于
///    服务端默认的 `min_score=0.3` ⇒ ⇒ 整条被滤掉 ⇒ ⇒ 界面上「一条都没有」。
/// ❷ **搜索显式带 `minScore: 0.0`** —— 不许让服务端的 0.3 把结果滤掉。
/// ❸ **`copyWith` 不许悄悄抹掉错误** ⇒ ⇒ 错误横幅下一次更新就没了
///    ⇒ ⇒ 「加载失败」看起来像「没有记忆」（失败长得像成功）。
/// ❹ **`copyWith` 不许悄悄重置维度筛选** ⇒ ⇒ 用户选完维度、列表一刷新
///    就没了。
/// ❺ **维度名大小写要对得上** —— 界面给的是 `'User'`，海马体给的是
///    `'user'` ⇒ ⇒ 直接 `!=` 比 ⇒ ⇒ 一点维度筛选、列表**整个空了**。
/// 记下**真客户端**打出去的每一发（方法 / URL / 请求体）。
class _FakeHttp extends http.BaseClient {
  final List<String> methods = [];
  final List<String> urls = [];
  final List<String> bodies = [];
  String responseBody = '[]';

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    methods.add(request.method);
    urls.add(request.url.toString());
    bodies.add(await request.finalize().bytesToString());
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(responseBody)),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }
}

void main() {
  group('记忆页那一族', () {
    late _FakeHttp http;
    late PrefrontalClient client;
    late MemoryNotifier notifier;

    setUp(() {
      http = _FakeHttp();
      client = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http,
      );
      notifier = MemoryNotifier(client);
    });

    /// ⚠️ **`MemoryNotifier` 的构造函数自己就 `loadMemories()` 一次**
    /// ⇒ ⇒ 判据要**先把那一发记掉**，再断言自己发起的那一格
    /// ⇒ ⇒ 否则量到的是「构造时那发」，不是「我发的那发」。
    Future<void> settle() async {
      await Future<void>.delayed(Duration.zero);
      http.methods.clear();
      http.urls.clear();
      http.bodies.clear();
    }

    test('列表走 `GET /api/memory`（**不是**空查询的搜索）', () async {
      await settle();
      await notifier.loadMemories();

      expect(http.methods, ['GET']);
      expect(http.urls.single, contains('/hippocampus/api/memory'));
      // ⇒ ⇒ **不许**打搜索面（那一格永远被 `min_score` 滤空）。
      expect(http.urls.single, isNot(contains('/api/search')));
    });

    test('搜索显式带 `minScore: 0.0`（不许让服务端那个 0.3 滤掉）', () async {
      await settle();
      await notifier.search('猫');

      expect(http.methods, ['POST']);
      expect(http.urls.single, contains('/hippocampus/api/search'));
      final body = jsonDecode(http.bodies.single) as Map<String, dynamic>;
      expect(body['minScore'], 0.0);
      expect(body['query'], '猫');
    });

    test('`copyWith` 不许抹掉错误（失败不许长得像「没有记忆」）', () {
      const state = MemoryState();
      final withError = state.copyWith(error: 'boom');
      expect(withError.error, 'boom');

      // ⇒ ⇒ 一次**不提 error** 的更新 ⇒ ⇒ 错误**留着**。
      final afterUpdate = withError.copyWith(memories: const []);
      expect(afterUpdate.error, 'boom');

      // ⇒ ⇒ **显式**置空 ⇒ ⇒ 才清得掉。
      expect(afterUpdate.copyWith(error: null).error, isNull);
    });

    test('`copyWith` 不许悄悄重置维度筛选', () {
      const state = MemoryState();
      final withDimension = state.copyWith(selectedDimension: 'User');
      expect(withDimension.selectedDimension, 'User');

      // ⇒ ⇒ 别的更新 ⇒ ⇒ 维度**留着**。
      expect(withDimension.copyWith(memories: const []).selectedDimension, 'User');
      // ⇒ ⇒ 显式清空 ⇒ ⇒ 才清得掉。
      expect(withDimension.copyWith(selectedDimension: null).selectedDimension, isNull);
    });

    test('维度名大小写要对得上（界面上是 User、海马体给 user）', () {
      final state = MemoryState(
        memories: [
          MemoryInfo(
            id: 'm1',
            content: '一条用户记忆',
            dimension: 'user',
            createdAt: DateTime(2026, 11, 17),
          ),
        ],
      ).copyWith(selectedDimension: 'User');

      // ⇒ ⇒ 筛选完**还在**（以前是空的 —— 一条都对不上）。
      expect(state.filteredMemories, hasLength(1));
    });
  });
}
