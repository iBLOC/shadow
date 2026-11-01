import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/log_service.dart';

/// `PrefrontalLogStream` 的 SSE 解析 —— 2026-11-01 之前它有两处丢日志：
///
///  1. `_processBuffer` 每收到一个 TCP 段就把整个缓冲解析一遍再**清空** ——
///     跨段的 `data: {...}`（JSON 被切在两个 TCP 段里）解析失败后连同半行
///     一起被扔掉，**静默丢条目**；
///  2. 手写 JSON 解析器不认转义引号 —— message 里带 `\"` 就解析成垃圾。
///
/// 现在的实现：只消费完整行（不完整尾行留在缓冲里）+ 剥 HTTP 响应头 +
/// `dart:convert` 真解码。这里钉住这三条性质。
void main() {
  late List<LogEntry> received;
  late PrefrontalLogStream stream;

  setUp(() {
    received = [];
    stream = PrefrontalLogStream(
      baseUrl: 'http://127.0.0.1:1',
      onLog: received.add,
    );
  });

  test('剥掉 HTTP 响应头，解析第一帧 data 行', () {
    stream.consume(
      'HTTP/1.1 200 OK\r\n'
      'Content-Type: text/event-stream\r\n'
      '\r\n'
      'data: {"timestamp":"2026-11-01T10:00:00.000Z","level":"info","target":"lobe","message":"hello"}\n'
      '\n',
    );
    expect(received, hasLength(1));
    expect(received.first.message, 'hello');
    expect(received.first.tag, 'lobe');
    expect(received.first.source, LogSource.prefrontal);
  });

  test('跨 TCP 段的 data 帧不丢（旧实现在此丢条目）', () {
    const frame =
        'data: {"timestamp":"2026-11-01T10:00:01.000Z","level":"error","target":"lobe","message":"split across segments"}\n\n';
    final cut = frame.indexOf('across');
    stream.consume(frame.substring(0, cut));
    expect(received, isEmpty,
        reason: '帧还没到齐 —— 半行必须留在缓冲里，不能被解析失败后扔掉');
    stream.consume(frame.substring(cut));
    expect(received, hasLength(1));
    expect(received.first.message, 'split across segments');
  });

  test('message 含转义引号也能解出（手写解析器的盲区）', () {
    stream.consume(
      'data: {"timestamp":"2026-11-01T10:00:02.000Z","level":"warning","target":"lobe","message":"say \\"hi\\" now"}\n\n',
    );
    expect(received, hasLength(1));
    expect(received.first.message, 'say "hi" now');
  });

  test('event: 行与注释行不产条目', () {
    stream.consume(
      ': keep-alive\n'
      'event: log\n'
      'data: {"timestamp":"2026-11-01T10:00:03.000Z","level":"info","target":"t","message":"only-data-counts"}\n\n',
    );
    expect(received, hasLength(1));
    expect(received.first.message, 'only-data-counts');
  });
}
