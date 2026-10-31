import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// **界面文案随用户的语言走** —— 端脑在 `Accept-Language` 里挑语言。
///
/// ## 为什么这条测试承重
///
/// 端脑画的**界面**里那些**字**也是端脑产的（`Tasks (1)` / `任务（1）`）
/// ⇒ 那些字得跟用户说的话是同一种语言
/// ⇒ 客户端必须报出「我要哪种语言」
/// ⇒ 真相源在服务端（`telencephalon/src/a2a/a2ui_i18n.rs`），
/// 客户端只负责把语言**报出去**。
///
/// ⚠️ **少了这个头不会报错** —— 端脑会**安静地**用英文作答
/// ⇒ 界面上就是中英混排（标题英文、周边界面中文）
/// ⇒ 这类「失败长得像成功」只能靠断言钉住。
///
/// ## 还钉住「语言是请求时现读」
///
/// 系统语言可以在 App 运行时改 ⇒ 构造时取值 ⇒ 用户换语言后界面仍是旧语言。
void main() {
  test('A2UI 请求带上用户语言，且语言是「请求时现读」', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
    // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
    HttpOverrides.global = null;

    // 回放端脑的**真实** SSE 字节 ⇒ 客户端会真的把它消费掉。
    final sse = _readSseFixture();

    final arrivals = <Completer<void>>[];
    final seenLocales = <String?>[];

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      seenLocales.add(request.headers.value('accept-language'));
      request.response.headers.contentType =
          ContentType('text', 'event-stream', charset: 'utf-8');
      // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按
      // **latin1** 编码 ⇒ 载荷里的中文会抛
      // `Invalid argument (string): Contains invalid characters.`。
      request.response.add(utf8.encode(sse));
      await request.response.close();
      if (arrivals.isNotEmpty) {
        arrivals.removeAt(0).complete();
      }
    });

    // 模拟「用户换语言」：先是英文，后来改成中文。
    var locale = 'en';
    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
      localeProvider: () => locale,
    );

    // 「客户端已消费完这份响应」的信号 —— 每份响应都会带来一次
    // `beginRendering` ⇒ 一次 `SurfaceAdded` ⇒ 一次 surface 列表更新。
    var surfacesSeen = 0;
    final subscription = service.surfaceIdsStream.listen((_) {
      surfacesSeen++;
    });

    final first = Completer<void>();
    arrivals.add(first);
    service.sendMessage('我的任务');
    await first.future.timeout(const Duration(seconds: 10));
    await _waitUntil(() => surfacesSeen >= 1);

    locale = 'zh';
    final second = Completer<void>();
    arrivals.add(second);
    service.sendMessage('我的任务');
    await second.future.timeout(const Duration(seconds: 10));
    await _waitUntil(() => surfacesSeen >= 2);

    expect(seenLocales, hasLength(2), reason: '两次请求都应当到达服务端');
    expect(
      seenLocales[0],
      'en',
      reason: '第一次请求要带上 App 当时的语言',
    );
    expect(
      seenLocales[1],
      'zh',
      reason: '语言必须是**请求时现读** —— 构造时取值 ⇒ 用户换语言后界面仍是旧语言',
    );

    await subscription.cancel();
    service.dispose();
    await server.close(force: true);
  });
}

/// 等到 [predicate] 成立（上限 10 秒）。
Future<void> _waitUntil(bool Function() predicate) async {
  for (var i = 0; i < 200; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  throw StateError('等待超时（10 秒）');
}

/// 读端脑导出的 SSE fixture。
String _readSseFixture() {
  const relative = 'fixtures/a2ui/tasks_sse.txt';
  final candidates = <File>[
    File('../$relative'),
    File('../../$relative'),
    File(relative),
  ];
  for (final candidate in candidates) {
    if (candidate.existsSync()) {
      return candidate.readAsStringSync();
    }
  }
  throw StateError(
    '找不到 SSE fixture。试过：'
    '${candidates.map((f) => f.path).join(' | ')}'
    '（当前工作目录 ${Directory.current.path}）',
  );
}
