import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/model_metadata_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/database/model_metadata.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/widgets/models/self_hosted_model_sheet.dart';

/// 「添加自持模型」表单的契约。
///
/// 钉四条：
/// ① 智能配置 —— 输入已知模型 ID（qwen3:32b）⇒ 停顿后自动填充
///    上下文窗口 / 推理档位，并挂「已智能配置」徽标；
/// ② 未命中 ⇒ 不挂徽章（不许装懂）；
/// ③ 探测 —— 接入点 preview 返回的列表可点选回填模型 ID；
/// ④ 提交链 —— 大脑 addProvider（custom/openai）→ selected_model
///    直选 → 元数据落库 → pop(true)。
void main() {
  final clientCalls = <String>[];

  Future<void> pumpSheet(
    WidgetTester tester, {
    required TelencephalonClient client,
    required ModelMetadataRepository metadata,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          telencephalonClientProvider.overrideWithValue(client),
          modelMetadataRepositoryProvider.overrideWithValue(metadata),
        ],
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          locale: const Locale('en'),
          home: const Scaffold(body: SizedBox()),
        ),
      ),
    );
    // 弹出表单。
    final popped = SelfHostedModelSheet.show(
      tester.element(find.byType(Scaffold)),
    );
    await tester.pumpAndSettle();
    // Future 句柄留给最后一条用例 —— 这里只是为了把表单挂上树。
    popped.ignore();
  }

  testWidgets('① 智能配置：qwen3:32b ⇒ 自动填充＋徽章', (tester) async {
    await pumpSheet(
      tester,
      client: _FakeClient(onCall: (m) => clientCalls.add(m)),
      metadata: _FakeMetadataRepo(),
    );

    // 未输入 ⇒ 不挂徽章（不许装懂）。
    expect(find.textContaining('Smart config'), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Model ID'), 'qwen3:32b');
    // 去抖 400ms ⇒ 推时间让 Timer 触发。
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    // 徽章出现（家族名 qwen3 跟着说清来源）。
    expect(find.textContaining('Smart config'), findsOneWidget);
    expect(find.textContaining('qwen3'), findsWidgets);
    // 上下文窗口自动填充（注册表出厂值 128000）。
    final contextField = tester.widget<TextField>(
      find.widgetWithText(TextField, 'Context window'),
    );
    expect(contextField.controller!.text, '128000');
  });

  testWidgets('② 未命中 ⇒ 无徽章（探测兜底的入口还在）', (tester) async {
    await pumpSheet(
      tester,
      client: _FakeClient(onCall: (m) => clientCalls.add(m)),
      metadata: _FakeMetadataRepo(),
    );

    await tester.enterText(
      find.widgetWithText(TextField, 'Model ID'),
      'my-private-finetune-v99',
    );
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(find.textContaining('Smart config'), findsNothing);
    expect(find.text('Probe models from endpoint'), findsOneWidget);
  });

  testWidgets('③ 探测：preview 列表点选回填模型 ID', (tester) async {
    await pumpSheet(
      tester,
      client: _FakeClient(
        onCall: (m) => clientCalls.add(m),
        preview: const [RegisteredModel(id: 'llama3:8b', name: 'Llama 3 8B')],
      ),
      metadata: _FakeMetadataRepo(),
    );

    await tester.enterText(
      find.widgetWithText(TextField, 'Endpoint (OpenAI-compatible base URL)'),
      'http://127.0.0.1:8080/v1',
    );
    await tester.ensureVisible(find.text('Probe models from endpoint'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Probe models from endpoint'));
    await tester.pumpAndSettle();

    // 点选探测结果里的 llama3:8b ⇒ 回填模型 ID 栏。
    await tester.tap(find.text('llama3:8b'));
    await tester.pumpAndSettle();

    final modelField = tester.widget<TextField>(
      find.widgetWithText(TextField, 'Model ID'),
    );
    expect(modelField.controller!.text, 'llama3:8b');
  });

  testWidgets('④ 提交链：addProvider → selected_model → 元数据落库 → pop(true)', (
    tester,
  ) async {
    final metadata = _FakeMetadataRepo();
    late bool popped;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          telencephalonClientProvider.overrideWithValue(
            _FakeClient(onCall: (m) => clientCalls.add(m)),
          ),
          modelMetadataRepositoryProvider.overrideWithValue(metadata),
        ],
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          locale: const Locale('en'),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () async {
                    popped = await SelfHostedModelSheet.show(context);
                  },
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Model ID'),
      'qwen3:32b',
    );
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    clientCalls.clear();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();

    // 大脑侧两连：custom provider ＋ selected_model 直选。
    expect(clientCalls, contains('addProvider'));
    expect(clientCalls, contains('updateProvider'));
    // 元数据落库（键 = 模型 ID，来源 = 智能配置）。
    final saved = await metadata.get('qwen3:32b');
    expect(saved, isNotNull);
    expect(saved!.source, 'smart_config');
    expect(saved.reasoningLevels, 2);
    // 表单以「成功」关闭。
    expect(popped, isTrue);
  });
}

class _FakeClient extends TelencephalonClient {
  _FakeClient({required this.onCall, this.preview = const []})
      : super(baseUrl: 'http://127.0.0.1:1');

  final void Function(String method) onCall;
  final List<RegisteredModel> preview;

  @override
  Future<RegisteredProvider> addProvider({
    String? presetId,
    String? name,
    String? baseUrl,
    String? providerType,
    String? apiKey,
  }) async {
    onCall('addProvider');
    return RegisteredProvider(
      id: 'prov_1',
      name: name ?? '',
      baseUrl: baseUrl ?? '',
      apiStandard: providerType ?? 'openai',
      enabled: true,
    );
  }

  @override
  Future<RegisteredProvider> updateProvider(
    String id, {
    bool? enabled,
    String? selectedModel,
    String? apiKey,
    String? name,
    String? baseUrl,
    String? providerType,
  }) async {
    onCall('updateProvider');
    return RegisteredProvider(
      id: id,
      name: name ?? '',
      baseUrl: baseUrl ?? '',
      apiStandard: providerType ?? 'openai',
      enabled: true,
      selectedModel: selectedModel,
    );
  }

  @override
  Future<List<RegisteredModel>> previewProviderModels({
    String? presetId,
    String? baseUrl,
    String? apiStandard,
    String? apiKey,
  }) async {
    onCall('previewProviderModels');
    return preview;
  }
}

/// 内存版元数据仓储（真库的读是真实文件 I/O，fake-async 里永不完成）。
class _FakeMetadataRepo extends ModelMetadataRepository {
  final Map<String, ModelMetadata> _store = {};

  @override
  Future<ModelMetadata?> get(String modelId) async => _store[modelId];

  @override
  Future<Map<String, ModelMetadata>> getAll() async => Map.of(_store);

  @override
  Future<void> put(ModelMetadata metadata) async {
    _store[metadata.modelId] = metadata;
  }

  @override
  Future<void> delete(String modelId) async {
    _store.remove(modelId);
  }
}
