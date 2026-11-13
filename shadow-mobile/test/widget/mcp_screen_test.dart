import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/mcp_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'test_helper.dart';

/// 端脑 admin 面的假 —— ⚠️ 替身不是摆设：每一发都记载荷/调用次数，
/// 断言读的就是这些记录（R5 同款纪律）。
class _FakeMcpClient extends TelencephalonClient {
  _FakeMcpClient() : super(baseUrl: 'http://127.0.0.1:1');

  List<Map<String, dynamic>> servers = [];
  Object? listError;
  final List<Map<String, dynamic>> created = [];
  final List<String> started = [];
  final List<String> stopped = [];
  final List<String> deleted = [];

  @override
  Future<List<Map<String, dynamic>>> listMcpServers() async {
    if (listError != null) throw listError!;
    return servers;
  }

  @override
  Future<Map<String, dynamic>> createMcpServer({
    required String name,
    String wasmName = '',
    String wasmVersion = '',
    String wasmSha256 = '',
    int? memoryBytes,
    int? fuel,
    int? wallClockMs,
    String? description,
    Map<String, dynamic>? transport,
  }) async {
    created.add({
      'name': name,
      'wasm': {'name': wasmName, 'version': wasmVersion, 'sha256': wasmSha256},
      'description': ?description,
      'transport': ?transport,
    });
    return {'id': 'srv-new', 'name': name};
  }

  @override
  Future<Map<String, dynamic>> startMcpServer(String id) async {
    started.add(id);
    return {'id': id, 'state': 'running'};
  }

  @override
  Future<Map<String, dynamic>> stopMcpServer(String id) async {
    stopped.add(id);
    return {'id': id, 'state': 'stopped'};
  }

  @override
  Future<void> deleteMcpServer(String id) async {
    deleted.add(id);
    servers = servers.where((s) => s['id'] != id).toList();
  }
}

Map<String, dynamic> _record({
  String id = 'srv-1',
  String name = 'ha-mcp',
  String state = 'running',
  String url = 'http://192.168.31.50:9584/private_abc',
  String? lastError,
}) {
  return {
    'id': id,
    'name': name,
    'description': 'Home Assistant control & automation (ha-mcp)',
    'wasm': {'name': '', 'version': '', 'sha256': ''},
    'quota': <String, dynamic>{},
    'transport': {'kind': 'http', 'url': url},
    'state': state,
    'last_error': lastError,
    'tools': [
      {'name': 'get_states'},
    ],
  };
}

