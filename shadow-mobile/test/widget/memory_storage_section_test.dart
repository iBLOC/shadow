import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/widgets/settings/memory_storage_section.dart';

import 'test_helper.dart';

/// **记忆存储**设置分区。
///
/// ⚠️ 钉两格：
/// ① **读不到控制面（503）≠ 未配置** —— 不许画成「未配置」；
/// ② 已配置 s3 时，位置回填、密钥显示掩码（`***`）⇒ 原样保存即保留原值。
class _FakeClient extends TelencephalonClient {
  _FakeClient({this.section, this.error})
      : super(baseUrl: 'http://127.0.0.1:1');

  final Map<String, dynamic>? section;
  final Object? error;
  final puts = <String>[];
  /// 迁移面的调用记录（`uri`）—— 换根必须走它，不许只写 storage_uri。
  final migrationStarts = <Map<String, dynamic>>[];
  final cancels = <String>[];
  /// 状态面依次返回这些（模拟「正在搬 → 完成」）。
  List<Map<String, dynamic>> migrationStatuses = const [];

  @override
  Future<Map<String, dynamic>> configSection(String section) async {
    if (error != null) throw error!;
    return this.section ?? {'section': 'hippocampus', 'entries': const [], 'applies_when': 'restart'};
  }

  @override
  Future<Map<String, dynamic>> putConfig(
    String section,
    String key,
    Object? value, {
    bool secret = false,
  }) async {
    puts.add('$key=$value');
    return {'key': key, 'value': '***', 'applies_when': 'restart'};
  }

  @override
  Future<void> deleteConfig(String section, String key) async {}

  @override
  Future<Map<String, dynamic>> startStorageMigration(
    Map<String, dynamic> target,
  ) async {
    migrationStarts.add(target);
    return {'needs_migration': true, 'state': 'copying'};
  }

  @override
  Future<Map<String, dynamic>> storageMigration() async {
    if (migrationStatuses.isEmpty) {
      return {'state': 'idle'};
    }
    return migrationStatuses.removeAt(0);
  }

  @override
  Future<Map<String, dynamic>> cancelStorageMigration() async {
    cancels.add('cancel');
    return {'cancel_requested': true};
  }
}

void main() {
  testSetup();

  Widget app(Widget child) => MaterialApp(
        // ⚠️ 用 `GlobalMaterialLocalizations.delegates`（复数）：它把 Cupertino
        // 那一份也声明上 —— 否则 zh 会报「Cupertino delegate not found」。
        localizationsDelegates: [
          AppLocalizations.delegate,
          ...GlobalMaterialLocalizations.delegates,
        ],
        supportedLocales: const [Locale('zh')],
        locale: const Locale('zh'),
        home: Scaffold(body: SingleChildScrollView(child: child)),
      );

  testWidgets('读不到控制面 ⇒ 说「读不到配置中心」，不是「未配置」', (tester) async {
    final client = _FakeClient(error: StateError('POST /config/hippocampus → 503'));
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [telencephalonClientProvider.overrideWithValue(client)],
        child: app(const MemoryStorageSection()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('读不到配置中心'), findsOneWidget);
    // ⚠️ 这一句是这一格的全部意义。
    expect(find.text('未配置（走默认位置）'), findsNothing);
    // 原因与构建边界都要说出来。
    expect(find.textContaining('503'), findsOneWidget);
    expect(find.textContaining('mobile-memory'), findsWidgets);
  });

  _migrationTests();

  testWidgets('已配置 s3 ⇒ 回填位置、密钥显示 ***、状态是「已配置」', (tester) async {
    final client = _FakeClient(
      section: {
        'section': 'hippocampus',
        'applies_when': 'restart',
        'entries': [
          {'key': 'storage_uri', 'value': 's3://bucket/prefix'},
          {'key': 'storage_endpoint', 'value': 'http://127.0.0.1:9000'},
          {'key': 'storage_access_key', 'value': '***', 'secret': true},
          {'key': 'storage_secret_key', 'value': '***', 'secret': true},
        ],
      },
    );
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [telencephalonClientProvider.overrideWithValue(client)],
        child: app(const MemoryStorageSection()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('已配置'), findsOneWidget);
    // 位置字段回填成 s3://…
    expect(find.text('s3://bucket/prefix'), findsOneWidget);
    // 掩码原样显示（保存时跳过，不当新密钥写回去）。
    expect(find.text('***'), findsNWidgets(2));

    // 保存：只写非秘密的键，秘密保持不动。
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(client.puts.any((p) => p.startsWith('storage_uri=')), isTrue);
    expect(client.puts.any((p) => p.startsWith('storage_access_key=')), isFalse);
    expect(client.puts.any((p) => p.startsWith('storage_secret_key=')), isFalse);
    expect(find.textContaining('重启大脑后生效'), findsOneWidget);
  });
}

