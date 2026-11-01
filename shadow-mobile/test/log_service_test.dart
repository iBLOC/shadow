import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/log_service.dart';

/// 日志来源的**名字**要跟它装的东西对上。
///
/// ⚠️ **它以前叫 `prefrontal`** —— 那时它装的是遗留嵌入式 Prefrontal 的
/// SSE 流（`GET /api/logs/stream`）。那个运行时整条退役之后，那一路没有了 ⇒
/// ⇒ 这个来源现在**只**装**客户端错误**（`global_error_listener.dart` 喂的）
/// ⇒ ⇒ 名字得跟着内容改，否则筛选项上写着「后端」、里面装的是客户端错误
/// ⇒ ⇒ 「界面说谎」。
///
/// 这条测试钉住那个改名 —— 防止它又被改回去，或者被换成第三个名字。
void main() {
  group('日志来源', () {
    test('客户端错误落在 client 这一路上（不是旧的 prefrontal）', () {
      final service = LogService();
      service.addClientError(tag: 'GlobalError', message: 'boom');

      expect(service.state.logs, hasLength(1));
      final entry = service.state.logs.first;
      expect(entry.source, LogSource.client);
      expect(entry.tag, 'GlobalError');
      expect(entry.level, LogLevel.error);
      expect(entry.message, contains('boom'));
    });

    test('Dart 侧 package:logging 的记录落在 app 这一路上', () {
      final service = LogService();
      service.addDartLog('EncephalonMobileNotifier', 'INFO', '大脑启动成功');

      final entry = service.state.logs.first;
      expect(entry.source, LogSource.app);
      expect(entry.tag, 'EncephalonMobileNotifier');
    });

    test('导出 CSV 里的来源列用的是新名', () {
      final service = LogService();
      service.addClientError(tag: 'GlobalError', message: 'boom');

      final csv = service.exportLogs();
      expect(csv, contains(',client,'));
      expect(csv, isNot(contains('prefrontal')));
    });
  });
}
