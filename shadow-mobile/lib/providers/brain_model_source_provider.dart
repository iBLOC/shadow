import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/database/app_settings.dart';
import '../services/database/model_item.dart';

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

  /// 云端供应商前缀，后面跟模型 id：`cloud:cloud_1735...`。
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

  /// 某个云端供应商。
  factory BrainModelSource.cloud(String modelId) =>
      BrainModelSource('$cloudPrefix$modelId');

  /// 从持久化的字符串还原。
  factory BrainModelSource.parse(String? raw) => BrainModelSource(raw);

  /// 用户还没选过 ⇒ 自动。
  bool get isAuto => raw == null;

  /// 显式选了本地权重。
  bool get isLocal => raw == local;

  /// 显式选了某个云端供应商 —— 返回**App 里的**模型 id；
  /// 不是云端来源时返回 null。
  String? get cloudModelId {
    final value = raw;
    if (value == null || !value.startsWith(cloudPrefix)) return null;
    final id = value.substring(cloudPrefix.length);
    return id.isEmpty ? null : id;
  }

  /// 解析出「这次启动该用哪个云端模型」。
  ///
  /// - 显式选了某个云端供应商 → 就是它；
  /// - 显式选了本地权重 → null（不注册远端引擎）；
  /// - **用户还没选过（自动）** → 第一个 endpoint + model 都齐的云端
  ///   供应商；一个都没有 → null（纯本地权重）。
  ///
  /// 「自动」这一档是为了**不破坏既有行为**：以前 App 一起来就用「第一个
  /// 云端供应商」，用户没选过的时候不该突然变成本地权重。
  static ModelItem? resolve(BrainModelSource source, List<ModelItem> models) {
    final explicitId = source.cloudModelId;
    if (explicitId != null) {
      for (final m in models) {
        if (m.id == explicitId && isUsable(m)) return m;
      }
      // 选的那个模型被删了 / 缺 endpoint 或 model ⇒ 退回本地权重，
      // 而不是悄悄换一个供应商（用户选的就是它）。
      return null;
    }
    if (source.isLocal) return null;
    for (final m in models) {
      if (isUsable(m)) return m;
    }
    return null;
  }

  /// 能不能当 LLM 上游用。
  ///
  /// endpoint 与 model 都得有 —— neuron 拼的是 `{endpoint}/chat/completions`，
  /// 叶区按 model 去请求，缺一个都跑不起来。
  static bool isUsable(ModelItem m) {
    if (m.source != ModelSource.cloudProvider) return false;
    if ((m.endpoint ?? '').trim().isEmpty) return false;
    if ((m.model ?? '').trim().isEmpty) return false;
    return true;
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

/// 某个来源对应的**上游模型 id**（`null` = 本地 / 供应商被删了）。
///
/// **⚠️ 两套 id 别混**：App 的 `models` 表里 `id` 是本地记录 id
/// （`cloud_1735…`），`model` 才是**上游**的模型 id —— 后者才是
/// neuron 侧的注册名、也是叶区请求时用的名字。
String? upstreamModelIdOf(BrainModelSource source, List<ModelItem> models) {
  final id = source.cloudModelId;
  if (id == null) return null;
  for (final m in models) {
    if (m.id == id && BrainModelSource.isUsable(m)) {
      return (m.model ?? '').trim();
    }
  }
  // 指向的供应商被删了 / 缺 endpoint 或 model ⇒ 回落本地，
  // 而不是悄悄换一个供应商（用户选的就是它）。
  return null;
}

/// 某个来源**实际生效**的上游模型 id。
///
/// 与 [upstreamModelIdOf] 的区别只在「自动」这一档：全局默认是「自动」
/// 时 = **第一个可用的云端供应商**（老行为：以前 App 一起来就用第一个
/// 云端供应商，不破坏兼容）。per-lobe 覆盖不会是「自动」。
String? effectiveModelIdOf(BrainModelSource source, List<ModelItem> models) {
  if (source.isAuto) {
    for (final m in models) {
      if (BrainModelSource.isUsable(m)) return (m.model ?? '').trim();
    }
    return null;
  }
  return upstreamModelIdOf(source, models);
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
  required List<ModelItem> models,
}) {
  final override = routing.lobeOverrides[lobe];
  if (override == null || override.isAuto) return routing.defaultSource;
  if (override.isLocal) return override;
  if (upstreamModelIdOf(override, models) == null) return routing.defaultSource;
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
  required List<ModelItem> models,
}) {
  return {
    for (final lobe in lobes)
      lobe: effectiveModelIdOf(
        effectiveLobeSource(
          routing: routing,
          lobe: lobe,
          models: models,
        ),
        models,
      ),
  };
}

/// 所有可用的云端供应商 —— 要注册进 neuron 派发表的那些。
///
/// **注册全部**（而不是只注册被选中的那一个）—— 因为不同叶区可以用不同
/// 来源：这一整份注册进去，任何叶区想切到哪条都行。
List<Map<String, String>> usableCloudProviders(List<ModelItem> models) {
  return [
    for (final m in models)
      if (BrainModelSource.isUsable(m))
        {
          'base_url': (m.endpoint ?? '').trim(),
          'api_key': m.apiKey ?? '',
          'model': (m.model ?? '').trim(),
        },
  ];
}

/// 构造交给大脑的模型路由 JSON。
///
/// 形状与 Rust 侧的 `encephalon::embedded::ModelRouting` **以及**端脑面
/// `POST /api/telencephalon/lobes/models` 一一对应：
/// ```json
/// {
///   "providers": [{"base_url": "...", "api_key": "...", "model": "..."}],
///   "default_model": "MiniMax-M3",
///   "lobe_models": {"prefrontal": null, "temporal": "MiniMax-M3"}
/// }
/// ```
///
/// ⚠️ **`lobe_models` 只装显式覆盖的叶区。**
/// 「不在表里」= 跟随全局默认 —— 要是把每个叶区的**有效值**都塞进去，
/// 「跟随全局」就被钉死了，改全局默认时那些叶区不会跟着变。
Map<String, dynamic> buildModelRoutingPayload({
  required BrainModelRouting routing,
  required List<ModelItem> models,
}) {
  final providers = usableCloudProviders(models);

  // 全局默认：auto ⇒ 第一个可用的云端供应商（老行为，不破坏兼容）。
  final defaultModel = effectiveModelIdOf(routing.defaultSource, models);

  // per-lobe 覆盖：值是上游模型 id；`null` = 该叶区强制本地。
  final lobeModels = <String, dynamic>{};
  for (final entry in routing.lobeOverrides.entries) {
    final source = entry.value;
    if (source.isAuto) continue; // 「跟随全局默认」= 不进表
    if (source.isLocal) {
      lobeModels[entry.key] = null; // 强制本地
      continue;
    }
    final id = upstreamModelIdOf(source, models);
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
