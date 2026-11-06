import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/database/app_settings.dart';
import '../services/telencephalon/telencephalon_client.dart';
import 'telencephalon_provider.dart';

/// 大脑供应商目录里的一条**可对话**选项。
///
/// ⚠️ **这是大脑侧数据的读视图，不是本地副本**（2026-11-06「大脑是唯一
/// 数据源」刀）：供应商与 key 都住在端脑的 ProviderStore 里，客户端只在
/// 要展示 / 下发路由时读一份**轻量视图**（id + 地址 + 模型 id），
/// **不带 key** —— 供应商材料不出大脑。
class BrainModelOption {
  /// 供应商 id（大脑目录里的 key —— 路由 payload 的 `providers[].id`，
  /// 端脑按它解析 api key）。
  final String id;

  final String name;

  /// 上游模型 id（供应商**选中**的那条 —— neuron 侧的注册名，也是叶区
  /// 请求时用的名字）。
  final String model;

  final String baseUrl;

  /// 大脑目录给这条模型的能力标注（llm / vision / tts …；null = 目录
  /// 没给 —— 按文本处理，与旧链路「type 缺省 = text」一致）。
  final String? capability;

  const BrainModelOption({
    required this.id,
    required this.name,
    required this.model,
    required this.baseUrl,
    this.capability,
  });

  /// 分组（用户语言：文本模型 / 视觉模型）。null = 不能当对话上游。
  ModelChatCategory? get chatCategory => chatCategoryOf(capability);
}

/// 大脑的模型来源（**单个**取值）。
///
/// 端脑的叶区是按**模型 id** 去请求 neuron 的 OpenAI 面的，所以「大脑用
/// 哪个上游」这件事有两面：
/// - **本地 neuron 权重** —— 不指定模型 id，叶区自己从 neuron 的本地
///   模型目录里挑一个（`llm/` 前缀的可用模型）；
/// - **云端供应商** —— 注册一条远端引擎，叶区改用那个模型 id 去请求。
///
/// **远端引擎只能在启动时确定**（Rust 侧 `encephalon_mobile_set_llm_provider`
/// 写的是全局槽位，`boot` 时读一次）⇒ 换来源必须**重启大脑**。
class BrainModelSource {
  /// 「本地 neuron 权重」。
  static const String local = 'local';

  /// 云端供应商前缀，后面跟**供应商 id**：`cloud:deepseek`。
  static const String cloudPrefix = 'cloud:';

  /// 持久化用的设置键 —— **老键**（只有一个全局来源）。
  ///
  /// 保留是为了**读旧数据**（迁移）与**写旧数据**（老版本 App 读得到）。
  static const String settingKey = 'brain_model_source';

  /// 持久化用的设置键 —— **新键**（整份路由）。
  static const String routingSettingKey = 'brain_model_routing';

  /// 原始取值。**null = 用户还没选过** ⇒ 自动（见 [resolve]）。
  final String? raw;

  const BrainModelSource(this.raw);

  /// 用户还没选过。
  const BrainModelSource.auto() : raw = null;

  /// 本地 neuron 权重。
  static const BrainModelSource localSource = BrainModelSource(local);

  /// 某个云端供应商（[providerId] = 大脑目录里的供应商 id）。
  factory BrainModelSource.cloud(String providerId) =>
      BrainModelSource('$cloudPrefix$providerId');

  /// 从持久化的字符串还原。
  factory BrainModelSource.parse(String? raw) => BrainModelSource(raw);

  /// 用户还没选过 ⇒ 自动。
  bool get isAuto => raw == null;

  /// 显式选了本地权重。
  bool get isLocal => raw == local;

  /// 显式选了某个云端供应商 —— 返回**大脑目录里的**供应商 id；
  /// 不是云端来源时返回 null。
  String? get cloudModelId {
    final value = raw;
    if (value == null || !value.startsWith(cloudPrefix)) return null;
    final id = value.substring(cloudPrefix.length);
    return id.isEmpty ? null : id;
  }