void main() {
  testSetup();

  late _FakeMcpClient client;

  setUp(() {
    client = _FakeMcpClient();
  });

  Widget buildScreen() => ProviderScope(
    overrides: [telencephalonClientProvider.overrideWithValue(client)],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('en'),
      home: const MCPScreen(),
    ),
  );

  group('MCPScreen 端脑面（不再是本地死表）', () {
    testWidgets('清单来自端脑：http 记录画出名称、URL 行、开关按 running', (
      WidgetTester tester,
    ) async {
      client.servers = [_record()];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();

      expect(find.text('ha-mcp'), findsOneWidget);
      expect(find.textContaining('private_abc'), findsOneWidget);
      final sw = find.byType(Switch);
      expect(sw, findsOneWidget);
      // running ⇒ 开关开
      expect(tester.widget<Switch>(sw).value, isTrue);
    });

    testWidgets('读不到 ≠ 没有：error 画错误面，不画空态', (
      WidgetTester tester,
    ) async {
      client.listError = TelencephalonException('connection refused');
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();

      final l10n = AppLocalizations.of(
        tester.element(find.byType(MCPScreen)),
      )!;
      expect(find.text(l10n.mcpLoadFailed), findsOneWidget);
      expect(find.text(l10n.mcpEmpty), findsNothing);
      expect(find.textContaining('connection refused'), findsOneWidget);
    });

    testWidgets('真没有才画空态', (WidgetTester tester) async {
      client.servers = [];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(MCPScreen)),
      )!;
      expect(find.text(l10n.mcpEmpty), findsOneWidget);
      expect(find.text(l10n.mcpLoadFailed), findsNothing);
    });

    testWidgets(
      'ha-mcp 模板：预填名称与提示；URL 空不许盲发；提交载荷逐字 http transport',
      (WidgetTester tester) async {
        client.servers = [];
        await tester.pumpWidget(buildScreen());
        await tester.pumpAndSettle();

        final l10n = AppLocalizations.of(
          tester.element(find.byType(MCPScreen)),
        )!;
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();

        // 模板条在
        expect(find.text(l10n.mcpTemplateLabel), findsOneWidget);
        await tester.tap(find.text('Home Assistant · ha-mcp'));
        await tester.pump();

        // 名称预填 ha-mcp（可编辑）＋ 两条提示出现
        final fields = find.byType(TextField);
        expect(tester.widget<TextField>(fields.at(0)).controller!.text, 'ha-mcp');
        expect(find.text(l10n.mcpHaMcpUrlHint), findsOneWidget);
        expect(find.text(l10n.mcpHaMcpBearerHint), findsOneWidget);

        // 不盲发：URL 空 ⇒ Add 钮禁用 ⇒ 点了也不发
        FilledButton add = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, l10n.commonAdd),
        );
        expect(add.onPressed, isNull);

        await tester.enterText(fields.at(1), 'http://10.0.0.5:9584/private_zz');
        await tester.pump();
        add = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, l10n.commonAdd),
        );
        expect(add.onPressed, isNotNull);
        await tester.tap(find.widgetWithText(FilledButton, l10n.commonAdd));
        await tester.pumpAndSettle();

        // 恰好一发，载荷形状逐字：http transport ＋ 占位 wasm（老端脑）＋
        // 空 bearer ⇒ 不带 bearer 键
        expect(client.created.length, 1);
        expect(client.created[0], {
          'name': 'ha-mcp',
          'wasm': {'name': '', 'version': '', 'sha256': ''},
          'description': l10n.mcpHaMcpDescription,
          'transport': {'kind': 'http', 'url': 'http://10.0.0.5:9584/private_zz'},
        });
        // 成功后对话框关掉，清单刷新（假 client 还没回这一台 ⇒ 空态）
        expect(find.byType(AlertDialog), findsNothing);
      },
    );

    testWidgets('填了 bearer 才递 bearer 键；自定义模板不带描述', (
      WidgetTester tester,
    ) async {
      client.servers = [];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(MCPScreen)),
      )!;

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'gateway');
      await tester.enterText(fields.at(1), 'http://gw.local/mcp');
      await tester.enterText(fields.at(2), 'tok-9');
      await tester.tap(find.widgetWithText(FilledButton, l10n.commonAdd));
      await tester.pumpAndSettle();

      expect(client.created[0], {
        'name': 'gateway',
        'wasm': {'name': '', 'version': '', 'sha256': ''},
        'transport': {'kind': 'http', 'url': 'http://gw.local/mcp', 'bearer': 'tok-9'},
      });
      expect(client.created[0].containsKey('description'), isFalse);
    });

    testWidgets('开关 = 端脑 start/stop，不写本地布尔', (
      WidgetTester tester,
    ) async {
      client.servers = [_record(state: 'running')];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();

      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(client.stopped, ['srv-1']);

      client.servers = [_record(state: 'stopped')];
      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(client.started, ['srv-1']);
    });

    testWidgets('启动失败：last_error 原话要看得见（不是无声变灰）', (
      WidgetTester tester,
    ) async {
      client.servers = [
        _record(
          state: 'error',
          lastError: 'http: status 404',
        ),
      ];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();
      expect(find.textContaining('http: status 404'), findsOneWidget);
    });

    testWidgets('删除走端脑 DELETE', (WidgetTester tester) async {
      client.servers = [_record(state: 'stopped')];
      await tester.pumpWidget(buildScreen());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.delete));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(AlertDialog)),
      )!;
      // 卡片上也有一个「Delete」钮 ⇒ 必须把确认钮限定在对话框内
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.widgetWithText(TextButton, l10n.commonDelete),
        ),
      );
      await tester.pumpAndSettle();
      expect(client.deleted, ['srv-1']);
    });
  });
}
