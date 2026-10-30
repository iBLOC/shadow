import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/model_management_screen.dart';
import 'package:shadow_mobile/services/database/app_settings.dart';
import 'package:shadow_mobile/services/database/model_item.dart';
import 'package:shadow_mobile/services/database/repositories.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// Encephalon（大脑）嵌入式运行时的 **notifier** 单测。
///
/// 验的是「默认启动」这条产品约定：
/// - App 一起来，**没在跑** ⇒ notifier 自己把它拉起来（用户不需要去
///   设置页点「启动大脑」）；
/// - **已经在跑**（App 被系统重建后进程还在）⇒ 接管现成的，绝不重复 boot；
/// - 启动失败 ⇒ 自动重试，而不是让用户手动再点一次。
///
/// 走 MethodChannel mock —— 不需要真机，也不需要 libencephalon.so。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late List<MethodCall> calls;

  /// 装一个假的 MethodChannel。
  ///
  /// [running] = native 那边「已经在跑」；[startOk] = start 的返回；
  /// [failFirstStarts] = 前 N 次 start 失败（用来验重试）。
  void mockChannel({
    bool running = false,
    bool startOk = true,
    int failFirstStarts = 0,
  }) {
    var starts = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'getStatus':
          return {
            'running': running,
            'port': running ? 41234 : 0,
            'agentPort': running ? 41235 : 0,
            'healthy': running,
          };
        case 'start':
          starts += 1;
          if (starts <= failFirstStarts) {
            return {'success': false, 'port': 0};
          }
          return {'success': startOk, 'port': 41234, 'agentPort': 41235};
        case 'stop':
          return true;
        case 'setLlmProvider':
          return true;
        case 'setModelRouting':
          return true;
      }
      return null;
    });
  }

  setUpAll(() {
    // 自动启动会先读模型列表（把云端供应商交给大脑）⇒ 得有个能用的
    // sqflite 实现，否则 `ready` 会失败（被上层兜住，但状态会走错分支）。
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() {
    calls = <MethodCall>[];
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  /// 造一个 notifier + 它的容器。返回容器，方便读状态与销毁。
  ProviderContainer makeContainer({
    List<ModelItem> models = const [],
    AppSettingsRepository? settings,
    TelencephalonClient? telencephalonClient,
  }) {
    final container = ProviderContainer(
      overrides: [
        // 模型仓储换成空的 —— 测试里不需要真库，也不需要默认模型。
        modelRepositoryProvider.overrideWithValue(_FakeModelRepository(models)),
        // 设置仓储一律换成内存版。
        //
        // ⚠️ **不能碰真库**：`flutter test` 会**并行**跑多个测试文件，而
        // 它们共用同一个 `shadow.db` 文件 ⇒ 真库的读会被别的文件的写
        // 锁住、永远不返回 ⇒ 大脑的自动启动卡在「启动中」，整个文件
        // 跟着挂掉。
        appSettingsRepositoryProvider
            .overrideWithValue(settings ?? _FakeAppSettings()),
        // 端脑 client 换成假的 —— 「叶区列表」和「下发路由」两条是
        // 纯本地的，测试里不该真发 HTTP。
        if (telencephalonClient != null)
          telencephalonClientProvider.overrideWithValue(telencephalonClient),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('EncephalonMobileNotifier 默认启动', () {
    test('没在跑时会自己把大脑拉起来', () async {
      mockChannel(running: false);

      final container = makeContainer();
      container.read(encephalonMobileProvider.notifier);

      // 等自动启动跑完（getStatus → start）。
      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      expect(
        calls.any((c) => c.method == 'start'),
        isTrue,
        reason: '大脑默认启动 —— 用户不该需要去设置页点按钮',
      );
      final state = container.read(encephalonMobileProvider);
      expect(state.status, EncephalonMobileStatus.running);
      expect(state.port, 41234);
      expect(state.agentPort, 41235);
    });

    test('已经在跑时接管现成的，不重复 boot', () async {
      mockChannel(running: true);

      final container = makeContainer();
      container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      expect(
        calls.any((c) => c.method == 'start'),
        isFalse,
        reason: '进程里已经在跑了 —— 重复 boot 只会白占一份内存',
      );
      expect(container.read(encephalonMobileProvider).port, 41234);
    });

    test('启动失败会自动重试，重试成功就 running', () async {
      mockChannel(running: false, failFirstStarts: 1);

      final container = makeContainer();
      container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
        timeout: const Duration(seconds: 20),
      );

      final starts = calls.where((c) => c.method == 'start').length;
      expect(starts, 2, reason: '第一次失败后应当自动重试一次');
      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.running);
    });

    test('反复调用 ensureStarted 不会并发 boot 两次', () async {
      mockChannel(running: false);

      final container = makeContainer();
      final notifier = container.read(encephalonMobileProvider.notifier);

      await Future.wait([
        notifier.ensureStarted(),
        notifier.ensureStarted(),
        notifier.ensureStarted(),
      ]);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      final starts = calls.where((c) => c.method == 'start').length;
      expect(starts, 1, reason: '并发调用只该 boot 一次');
    });

    test('stop 之后可以再拉起来', () async {
      mockChannel(running: false);

      final container = makeContainer();
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      await notifier.stop();
      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.stopped);

      await notifier.ensureStarted();
      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.running);
    });
  });

  /// 「等大脑就绪」的就绪门。
  ///
  /// 嵌入式大脑启动要几秒，这期间端脑 client 还指着没人监听的默认端口
  /// ⇒ 启动期间发出的第一条消息会 connection refused。门让请求**等大脑
  /// 就绪**再发出去。
  group('EncephalonMobileNotifier 就绪门', () {
    test('门被挂到端脑 client 上了', () async {
      mockChannel(running: false);

      final container = makeContainer();
      container.read(encephalonMobileProvider.notifier);

      expect(
        container.read(telencephalonClientProvider).readinessGate,
        isNotNull,
        reason: '端脑 client 必须有就绪门 —— 否则启动期间的消息会打到一个没人监听的端口上',
      );
    });

    test('大脑没在跑时，门会把它拉起来并等它就绪', () async {
      mockChannel(running: false);

      final container = makeContainer();
      final notifier = container.read(encephalonMobileProvider.notifier);

      await notifier.waitUntilReady();

      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.running);
      expect(
        calls.any((c) => c.method == 'start'),
        isTrue,
        reason: '门就该把大脑拉起来 —— 这正是「默认启动，不需要开关」',
      );
    });

    test('用户主动停掉之后，门不会偷偷把它拉回来', () async {
      mockChannel(running: false);

      final container = makeContainer();
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );
      await notifier.stop();

      final startsBefore = calls.where((c) => c.method == 'start').length;

      await notifier.waitUntilReady();

      expect(
        calls.where((c) => c.method == 'start').length,
        startsBefore,
        reason: '用户刚停掉的大脑不该被门偷偷拉回来 —— 要恢复得他自己点「启动大脑」',
      );
      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.stopped);
    });

    test('点「启动大脑」之后，门又能正常等它就绪', () async {
      mockChannel(running: false);

      final container = makeContainer();
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );
      await notifier.stop();
      await notifier.start();

      expect(container.read(encephalonMobileProvider).status,
          EncephalonMobileStatus.running);

      // 门这时不该再动它 —— 已经在跑了。
      final startsAfter = calls.where((c) => c.method == 'start').length;
      await notifier.waitUntilReady();
      expect(calls.where((c) => c.method == 'start').length, startsAfter);
    });
  });

  /// 「大脑模型路由」—— **全局默认**（本地 / 云端）+ **每个叶区单独覆盖**。
  ///
  /// 关键约束：**远端引擎可以在运行时注册**（neuron 的派发表可以后加
  /// 引擎）、叶区的 `default_model` 也能随时改 ⇒ **换来源不用重启大脑**。
  group('大脑模型路由', () {
    /// 拿最后一次 `setModelRouting` 的负载（Rust 槽位）。
    Map? lastRoutingPayload() {
      final routingCalls =
          calls.where((c) => c.method == 'setModelRouting').toList();
      if (routingCalls.isEmpty) return null;
      final args = routingCalls.last.arguments as Map;
      return jsonDecode(args['json'] as String) as Map;
    }

    test('没选过时：自动用第一个可用的云端供应商', () async {
      mockChannel(running: false);

      final container = makeContainer(models: [_cloudModel()]);
      container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      final payload = lastRoutingPayload();
      expect(payload, isNotNull, reason: '模型路由要交给大脑');
      expect(payload!['default_model'], 'MiniMax-M3');
      final providers = payload['providers'] as List;
      expect(providers.length, 1);
      expect((providers.first as Map)['base_url'], 'https://api.minimax.io/v1');
    });

    test('显式选本地 neuron ⇒ 全局默认回落本地', () async {
      mockChannel(running: false);
      final settings = _FakeAppSettings();

      final container = makeContainer(
        models: [_cloudModel()],
        settings: settings,
      );
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      await notifier.applyModelSource(BrainModelSource.localSource);

      final payload = lastRoutingPayload();
      expect(payload, isNotNull);
      expect(
        payload!['default_model'],
        isNull,
        reason: 'null = 回落本地 neuron 权重',
      );
      // 选过之后要**留下来**（下次 App 起来还是本地权重）。
      expect(settings.values[BrainModelSource.settingKey], BrainModelSource.local);
    });

    test('显式选某个云端供应商 ⇒ 用那一条', () async {
      mockChannel(running: false);
      final settings = _FakeAppSettings();

      final container = makeContainer(
        models: [
          _cloudModel(),
          _cloudModel(
            id: 'cloud_other',
            name: 'Other',
            endpoint: 'https://example.invalid/v1',
            model: 'other-model',
          ),
        ],
        settings: settings,
      );
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      await notifier.applyModelSource(
        BrainModelSource.cloud('cloud_other'),
      );

      final payload = lastRoutingPayload();
      expect(payload!['default_model'], 'other-model');
    });

    test('per-lobe 覆盖：**只下发覆盖集合**，没点名的叶区跟随全局', () async {
      mockChannel(running: false);
      final client = _FakeTelencephalonClient();

      final container = makeContainer(
        models: [_cloudModel()],
        telencephalonClient: client,
      );
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );

      await notifier.applyLobeOverride(
        'prefrontal',
        BrainModelSource.localSource,
      );

      // 端脑面收到的是「全局默认 + 覆盖集合」：
      // prefrontal = 强制本地（null），**其它叶区根本不在这张表里** ——
      // 塞进去就把「跟随全局」钉死了，改全局默认时它们不会跟着变。
      final sent = client.applied.last;
      expect(sent['default_model'], 'MiniMax-M3');
      final lobeModels = sent['lobe_models'] as Map<String, String?>;
      expect(lobeModels, {'prefrontal': null});
      expect(
        lobeModels.containsKey('temporal'),
        isFalse,
        reason: '没被覆盖的叶区不能被钉死 —— 它要能跟着全局默认变',
      );
      expect(lobeModels.containsKey('parietal'), isFalse);
    });

    test('换路由**不重启**大脑（远端引擎可以运行时注册）', () async {
      mockChannel(running: false);
      final client = _FakeTelencephalonClient();

      final container = makeContainer(
        models: [_cloudModel()],
        telencephalonClient: client,
      );
      final notifier = container.read(encephalonMobileProvider.notifier);

      await _waitUntil(
        () => container.read(encephalonMobileProvider).status ==
            EncephalonMobileStatus.running,
      );
      final startsBefore = calls.where((c) => c.method == 'start').length;

      await notifier.applyModelSource(BrainModelSource.localSource);

      expect(
        calls.where((c) => c.method == 'stop'),
        isEmpty,
        reason: '路由是运行时的 —— 停大脑会让正在用的会话断掉',
      );
      expect(
        calls.where((c) => c.method == 'start').length,
        startsBefore,
        reason: '换路由不需要重启大脑',
      );
    });
  });
}

