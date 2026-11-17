import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/screens/memory_screen.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';

/// 「**记忆页读得出**」这一格（2026-11-17 真机取证）。
///
/// ## 这一格为什么是承重的
///
/// ⚠️ 用户在真机上看到的是「**记忆一条都没有**」⇒ ⇒ 而海马体**明明有**
/// ⇒ ⇒ 那一格全是**读面自己**的毛病：
///
/// ❶ **列表走的是「空查询的搜索」**（`searchMemory('')`）⇒ ⇒ 空查询在混合
///    检索里**没有词**⇒ ⇒ 得分低于服务端 `min_score`（**0.3**）⇒ ⇒ 整条
///    被滤掉 ⇒ ⇒ **界面上是空的**。
/// ❷ **维度筛选比的是大小写**：界面上的值是 `User`，服务端给的是 `user`
///    ⇒ ⇒ `!=` 比 ⇒ ⇒ **一条都对不上** ⇒ ⇒ 用户一点「用户」维度，列表**整个空了**。
/// ❸ **`copyWith` 把错误与维度悄悄清掉** ⇒ ⇒ 「加载失败」那条横幅下一次
///    更新就没了 ⇒ ⇒ 用户只看到「空的记忆列表」⇒ ⇒ **失败长得像成功**。
///
/// ⇒ ⇒ 这一格钉的是：列表走**列表面**、搜索**显式给 `minScore`**、维度
/// **大小写无关**、`copyWith` **不清掉**错误与维度。

/// 一条记忆（服务端形状：snake_case 的 `created_at`）。
Map<String, dynamic> _memory(String id, String content, String dimension) => {
  'id': id,
  'uri': 'memory://user/$id',
  'content': content,
  'dimension': dimension,
  'created_at': '2026-11-17T00:00:00Z',
};

void main() {
  test('列表走**列表面**（不是空查询的搜索）', () async {
    final requests = <http.Request>[];
    final client = PrefrontalClient(
      baseUrl: 'http://127.0.0.1:1',
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(
          jsonEncode([_memory('m1', '我在北京', 'user')]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final notifier = MemoryNotifier(client);
    await notifier.loadMemories();

    expect(
      requests.where(
        (r) => r.method == 'GET' && r.url.path.endsWith('/api/memory'),
      ),
      isNotEmpty,
      reason: 'the list must go through GET /api/memory ⇒ ⇒ an empty search '
          'has no words and scores below the server min_score ⇒ ⇒ '
          'everything is filtered out',
    );
    expect(
      requests.where(
        (r) => r.method == 'POST' && r.url.path.endsWith('/api/search'),
      ),
      isEmpty,
      reason: 'the list must not be a search ⇒ ⇒ a search is a different face',
    );
    expect(notifier.state.memories, hasLength(1));
    expect(notifier.state.memories.first.content, '我在北京');
    expect(
      notifier.state.error,
      isNull,
      reason: 'a successful load must not leave an error banner behind',
    );
  });

  test('搜索**显式给 minScore**（不然服务端的 0.3 会把结果滤光）', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = PrefrontalClient(
      baseUrl: 'http://127.0.0.1:1',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
        }
        return http.Response(
          jsonEncode([
            {
              'memory': _memory('m1', '我在北京', 'user'),
              'score': 0.42,
              'source': 'lexical',
            },
          ]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final notifier = MemoryNotifier(client);
    await notifier.search('北京');

    expect(bodies, isNotEmpty, reason: 'the search must reach the server');
    expect(
      bodies.first['minScore'],
      0.0,
      reason: 'the server defaults min_score to 0.3 ⇒ ⇒ without this the '
          'results are filtered out ⇒ ⇒ the page looks empty while memories exist',
    );
    expect(notifier.state.memories, hasLength(1));
    expect(
      notifier.state.memories.first.score,
      0.42,
      reason: 'the score lives outside the memory object ⇒ ⇒ it must be carried over',
    );
  });

  test('维度筛选**大小写无关**（界面 `User` ↔ 服务端 `user`）', () {
    final state = MemoryState(
      memories: [
        MemoryInfo.fromJson(_memory('m1', '我在北京', 'user')),
        MemoryInfo.fromJson(_memory('m2', '端脑的技能', 'agent')),
      ],
      selectedDimension: 'User',
    );

    expect(
      state.filteredMemories.map((m) => m.content),
      ['我在北京'],
      reason: 'the filter chips say "User" while the server says "user" ⇒ ⇒ '
          'a case-sensitive compare silently empties the list',
    );
  });

  test('`copyWith` **不清掉**错误与维度（哨兵）', () {
    const state = MemoryState(
      error: 'boom',
      selectedDimension: 'User',
    );

    final after = state.copyWith(isLoading: false);

    expect(
      after.error,
      'boom',
      reason: 'an update that does not mention the error must not clear it ⇒ ⇒ '
          'the failure banner disappears and the user sees an empty list instead',
    );
    expect(
      after.selectedDimension,
      'User',
      reason: 'an update that does not mention the dimension must not reset it ⇒ ⇒ '
          'the filter the user picked vanishes on the next refresh',
    );
  });
}