  /// 解析出「这次启动该用哪个云端供应商」。
  ///
  /// - 显式选了某个云端供应商 → 就是它；
  /// - 显式选了本地权重 → null（不注册远端引擎）；
  /// - **用户还没选过（自动）** → 第一条可对话选项；一条都没有 → null
  ///   （纯本地权重）。
  ///
  /// 「自动」这一档是为了**不破坏既有行为**：以前 App 一起来就用「第一个
  /// 云端供应商」，用户没选过的时候不该突然变成本地权重。
  ///
  /// ⚠️ [options] 是**已过滤**的可对话选项（见 [usableBrainOptions]）——
  /// 这里不再各自判 usable（一个过滤点，页面与下发链共用）。
  static BrainModelOption? resolve(
    BrainModelSource source,
    List<BrainModelOption> options,
  ) {
    final explicitId = source.cloudModelId;
    if (explicitId != null) {
      for (final o in options) {
        if (o.id == explicitId) return o;
      }
      // 选的那个供应商被删了 / 没选模型 ⇒ 退回本地权重，
      // 而不是悄悄换一个供应商（用户选的就是它）。
      return null;
    }
    if (source.isLocal) return null;
    return options.isEmpty ? null : options.first;
  }

  @override
  bool operator ==(Object other) =>
      other is BrainModelSource && other.raw == raw;

  @override
  int get hashCode => raw.hashCode;

  @override
  String toString() => 'BrainModelSource(${raw ?? 'auto'})';
}

/// 大脑的**模型路由**：全局默认 + 每叶区覆盖。
///
/// 模型使用的**最小单位是叶区**：
/// - [defaultSource] —— 全局默认。各叶区都走本地，还是都走云端；
/// - [lobeOverrides] —— per-lobe 覆盖。某个叶区单独换一边
///   （比如前额叶本地、实际执行任务的区域云端、颞叶本地）。
///
/// **三层语义别混**（这是全局默认与覆盖的差别）：
/// - 某个叶区**不在** [lobeOverrides] 里 ⇒ 跟随全局默认；
/// - 覆盖值是 [BrainModelSource.localSource] ⇒ 该叶区**强制本地**；
/// - 覆盖值是某个云端 ⇒ 该叶区固定用那个云端。
class BrainModelRouting {
  /// 全局默认来源。
  final BrainModelSource defaultSource;

  /// per-lobe 覆盖（叶区名 → 来源）。
  ///
  /// 只存**显式**覆盖；「跟随全局默认」就是不写进这张表。
  final Map<String, BrainModelSource> lobeOverrides;

  const BrainModelRouting({
    this.defaultSource = const BrainModelSource.auto(),
    this.lobeOverrides = const {},
  });

  /// 某个叶区的**有效**来源（覆盖优先于全局默认）。
  ///
  /// ⚠️ 这是**原始查找**，不处理「覆盖指向的供应商被删了」那种情况 ——
  /// 要「实际生效」的值请用 [effectiveLobeSource]（它跟路由负载用**同一套**
  /// 算法）。
  BrainModelSource effectiveFor(String lobe) =>
      lobeOverrides[lobe] ?? defaultSource;

  BrainModelRouting copyWith({
    BrainModelSource? defaultSource,
    Map<String, BrainModelSource>? lobeOverrides,
  }) {
    return BrainModelRouting(
      defaultSource: defaultSource ?? this.defaultSource,
      lobeOverrides: lobeOverrides ?? this.lobeOverrides,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'default': defaultSource.raw,
      'lobes': {
        for (final e in lobeOverrides.entries)
          if (e.value.raw != null) e.key: e.value.raw,
      },
    };
  }

  /// 序列化成持久化用的字符串。
  String encode() => jsonEncode(toJson());

  /// 从持久化的字符串还原。**解析不出来就退回「自动」** ——
  /// 宁可回到默认值，也不要让一条坏数据把整个设置页卡死。
  static BrainModelRouting decode(String? raw) {
    if (raw == null || raw.trim().isEmpty) {
      return const BrainModelRouting();
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const BrainModelRouting();
      return BrainModelRouting.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return const BrainModelRouting();
    }
  }

  static BrainModelRouting fromJson(Map<String, dynamic> json) {
    final lobes = <String, BrainModelSource>{};
    final rawLobes = json['lobes'];
    if (rawLobes is Map) {
      rawLobes.forEach((key, value) {
        if (value is String) {
          final source = BrainModelSource.parse(value);
          // 「跟随全局默认」等价于「没有覆盖」⇒ 不进表。
          if (!source.isAuto) lobes['$key'] = source;
        }
      });
    }
    return BrainModelRouting(
      defaultSource: BrainModelSource.parse(json['default'] as String?),
      lobeOverrides: lobes,
    );
  }