/// 轮询等条件成立（最多 [timeout]）。
Future<void> _waitUntil(
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('条件在 ${timeout.inSeconds}s 内没成立');
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  // 让微任务队列排空，状态赋值真正落地。
  await Future<void>.delayed(Duration.zero);
}

/// 假的端脑 client —— 只实现「叶区列表」和「下发路由」两条。
///
/// 这两条是**纯本地**的（不真的发 HTTP），所以测试里不该走真网络。
class _FakeTelencephalonClient extends TelencephalonClient {
  /// 端脑面返回的原生叶区清单。
  final List<String> lobes = const ['temporal', 'prefrontal', 'parietal'];

  /// 每次 `applyLobeModels` 收到的**整份**路由
  /// （`default_model` + `lobe_models` 覆盖集合）。
  final List<Map<String, dynamic>> applied = [];

  _FakeTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<NativeLobeInfo>> listNativeLobes() async => [
        for (final name in lobes)
          NativeLobeInfo(name: name, openaiBaseUrl: 'http://127.0.0.1:1'),
      ];

  @override
  Future<Map<String, dynamic>> applyLobeModels({
    required String? defaultModel,
    required Map<String, String?> lobeModels,
    List<Map<String, String>> providers = const [],
  }) async {
    applied.add({
      'default_model': defaultModel,
      'lobe_models': Map<String, String?>.from(lobeModels),
    });
    return {'applied': lobeModels};
  }
}