// ─────────────────────────────────────────────────────────────────────
// **换存储 = 迁移**（2026-11-13）
// ─────────────────────────────────────────────────────────────────────

void _migrationTests() {
  testWidgets('换根 ⇒ 调迁移面，且**不**直接写 storage_uri', (tester) async {
    final client = _FakeClient(section: {
      'section': 'hippocampus',
      'entries': [
        {'key': 'storage_uri', 'value': '/data/old-lance'},
      ],
      'applies_when': 'restart',
    });
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [telencephalonClientProvider.overrideWithValue(client)],
        child: MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            ...GlobalMaterialLocalizations.delegates,
          ],
          supportedLocales: const [Locale('zh')],
          locale: const Locale('zh'),
          home: const Scaffold(body: SingleChildScrollView(child: MemoryStorageSection())),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, '/data/new-lance');
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();

    expect(client.migrationStarts, hasLength(1));
    expect(client.migrationStarts.first['uri'], '/data/new-lance');
    // ⚠️ 这一格是全部意义：换根**不能**只写一行 URI。
    expect(client.puts.any((p) => p.startsWith('storage_uri=')), isFalse);
  });

  testWidgets('同一个根 ⇒ 走老路径（直接写配置，不启动迁移）', (tester) async {
    final client = _FakeClient(section: {
      'section': 'hippocampus',
      'entries': [
        {'key': 'storage_uri', 'value': '/data/old-lance'},
      ],
      'applies_when': 'restart',
    });
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [telencephalonClientProvider.overrideWithValue(client)],
        child: MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            ...GlobalMaterialLocalizations.delegates,
          ],
          supportedLocales: const [Locale('zh')],
          locale: const Locale('zh'),
          home: const Scaffold(body: SingleChildScrollView(child: MemoryStorageSection())),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();

    expect(client.migrationStarts, isEmpty);
    expect(client.puts.any((p) => p.startsWith('storage_uri=')), isTrue);
  });

  testWidgets('迁移中 ⇒ 阻塞对话框带数据集进度', (tester) async {
    final client = _FakeClient(section: {
      'section': 'hippocampus',
      'entries': [
        {'key': 'storage_uri', 'value': '/data/old-lance'},
      ],
      'applies_when': 'restart',
    })
      ..migrationStatuses = [
        {
          'state': 'copying',
          'datasets_done': 3,
          'datasets_total': 10,
          'current': 'messages',
        },
        {'state': 'copying', 'datasets_done': 4, 'datasets_total': 10},
      ];
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [telencephalonClientProvider.overrideWithValue(client)],
        child: MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            ...GlobalMaterialLocalizations.delegates,
          ],
          supportedLocales: const [Locale('zh')],
          locale: const Locale('zh'),
          home: const Scaffold(body: SingleChildScrollView(child: MemoryStorageSection())),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, '/data/new-lance');
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();

    expect(find.text('正在迁移记忆存储'), findsOneWidget);
    expect(find.textContaining('数据集'), findsWidgets);
    // 阻塞层：没有关闭钮、点遮罩不关（`barrierDismissible: false`）。
    expect(find.byType(AlertDialog), findsOneWidget);
  });
}
