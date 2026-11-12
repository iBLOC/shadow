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
