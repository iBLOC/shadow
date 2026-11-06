/// 已知模型参数注册表 —— 「智能配置」的数据源。
///
/// ## 它回答什么
///
/// 用户在「添加自持模型」表单里输入一个模型 ID（`deepseek-r1`、
/// `qwen3:32b`、`gpt-4o`…）⇒ 表单据此**自动填充**上下文窗口、最大输出
/// Token、输入类型、能力、推理档位与推理参数映射 —— 用户再按实际部署
/// 改。不认识 ⇒ 表单提供「从接入点探测」兜底（本文件不管探测）。
///
/// ## ⚠️ 这是一张**客户端内置**的种子表
///
/// 参照 ZCode 的模型配置模式：字段就是那几项，值是**出厂默认**，不是
/// 真相 —— 真相永远以用户部署的那个服务为准。表的维护成本刻意压低：
/// **按家族匹配**（前缀 / 关键词），不逐模型罗列。
///
/// ## 匹配规则
///
/// 1. **精确命中**优先（含 ollama 的 `name:tag` 去掉 `:tag` 再试一次）；
/// 2. 然后按注册表顺序做**关键词命中**（`qwen3` 命中 `qwen3-32b` 与
///    `Qwen3-Coder`）；
/// 3. 都不中 ⇒ 返回 null（表单走探测）。
///
/// ## 推理参数映射（`reasoningParams`）
///
/// 「推理等级（从低到高）」落到请求体的**形状**因接口标准而异 ——
/// 同一个模型走 OpenAI 兼容网关和走 Claude 原生协议，参数长得不一样。
/// 模板是 `apiStandard → level → 请求体片段` 的纯函数；`levels == 0`
/// 表示该模型不支持推理档位开关（如 deepseek-r1 恒开思考、无档位）。
library;

/// 输入类型（模态）的取值域 —— 与表单的 chips 一一对应。
const List<String> kModelInputTypes = ['text', 'image', 'audio', 'video'];

/// 一个模型家族的出厂参数。
class KnownModelParams {
  /// 上下文窗口（token 数）。
  final int? contextWindow;

  /// 最大输出 Token。
  final int? maxOutputTokens;

  /// 输入类型（`kModelInputTypes` 的子集）。
  final List<String> inputTypes;

  /// 模型能力（大脑目录的 capability 取值域：llm/vision/…）。
  final List<String> capabilities;

  /// 推理档位数（0 = 不支持档位开关；2/3/4 = 从低到高的档数）。
  final int reasoningLevels;

  /// 推理参数映射：`apiStandard`（'openai' | 'claude'）× `level`
  /// （0..levels-1）⇒ 要并进请求体的参数片段。
  ///
  /// ⚠️ 只在 `reasoningLevels > 0` 时被调用；返回空 map = 该标准下
  /// 不需要额外参数（恒开思考的模型）。
  final Map<String, dynamic> Function(String apiStandard, int level)?
  reasoningParams;

  const KnownModelParams({
    this.contextWindow,
    this.maxOutputTokens,
    this.inputTypes = const ['text'],
    this.capabilities = const ['llm'],
    this.reasoningLevels = 0,
    this.reasoningParams,
  });
}

/// 一条注册表记录：家族的**匹配关键词** ＋ 出厂参数。
class _KnownFamily {
  /// 匹配关键词（对模型 ID 做**小写包含**判断；空串 = 只靠 [exact]）。
  final List<String> keywords;

  /// 精确匹配的模型 ID（小写；优先级高于关键词）。
  final List<String> exact;

  final KnownModelParams params;

  const _KnownFamily(this.keywords, this.params, {this.exact = const []});
}

/// OpenAI 兼容标准下，`reasoning_effort` 的档位序（低 → 高）。
const List<String> _kOpenAiEfforts = ['low', 'medium', 'high'];

/// Claude 原生协议下 thinking budget 的档位序（低 → 高）。
const List<int> _kClaudeBudgets = [4096, 8192, 16384];