  @override
  bool operator ==(Object other) {
    if (other is! BrainModelRouting) return false;
    if (other.defaultSource != defaultSource) return false;
    if (other.lobeOverrides.length != lobeOverrides.length) return false;
    for (final e in lobeOverrides.entries) {
      if (other.lobeOverrides[e.key] != e.value) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hash(defaultSource, lobeOverrides.length);

  @override
  String toString() =>
      'BrainModelRouting(default: $defaultSource, lobes: $lobeOverrides)';
}

/// 大脑页「模型来源」选择器的**分组**。
///
/// 用户语言（产品要求）：不出现 llm/vlm 这种缩写 —— 文本模型 / 视觉模型。
/// **模态是每个模型的固定内容**（大脑目录的 capability 标注），
/// 系统提供默认值，客户端不做「这个模型支不支持视觉」的编辑入口。
enum ModelChatCategory {
  /// 文本模型（纯文本输入的对话模型）。
  text,

  /// 视觉模型（文本 + 图像输入）。
  vision,
}

/// 把大脑目录的能力标注（capability 原值）归到选择器分组。
///
/// 返回 null = **不能当对话上游**（asr / tts / embedding / rerank / ocr）
/// ⇒ 大脑页的模型来源选择器**不显示**它 —— 选它当 LLM 上游必坏，
/// 界面不给一个必然失败的选项。
ModelChatCategory? chatCategoryOf(String? capability) {
  switch (capability) {
    case 'vision':
      return ModelChatCategory.vision;
    case 'llm':
    case 'text':
    case '':
    case null:
      return ModelChatCategory.text;
    default:
      // asr / tts / embedding / rerank / ocr —— 不是对话上游。
      return null;
  }
}

/// 大脑供应商目录里**能当对话上游**的那部分选项。
///
/// 页面与路由下发链共用**同一个过滤点**（2026-11-06「大脑是唯一数据源」
/// 刀）：直读大脑的 `/models/providers`，不经过 App 本地的任何镜像表。
///
/// 过滤规则：
/// - 内置条目（neuron）**不进** —— 「本地权重」在大脑页是独立选项；
/// - **没选模型 / 缺地址** ⇒ 跑不起来 ⇒ 不给（失败长得像成功要避免）；
/// - 能力不是对话类（asr / tts / …）⇒ 不给。⚠️ 这同时收紧了**注册面**：
///   这类条目不再注册进 neuron 的 **llm** 派发表（把 tts 端点当 chat
///   端点打的坏引擎，本就不该注册）。
///
/// ⚠️ **enabled 语义与旧链路一致**：启停状态不进过滤（已知边界，与镜像
/// 时代相同 —— 禁用后的供应商在大脑页仍可见可选）。
List<BrainModelOption> usableBrainOptions(List<RegisteredProvider> providers) {
  final options = <BrainModelOption>[];
  for (final p in providers) {
    if (p.builtin) continue;
    final model = (p.selectedModel ?? '').trim();
    final endpoint = p.baseUrl.trim();
    if (model.isEmpty || endpoint.isEmpty) continue;
    // capability 取**选中那条**的标注（目录没回模型列表时 = null）。
    String? capability;
    for (final m in p.models) {
      if (m.id == model) {
        capability = m.capability;
        break;
      }
    }
    if (chatCategoryOf(capability) == null) continue;
    options.add(BrainModelOption(
      id: p.id,
      name: p.name,
      model: model,
      baseUrl: endpoint,
      capability: capability,
    ));
  }
  return options;
}

/// 大脑供应商目录的**可对话**选项（直读大脑）。
///
/// ⚠️ **FutureProvider 直读，不 watch `providersNotifierProvider`** ——
/// 那个 notifier 构造即自动联网加载，watch 它等于在本页触发整条联网
/// 初始化链（Riverpod「构建中改 provider」违规的根源，见 models_screen
/// 的教训）。这里只要一小块数据：自己读，失败在 AsyncValue 里说真话。
final brainProviderOptionsProvider =
    FutureProvider<List<BrainModelOption>>((ref) async {
  final client = ref.watch(telencephalonClientProvider);
  final providers = await client.listProviders();
  return usableBrainOptions(providers);
});

/// 某个来源对应的**上游模型 id**（`null` = 本地 / 供应商被删了）。
///
/// **⚠️ 两套 id 别混**：来源的 `cloudModelId` 是**大脑目录里的供应商 id**
/// （`cloud:deepseek`），[BrainModelOption.model] 才是**上游**的模型 id ——
/// 后者才是 neuron 侧的注册名、也是叶区请求时用的名字。
String? upstreamModelIdOf(BrainModelSource source, List<BrainModelOption> options) {
  final id = source.cloudModelId;
  if (id == null) return null;
  for (final o in options) {
    if (o.id == id) return o.model;
  }
  // 指向的供应商被删了 / 没选模型 ⇒ 回落本地，
  // 而不是悄悄换一个供应商（用户选的就是它）。
  return null;
}

/// 某个来源**实际生效**的上游模型 id。
///
/// 与 [upstreamModelIdOf] 的区别只在「自动」这一档：全局默认是「自动」
/// 时 = **第一条可对话选项**（老行为：以前 App 一起来就用第一个云端
/// 供应商，不破坏兼容）。per-lobe 覆盖不会是「自动」。
String? effectiveModelIdOf(BrainModelSource source, List<BrainModelOption> options) {
  if (source.isAuto) {
    return options.isEmpty ? null : options.first.model;
  }
  return upstreamModelIdOf(source, options);
}

/// 某个叶区**实际生效**的来源（覆盖优先于全局默认）。
///
/// **覆盖指向的供应商被删了 ⇒ 那个覆盖作废 ⇒ 回到跟随全局默认。**
///
/// 路由负载（[buildModelRoutingPayload]）也是这么算的 —— **两边必须一致**，
/// 否则界面显示的「当前用哪个」跟实际跑的不是一回事。
BrainModelSource effectiveLobeSource({
  required BrainModelRouting routing,
  required String lobe,
  required List<BrainModelOption> options,
}) {
  final override = routing.lobeOverrides[lobe];
  if (override == null || override.isAuto) return routing.defaultSource;
  if (override.isLocal) return override;
  if (upstreamModelIdOf(override, options) == null) return routing.defaultSource;
  return override;
}

/// 一组叶区的**有效**模型 id（叶区名 → 上游模型 id / `null` = 本地）。
///
/// 这是「全局默认 + per-lobe 覆盖」合成之后的最终结果 —— 每个叶区都有
/// 一个明确的值，不留「跟随全局」这种要运行时再算的语义。
///
/// ⚠️ **只用来显示**。下发给端脑的是**覆盖集合**（见
/// [buildModelRoutingPayload]）—— 把每个叶区的有效值都发下去会把
/// 「跟随全局」钉死，改全局默认时那些叶区不会跟着变。
Map<String, String?> effectiveLobeModels({
  required BrainModelRouting routing,
  required List<String> lobes,
  required List<BrainModelOption> options,
}) {
  return {
    for (final lobe in lobes)
      lobe: effectiveModelIdOf(
        effectiveLobeSource(
          routing: routing,
          lobe: lobe,
          options: options,
        ),
        options,
      ),
  };
}

/// 构造交给大脑的模型路由 JSON。
///
/// 形状与 Rust 侧的 `encephalon::embedded::ModelRouting` **以及**端脑面
/// `POST /api/telencephalon/lobes/models` 一一对应：
/// ```json
/// {
///   "providers": [{"id": "deepseek", "base_url": "...", "model": "..."}],
///   "default_model": "deepseek-chat",
///   "lobe_models": {"prefrontal": null, "temporal": "deepseek-chat"}
/// }
/// ```
///
/// ⚠️⚠️ **`providers` 条目不带 `api_key`**（2026-11-06「大脑是唯一数据源」
/// 刀）：端脑按 `id` 从自己的供应商目录解析 key —— 供应商材料不出大脑，
/// 请求体与日志里不再出现明文 key。
///
/// ⚠️ **`lobe_models` 只装显式覆盖的叶区。**
/// 「不在表里」= 跟随全局默认 —— 要是把每个叶区的**有效值**都塞进去，
/// 「跟随全局」就被钉死了，改全局默认时那些叶区不会跟着变。
Map<String, dynamic> buildModelRoutingPayload({
  required BrainModelRouting routing,
  required List<BrainModelOption> options,
}) {
  final providers = [
    for (final o in options)
      {'id': o.id, 'base_url': o.baseUrl, 'model': o.model},
  ];

  // 全局默认：auto ⇒ 第一条可对话选项（老行为，不破坏兼容）。
  final defaultModel = effectiveModelIdOf(routing.defaultSource, options);

  // per-lobe 覆盖：值是上游模型 id；`null` = 该叶区强制本地。
  final lobeModels = <String, dynamic>{};
  for (final entry in routing.lobeOverrides.entries) {
    final source = entry.value;
    if (source.isAuto) continue; // 「跟随全局默认」= 不进表
    if (source.isLocal) {
      lobeModels[entry.key] = null; // 强制本地
      continue;
    }
    final id = upstreamModelIdOf(source, options);
    // 供应商被删了 ⇒ 那个覆盖作废 ⇒ 回到跟随全局默认（跟界面显示一致）。
    if (id == null) continue;
    lobeModels[entry.key] = id;
  }

  return {
    'providers': providers,
    'default_model': defaultModel,
    'lobe_models': lobeModels,
  };
}

/// 设置仓储（测试可以覆盖它）。
final appSettingsRepositoryProvider = Provider<AppSettingsRepository>((ref) {
  return AppSettingsRepository();
});

class BrainModelSourceState {
  /// **全局默认**来源。
  final BrainModelSource source;

  /// per-lobe 覆盖（叶区名 → 来源）。
  final Map<String, BrainModelSource> lobeOverrides;

  final bool isLoading;
  final String? error;

  const BrainModelSourceState({
    this.source = const BrainModelSource.auto(),
    this.lobeOverrides = const {},
    this.isLoading = false,
    this.error,
  });

  BrainModelSourceState copyWith({
    BrainModelSource? source,
    Map<String, BrainModelSource>? lobeOverrides,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return BrainModelSourceState(
      source: source ?? this.source,
      lobeOverrides: lobeOverrides ?? this.lobeOverrides,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }

  /// 某个叶区的**有效**来源（覆盖优先于全局默认）。
  ///
  /// ⚠️ 这是**原始查找**，不处理「覆盖指向的供应商被删了」那种情况 ——
  /// 要「实际生效」的值请用 [effectiveLobeSource]。
  BrainModelSource effectiveFor(String lobe) =>
      lobeOverrides[lobe] ?? source;

  /// 整份路由。
  BrainModelRouting get routing => BrainModelRouting(
        defaultSource: source,
        lobeOverrides: lobeOverrides,
      );
}

/// 「大脑用哪个模型来源」的选择。
///
/// 这个选择**只存不生效** —— 生效要靠重启大脑（见
/// `EncephalonMobileNotifier.applyModelRouting`）。
class BrainModelSourceNotifier extends StateNotifier<BrainModelSourceState> {
  final AppSettingsRepository _settings;

  /// 首次加载完成。宿主（嵌入式大脑启动）要等它 —— 不等会读到「用户还没
  /// 选过」而误判。
  late final Future<void> ready;

  BrainModelSourceNotifier(this._settings) : super(const BrainModelSourceState()) {
    ready = _load();
  }

  Future<void> _load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final raw = await _settings.get(BrainModelSource.routingSettingKey);
      if (raw != null) {
        final routing = BrainModelRouting.decode(raw);
        state = state.copyWith(
          source: routing.defaultSource,
          lobeOverrides: routing.lobeOverrides,
          isLoading: false,
        );
        return;
      }

      // **老键迁移**：以前只有一个全局来源（`brain_model_source`）。
      // 读出来当全局默认，顺手写进新键（迁移是幂等的）。
      final legacy = await _settings.get(BrainModelSource.settingKey);
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.parse(legacy),
      );
      await _settings.set(BrainModelSource.routingSettingKey, routing.encode());
      state = state.copyWith(
        source: routing.defaultSource,
        lobeOverrides: routing.lobeOverrides,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 记下**全局默认**来源。
  Future<void> setSource(BrainModelSource source) async {
    state = state.copyWith(source: source, clearError: true);
    await _persist();
  }

  /// 记下某个叶区的覆盖。
  ///
  /// 传 [BrainModelSource.auto] 等于「跟随全局默认」⇒ 删掉这条覆盖。
  Future<void> setLobeOverride(String lobe, BrainModelSource source) async {
    final overrides = Map<String, BrainModelSource>.from(state.lobeOverrides);
    if (source.isAuto) {
      overrides.remove(lobe);
    } else {
      overrides[lobe] = source;
    }
    state = state.copyWith(lobeOverrides: overrides, clearError: true);
    await _persist();
  }

  /// 去掉某个叶区的覆盖（回到「跟随全局默认」）。
  Future<void> clearLobeOverride(String lobe) async {
    if (!state.lobeOverrides.containsKey(lobe)) return;
    final overrides = Map<String, BrainModelSource>.from(state.lobeOverrides)
      ..remove(lobe);
    state = state.copyWith(lobeOverrides: overrides, clearError: true);
    await _persist();
  }

  Future<void> _persist() async {
    try {
      await _settings.set(
        BrainModelSource.routingSettingKey,
        state.routing.encode(),
      );
      // 老键同步一份全局默认 —— 老版本 App 读得到。
      if (state.source.isAuto) {
        await _settings.remove(BrainModelSource.settingKey);
      } else {
        await _settings.set(BrainModelSource.settingKey, state.source.raw!);
      }
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final brainModelSourceProvider =
    StateNotifierProvider<BrainModelSourceNotifier, BrainModelSourceState>((ref) {
  return BrainModelSourceNotifier(ref.watch(appSettingsRepositoryProvider));
});