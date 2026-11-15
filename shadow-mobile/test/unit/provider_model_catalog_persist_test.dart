import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/screens/providers_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// ⚠️ **小米 MiMo 的官方真 id 全表**（2026-11-15）—— 官方
/// `GET https://api.xiaomimimo.com/v1/models` 的逐字回应（7 条，其中 4 条
/// 语音）⇒ ⇒ **夹具不许再用假 id**（`mimo-2.5-tts` 那种 —— 官方目录里
/// 没有它 ⇒ ⇒ 拿假 id 判据会「绿成假象」）。
///
/// ⚠️ 这七条**各归哪一档**＝大脑五档判据的结果（用户覆盖 → 上游标注 →
/// 出厂清单 → 族缀推断 → 兜底 llm）⇒ ⇒ 那份判定在端脑仓
/// `telencephalon/src/api/providers.rs` 里有判据钉住 ⇒ ⇒ 两边合起来
/// 才是「大脑真这么判」这整个契约。
const List<String> mimoOfficialModelIds = [
  'mimo-v2.5-asr',
  'mimo-v2.5-tts',
  'mimo-v2.5-tts-voiceclone',
  'mimo-v2.5-tts-voicedesign',
  'mimo-v2.6-flash',
  'mimo-v2.6-pro',
  'mimo-v2.6-pro-ultraspeed',
];

/// 大脑给每条模型的**有效能力**（读面算的那一列）。
String _brainCapability(String id) {
  if (id.contains('-asr')) return 'asr';
  if (id.contains('-tts')) return 'tts';
  return 'llm';
}

/// 大脑那条供应商的模型清单（读视图形状：`capabilities` 数组 + 来源列）。
List<Map<String, dynamic>> _brainModels() => [
  for (final id in mimoOfficialModelIds)
    {
      'id': id,
      'name': id,
      'model_id': id,
      'is_default': false,
      'capabilities': [_brainCapability(id)],
      'capability_source': 'catalog',
      'supports_vision': false,
      'supports_function_calling': false,
      'available': true,
    },
];

Map<String, dynamic> _providerJson(List<Map<String, dynamic>> models) => {
  'id': 'prov-mimo',
  'name': 'Xiaomi MiMo',
  'provider_type': 'openai',
  'api_base': 'https://api.xiaomimimo.com/v1',
  'base_url': 'https://api.xiaomimimo.com/v1',
  'api_standard': 'openai',
  'enabled': true,
  'selected_model': null,
  'preset_id': 'xiaomi-mimo',
  'builtin': false,
  'models': models,
};

const _jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
};

void main() {
  /// 一个**假脑**：形状照大脑逐字（建供应商 ⇒ 模型清单是空的；拉模型 ⇒
  /// 清单落盘；读清单 ⇒ 带着落盘后的清单）。
  ///
  /// ⚠️ **「建供应商时清单是空的」是逐字形状** —— 大脑的
  /// `add_provider` 存的是 `req.models.unwrap_or_default()`，而客户端
  /// 建的时候**不带** models ⇒ ⇒ 所以「模型清单」**只能**靠随后的
  /// fetch-models 落盘 ⇒ ⇒ 客户端不落盘，能力页就永远看不见它。
  ({TelencephalonClient client, List<String> calls, List<Map<String, dynamic>> persisted})
  fakeBrain() {
    final calls = <String>[];
    var persisted = <Map<String, dynamic>>[];
    final client = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:60080',
      client: MockClient((req) async {
        final path = req.url.path;
        calls.add('${req.method} $path');
        if (path == '/models/providers' && req.method == 'POST') {
          // ⚠️ 大脑建供应商时**没有**模型清单（客户端没随建随带）。
          return http.Response(
            jsonEncode(_providerJson(const [])),
            200,
            headers: _jsonHeaders,
          );
        }
        if (path == '/models/providers/prov-mimo/fetch-models' &&
            req.method == 'POST') {
          persisted = _brainModels();
          return http.Response(
            jsonEncode({'models': persisted, 'count': persisted.length}),
            200,
            headers: _jsonHeaders,
          );
        }
        if (path == '/models/providers' && req.method == 'GET') {
          return http.Response(
            jsonEncode([_providerJson(persisted)]),
            200,
            headers: _jsonHeaders,
          );
        }
        if (path == '/models/providers/presets') {
          return http.Response(
            jsonEncode(const []),
            200,
            headers: _jsonHeaders,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    return (client: client, calls: calls, persisted: persisted);
  }

  test(
    '⚠️ 接入云供应商 ⇒ 模型清单**落盘** ⇒ 能力页的语音合成档选得到 mimo-v2.5-tts',
    () async {
      final brain = fakeBrain();
      final notifier = ProvidersNotifier(brain.client);

      final created = await notifier.addProvider(
        presetId: 'xiaomi-mimo',
        apiKey: 'sk-mimo',
      );
      expect(created, isNotNull, reason: '接入必须成功');

      // ❶ **建完必须去拉一次模型清单并落盘** —— 与桌面端
      // `AddProviderModal` 同一顺序、同一端点（桌面端早就有，手机漏了）。
      expect(
        brain.calls,
        contains('POST /models/providers/prov-mimo/fetch-models'),
        reason: '接入后必须拉一次模型清单并落盘（否则能力页的候选里没有它）',
      );

      // ❷ 大脑里那条供应商现在**带着**模型 ⇒ 能力页的候选从它来。
      final providers = await brain.client.listProviders();
      expect(
        providers.single.models.map((m) => m.id),
        containsAll(mimoOfficialModelIds),
      );

      // ❸ **能力页（分档卡）的语音合成档**：可选 mimo-v2.5-tts（云供应商
      // ⇒ 端脑真能代理 ⇒ 真能用）。
      final catalog = capabilityCandidatesByCapability(providers);
      final options = capabilityOptionsByCapability(
        catalog,
        const ['asr', 'tts', 'image_gen'],
        const {'asr': [], 'tts': [], 'image_gen': []},
      );
      expect(
        options['tts']!.map((o) => o.id),
        contains('mimo-v2.5-tts'),
        reason: '语音合成档必须选得到云供应商的 mimo-v2.5-tts',
      );
      expect(options['asr']!.map((o) => o.id), contains('mimo-v2.5-asr'));
      // ⚠️ 对话模型不许混进语音档（分档要真分对）。
      expect(options['tts']!.map((o) => o.id), isNot(contains('mimo-v2.6-pro')));
      expect(options['llm']!.map((o) => o.id), contains('mimo-v2.6-pro'));
    },
  );

  test(
    '⚠️ 阴性对照：模型清单没落盘 ⇒ 语音合成档**没有**云模型（这就是症状）',
    () async {
      // 大脑里这条供应商的清单是空的（接入后没拉过）⇒ ⇒ 能力页的候选里
      // **一条云模型都没有** ⇒ ⇒ 「选不到 mimo-v2.5-tts」。
      final providers = await TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: MockClient(
          (req) async => http.Response(
            jsonEncode([_providerJson(const [])]),
            200,
            headers: _jsonHeaders,
          ),
        ),
      ).listProviders();

      final catalog = capabilityCandidatesByCapability(providers);
      final options = capabilityOptionsByCapability(
        catalog,
        const ['asr', 'tts', 'image_gen'],
        const {'asr': [], 'tts': [], 'image_gen': []},
      );
      expect(
        options['tts'] ?? const <CapabilityCandidateOption>[],
        isEmpty,
        reason: '清单没落盘 ⇒ 语音档没有候选',
      );
    },
  );
}