/// 内置注册表 —— 覆盖主流家族；顺序即匹配优先级（先专后泛）。
///
/// ⚠️ 数值是**出厂默认**（写表时的公开规格），不是真理 —— 表单里
/// 全部可改。日期敏感的型号（如 `gpt-5`）只押家族不押窗口。
final List<_KnownFamily> _kRegistry = [
  // ── OpenAI ────────────────────────────────────────────────
  _KnownFamily(
    ['o1', 'o3', 'o4-mini'],
    const KnownModelParams(
      contextWindow: 200000,
      maxOutputTokens: 100000,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
      reasoningLevels: 3,
      reasoningParams: _openAiEffortParams,
    ),
  ),
  _KnownFamily(
    ['gpt-5'],
    const KnownModelParams(
      contextWindow: 400000,
      maxOutputTokens: 128000,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
      reasoningLevels: 3,
      reasoningParams: _openAiEffortParams,
    ),
  ),
  _KnownFamily(
    ['gpt-4o', 'gpt-4.1', 'chatgpt-4o'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputTypes: ['text', 'image', 'audio'],
      capabilities: ['llm', 'vision'],
    ),
    exact: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
  ),
  // ── Anthropic ─────────────────────────────────────────────
  _KnownFamily(
    ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'],
    const KnownModelParams(
      contextWindow: 200000,
      maxOutputTokens: 64000,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
      reasoningLevels: 3,
      reasoningParams: _claudeThinkingParams,
    ),
  ),
  _KnownFamily(
    ['claude-3-7'],
    const KnownModelParams(
      contextWindow: 200000,
      maxOutputTokens: 64000,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
      reasoningLevels: 3,
      reasoningParams: _claudeThinkingParams,
    ),
  ),
  _KnownFamily(
    ['claude-3-5'],
    const KnownModelParams(
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
    ),
  ),
  // ── Google ────────────────────────────────────────────────
  _KnownFamily(
    ['gemini-2.5-pro'],
    const KnownModelParams(
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      inputTypes: ['text', 'image', 'audio', 'video'],
      capabilities: ['llm', 'vision'],
      reasoningLevels: 3,
      reasoningParams: _geminiEffortParams,
    ),
  ),
  _KnownFamily(
    ['gemini-2.5-flash', 'gemini-2.0'],
    const KnownModelParams(
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      inputTypes: ['text', 'image', 'audio', 'video'],
      capabilities: ['llm', 'vision'],
    ),
  ),
  // ── DeepSeek ──────────────────────────────────────────────
  _KnownFamily(
    ['deepseek-r1'],
    // ⚠️ R1 恒开思考、无档位开关 ⇒ levels = 0，不产生推理参数。
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  _KnownFamily(
    ['deepseek-v3', 'deepseek-chat'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  // ── Qwen ──────────────────────────────────────────────────
  _KnownFamily(
    ['qwen3'],
    // Qwen3 是开关不是档位：两档（关 / 开），经 enable_thinking 表达。
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
      reasoningLevels: 2,
      reasoningParams: _qwenEnableThinkingParams,
    ),
  ),
  _KnownFamily(
    ['qwq', 'qwen2.5-coder', 'qwen2.5'],
    const KnownModelParams(
      contextWindow: 32768,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
    exact: ['qwen2.5-coder'],
  ),
  _KnownFamily(
    ['qwen2-vl', 'qvq'],
    const KnownModelParams(
      contextWindow: 32768,
      maxOutputTokens: 8192,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
    ),
  ),
  // ── GLM / Kimi / MiniMax ─────────────────────────────────
  _KnownFamily(
    ['glm-4.5', 'glm-4.6', 'glm-5'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputTypes: ['text'],
      capabilities: ['llm'],
      reasoningLevels: 2,
      reasoningParams: _glmThinkingParams,
    ),
  ),
  _KnownFamily(
    ['glm-4'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 4095,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  _KnownFamily(
    ['kimi-k2-thinking', 'kimi-latest'],
    const KnownModelParams(
      contextWindow: 256000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
      reasoningLevels: 2,
      reasoningParams: _kimiThinkingParams,
    ),
  ),
  _KnownFamily(
    ['kimi-k2', 'moonshot-v1'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  _KnownFamily(
    ['minimax-m2', 'abab'],
    const KnownModelParams(
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  // ── Llama / Mistral（ollama 自持最常见的两家）─────────────
  _KnownFamily(
    ['llama3.2-vision', 'llama4'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
    ),
  ),
  _KnownFamily(
    ['llama3', 'llama2'],
    const KnownModelParams(
      contextWindow: 8192,
      maxOutputTokens: 4096,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
  _KnownFamily(
    ['mistral-small-3', 'magistral'],
    const KnownModelParams(
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputTypes: ['text', 'image'],
      capabilities: ['llm', 'vision'],
    ),
  ),
  _KnownFamily(
    ['mistral', 'mixtral'],
    const KnownModelParams(
      contextWindow: 32768,
      maxOutputTokens: 8192,
      inputTypes: ['text'],
      capabilities: ['llm'],
    ),
  ),
];

/// OpenAI 系：`reasoning_effort`（低 → 高）。
Map<String, dynamic> _openAiEffortParams(String apiStandard, int level) {
  if (apiStandard != 'openai' || level < 0 || level >= _kOpenAiEfforts.length) {
    return const {};
  }
  return {'reasoning_effort': _kOpenAiEfforts[level]};
}

/// Claude 原生协议：extended thinking 的 budget_tokens（低 → 高）。
Map<String, dynamic> _claudeThinkingParams(String apiStandard, int level) {
  if (apiStandard != 'claude' || level < 0 || level >= _kClaudeBudgets.length) {
    return const {};
  }
  return {
    'thinking': {'type': 'enabled', 'budget_tokens': _kClaudeBudgets[level]},
  };
}

/// Gemini（OpenAI 兼容面）：`reasoning_effort` 同 OpenAI 形状。
Map<String, dynamic> _geminiEffortParams(String apiStandard, int level) {
  if (apiStandard != 'openai' || level < 0 || level >= _kOpenAiEfforts.length) {
    return const {};
  }
  return {'reasoning_effort': _kOpenAiEfforts[level]};
}

/// Qwen3（vLLM / DashScope 的 OpenAI 兼容面）：`enable_thinking` 开关。
Map<String, dynamic> _qwenEnableThinkingParams(
  String apiStandard,
  int level,
) {
  if (apiStandard != 'openai' || level < 0 || level >= 2) return const {};
  return {'enable_thinking': level >= 1};
}

/// GLM：`thinking.type` 开关。
Map<String, dynamic> _glmThinkingParams(String apiStandard, int level) {
  if (apiStandard != 'openai' || level < 0 || level >= 2) return const {};
  return {
    'thinking': {'type': level >= 1 ? 'enabled' : 'disabled'},
  };
}

/// Kimi：`thinking.type` 开关（与 GLM 同形，分开定义是给「按家族改模板」
/// 留缝 —— 两家的取值域将来可能分叉）。
Map<String, dynamic> _kimiThinkingParams(String apiStandard, int level) {
  if (apiStandard != 'openai' || level < 0 || level >= 2) return const {};
  return {
    'thinking': {'type': level >= 1 ? 'enabled' : 'disabled'},
  };
}

/// 档位 → OpenAI 兼容面参数片段的**通用兜底**（表单在档位变化时用）。
///
/// ⚠️ 注册表命中时优先用家族自己的模板（[KnownModelParams.reasoningParams]）
/// —— 这里只兜「未命中 / 用户手动改了档位数」的场。越界 ⇒ 空 map
/// （fail-closed，不塞半截参数）。
Map<String, dynamic> defaultReasoningParams(int levels, int level) {
  if (level < 0 || level >= levels || levels <= 0) return const {};
  switch (levels) {
    case 2:
      return {'enable_thinking': level >= 1};
    case 3:
      return {'reasoning_effort': _kOpenAiEfforts[level]};
    case 4:
      return {
        'reasoning_effort': const ['minimal', 'low', 'medium', 'high'][level],
      };
    default:
      return {};
  }
}

/// 注册表的查询结果：出厂参数 ＋ 它是怎么被匹配上的（给「已智能配置」
/// 徽标下那句来源说明用）。
class KnownModelMatch {
  final String modelId;
  final KnownModelParams params;

  /// 'exact'（精确命中）| 'family'（家族关键词命中）。
  final String matchedBy;

  /// 命中的家族名（调试与展示）。
  final String family;

  const KnownModelMatch({
    required this.modelId,
    required this.params,
    required this.matchedBy,
    required this.family,
  });
}

/// 查注册表：精确优先，其次家族关键词；都不中 ⇒ null。
///
/// ⚠️ ollama 的 `name:tag`（`qwen3:32b`）先剥掉 tag 再精确比对一轮 ——
/// tag 是量化/尺寸，不影响家族参数。
KnownModelMatch? lookupKnownModel(String modelId) {
  final raw = modelId.trim().toLowerCase();
  if (raw.isEmpty) return null;
  final candidates = <String>[raw];
  final tagAt = raw.indexOf(':');
  if (tagAt > 0) candidates.insert(0, raw.substring(0, tagAt));

  for (final id in candidates) {
    for (final f in _kRegistry) {
      if (f.exact.contains(id)) {
        return KnownModelMatch(
          modelId: modelId,
          params: f.params,
          matchedBy: 'exact',
          family: f.exact.first,
        );
      }
    }
  }
  for (final f in _kRegistry) {
    for (final kw in f.keywords) {
      if (raw.contains(kw)) {
        return KnownModelMatch(
          modelId: modelId,
          params: f.params,
          matchedBy: 'family',
          family: kw,
        );
      }
    }
  }
  return null;
}

/// 推理档位的**档位名**（低 → 高）—— 表单下拉用。
///
/// 档位数不同家族不同（OpenAI 系 3 档 / 开关型 2 档）；这里给通用名，
/// 具体映射进请求体是 [KnownModelParams.reasoningParams] 的事。
List<String> reasoningLevelNames(int levels) {
  switch (levels) {
    case 0:
      return const [];
    case 2:
      return const ['off', 'on'];
    case 3:
      return const ['low', 'medium', 'high'];
    case 4:
      return const ['minimal', 'low', 'medium', 'high'];
    default:
      return List.generate(levels, (i) => 'level-$i');
  }
}