/// 空的模型仓储 —— 自动启动要读它（把云端供应商交给大脑），测试里
/// 只需要「就绪且是空的」。
class _FakeModelRepository implements IModelRepository {
  final List<ModelItem> models;

  _FakeModelRepository([this.models = const []]);

  @override
  Future<void> initializeDefaultModels() async {}

  @override
  Future<List<ModelItem>> getAll() async => models;

  @override
  Future<List<ModelItem>> getLocalModels() async =>
      models.where((m) => m.isLocal).toList();

  @override
  Future<List<ModelItem>> getCloudModels() async =>
      models.where((m) => !m.isLocal).toList();

  @override
  Future<ModelItem?> getById(String id) async {
    for (final m in models) {
      if (m.id == id) return m;
    }
    return null;
  }

  @override
  Future<void> insert(ModelItem item) async {}

  @override
  Future<void> update(ModelItem item) async {}

  @override
  Future<void> delete(String id) async {}

  @override
  Future<void> setModelLoaded(String id, bool isLoaded) async {}
}

/// 内存版的 App 设置仓储 —— 真库（SQLite）会跨用例串状态。
class _FakeAppSettings implements AppSettingsRepository {
  final Map<String, String> values = {};

  @override
  Future<String?> get(String key) async => values[key];

  @override
  Future<void> set(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

/// 一个云端供应商（像「MiniMax token plan」那种）。
ModelItem _cloudModel({
  String id = 'cloud_minimax',
  String name = 'MiniMax',
  String endpoint = 'https://api.minimax.io/v1',
  String model = 'MiniMax-M3',
}) {
  return ModelItem(
    id: id,
    name: name,
    path: endpoint,
    type: 'text',
    size: 0,
    isLoaded: false,
    isLocal: false,
    source: ModelSource.cloudProvider,
    endpoint: endpoint,
    apiKey: 'sk-test',
    model: model,
  );
}
