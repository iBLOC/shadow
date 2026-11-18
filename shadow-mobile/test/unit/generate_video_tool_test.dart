import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_en.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_zh.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// 客户端工具 `generate_video` —— **「模型在对话里点名要一段视频」**那条路。
///
/// ## 为什么钉它
///
/// ⚠️ 官方那套视频协议是**两步**（创建 ⇒ 查询）⇒ ⇒ 端脑的门面也是两步
/// ⇒ ⇒ 客户端工具必须**自己轮询**（端脑不落状态 ⇒ ⇒ 零新增存储）。
///
/// ⚠️ **契约**（两端逐字一致）：
/// 执行结果 = `{ report, video }`
/// ⇒ `video` 是**给界面**的那一半（产物链接）；
/// `report` 是**给模型**的那一句（`pickReportPayload` 只放行它）。
///
/// ⚠️ **失败不许长得像成功** —— 上游说 failed / cancelled ⇒ ⇒ 工具**真的
/// 失败**（抛出去）⇒ ⇒ 不许做成一句「生成失败」的报告。
///
/// ⚠️ **超时不许假装失败** —— 还在上游跑着 ⇒ ⇒ 报「还在生成」＋ 任务 id。
void main() {
  ClientToolRegistry registryWith({
    required Future<Map<String, dynamic>> Function(Map<String, dynamic> body) generateImage,
    Future<Map<String, dynamic>> Function(Map<String, dynamic> body)? generateVideo,
    Future<Map<String, dynamic>> Function(String taskId, String model)? queryVideo,
    AppLocalizations Function()? l10nProvider,
    Duration videoPollBudget = const Duration(milliseconds: 180000),
    Duration videoPollInterval = const Duration(milliseconds: 3000),
  }) {
    return buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents: (_) async => const [],
      l10nProvider: l10nProvider,
      generateImage: generateImage,
      generateVideo: generateVideo,
      queryVideo: queryVideo,
      videoPollBudget: videoPollBudget,
      videoPollInterval: videoPollInterval,
    );
  }

  group('generate_video', () {
    test('进了注册表，且导出参数表带齐那几档', () {
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async => <String, dynamic>{},
        queryVideo: (_, __) async => <String, dynamic>{},
      );
      final tool = registry.lookup('generate_video');
      expect(tool, isNotNull);
      final openai = toOpenAiTools(registry).firstWhere(
        (t) => t['function']['name'] == 'generate_video',
      );
      final params = openai['function']['parameters'] as Map<String, dynamic>;
      expect(params['type'], 'object');
      expect(
        (params['properties'] as Map).keys.toSet(),
        {'prompt', 'model', 'duration', 'resolution', 'ratio', 'task_id'},
      );
      // ⚠️ **prompt 不是必填**（另一个入口是 task_id）⇒ ⇒ 两者都不是必填。
      expect(params.containsKey('required'), isFalse);
      // ⚠️ **枚举要全** —— 模型能填哪几个值就是契约。
      final props = params['properties'] as Map<String, dynamic>;
      expect((props['resolution'] as Map)['enum'],
          ['480P', '768P', '2K']);
      expect((props['ratio'] as Map)['enum'],
          ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
    });

    test('执行成功：创建 ⇒ 轮询 ⇒ 结果 = { report, video }，report 里带产物链接', () async {
      final requests = <Map<String, dynamic>>[];
      final queries = <String>[];
      final registry = registryWith(
        l10nProvider: AppLocalizationsZh.new,
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (body) async {
          requests.add(body);
          return {'task_id': '424010985738629', 'status': 'queued', 'model': 'MiniMax-H3'};
        },
        queryVideo: (taskId, model) async {
          queries.add('$taskId|$model');
          return {
            'task_id': taskId,
            'status': 'succeeded',
            'model': model,
            'url': 'https://cdn.example.com/out.mp4',
          };
        },
      );

      final result = await registry.lookup('generate_video')!.execute({
        'prompt': '一个男孩在海边打篮球',
      }) as Map<String, dynamic>;

      // ⚠️ 调的是**端脑门面**的运输那一半（创建 ⇒ 查询）。
      expect(requests, hasLength(1));
      expect(requests.single['prompt'], '一个男孩在海边打篮球');
      expect(queries, hasLength(1));

      final report = result['report'] as String;
      expect(report, AppLocalizationsZh().clientToolsVideoGenerated('https://cdn.example.com/out.mp4'));
      expect(report.contains('https://cdn.example.com/out.mp4'), isTrue);

      final video = result['video'] as Map<String, dynamic>;
      expect(video['url'], 'https://cdn.example.com/out.mp4');
      expect(video['status'], 'succeeded');
      expect(video['task_id'], '424010985738629');
    });

    test('轮询用的是**端脑给回来的**模型 id（不是调用方给的那个）', () async {
      final queries = <String>[];
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async =>
            {'task_id': 't1', 'status': 'queued', 'model': 'MiniMax-H3-Highspeed'},
        queryVideo: (taskId, model) async {
          queries.add(model);
          return {'task_id': taskId, 'status': 'succeeded', 'url': 'https://cdn.example.com/out.mp4'};
        },
      );
      await registry.lookup('generate_video')!.execute({'prompt': 'x'});
      expect(queries.single, 'MiniMax-H3-Highspeed');
    });

    test('⚠️ 上游说失败 ⇒ 工具**真的失败**（不许做成一句「生成失败」的报告）', () async {
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async =>
            {'task_id': 't2', 'status': 'queued', 'model': 'MiniMax-H3'},
        queryVideo: (taskId, model) async => {
          'task_id': taskId,
          'status': 'failed',
          'error': 'video description contains sensitive content',
        },
      );
      await expectLater(
        registry.lookup('generate_video')!.execute({'prompt': 'x'}),
        throwsFormatException,
      );
    });

    test('⚠️ 超时 ⇒ 报「还在生成」＋ 任务 id（**不许**说失败）', () async {
      final registry = registryWith(
        l10nProvider: AppLocalizationsZh.new,
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async =>
            {'task_id': 't3', 'status': 'queued', 'model': 'MiniMax-H3'},
        queryVideo: (taskId, model) async =>
            {'task_id': taskId, 'status': 'running'},
        // ⚠️ **预算缩到毫秒级**（可注入 ⇒ ⇒ 判据不必真等三分钟）。
        videoPollBudget: const Duration(milliseconds: 20),
        videoPollInterval: const Duration(milliseconds: 1),
      );
      final result = await registry.lookup('generate_video')!.execute({
        'prompt': 'x',
      }) as Map<String, dynamic>;

      final video = result['video'] as Map<String, dynamic>;
      expect(video['status'], 'processing');
      expect(video['task_id'], 't3');
      expect((result['report'] as String).contains('t3'), isTrue);
    });

    test('查回上一轮的任务：给了 task_id ⇒ 不新建', () async {
      var created = 0;
      final queries = <String>[];
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async {
          created += 1;
          return <String, dynamic>{};
        },
        queryVideo: (taskId, model) async {
          queries.add(taskId);
          return {'task_id': taskId, 'status': 'succeeded', 'url': 'https://cdn.example.com/out.mp4'};
        },
      );
      await registry.lookup('generate_video')!.execute({
        'task_id': 't4',
        'model': 'MiniMax-H3',
      });
      expect(created, 0, reason: '给了 task_id ⇒ 不新建');
      expect(queries.single, 't4');
    });

    test('给了 task_id 却没给 model ⇒ 明确失败（端脑不落状态 ⇒ 少了它查不了）', () async {
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async => <String, dynamic>{},
        queryVideo: (_, __) async => <String, dynamic>{},
      );
      await expectLater(
        registry.lookup('generate_video')!.execute({'task_id': 't5'}),
        throwsFormatException,
      );
    });

    test('既没 prompt 也没 task_id ⇒ 明确失败（不默默什么也不做）', () async {
      var called = 0;
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async {
          called += 1;
          return <String, dynamic>{};
        },
        queryVideo: (_, __) async => <String, dynamic>{},
      );
      await expectLater(
        registry.lookup('generate_video')!.execute({}),
        throwsFormatException,
      );
      await expectLater(
        registry.lookup('generate_video')!.execute({'prompt': '   '}),
        throwsFormatException,
      );
      expect(called, 0, reason: '失败发生在打端脑**之前**');
    });

    test('⚠️ 没接线（没注入运输）⇒ 响亮失败（不许静默成功）', () async {
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
      );
      await expectLater(
        registry.lookup('generate_video')!.execute({'prompt': 'x'}),
        throwsFormatException,
      );
    });

    test('可选参数没给 ⇒ 不外塞（不把本地默认值强塞给上游）', () async {
      final requests = <Map<String, dynamic>>[];
      final registry = registryWith(
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (body) async {
          requests.add(body);
          return {'task_id': 't6', 'status': 'queued', 'model': 'MiniMax-H3'};
        },
        queryVideo: (taskId, model) async =>
            {'task_id': taskId, 'status': 'succeeded', 'url': 'https://cdn.example.com/out.mp4'},
      );
      await registry.lookup('generate_video')!.execute({'prompt': 'x'});
      expect(requests.single.containsKey('model'), isFalse);
      expect(requests.single.containsKey('duration'), isFalse);
      expect(requests.single.containsKey('resolution'), isFalse);
      expect(requests.single.containsKey('ratio'), isFalse);

      await registry.lookup('generate_video')!.execute({
        'prompt': 'x',
        'model': 'm',
        'duration': 6,
        'resolution': '2K',
        'ratio': '9:16',
      });
      expect(requests.last['model'], 'm');
      expect(requests.last['duration'], 6);
      expect(requests.last['resolution'], '2K');
      expect(requests.last['ratio'], '9:16');
    });

    test('report 随语言走（英文系统 ⇒ 英文那句）', () async {
      final registry = registryWith(
        l10nProvider: AppLocalizationsEn.new,
        generateImage: (_) async => <String, dynamic>{},
        generateVideo: (_) async =>
            {'task_id': 't7', 'status': 'queued', 'model': 'MiniMax-H3'},
        queryVideo: (taskId, model) async => {
          'task_id': taskId,
          'status': 'succeeded',
          'url': 'https://cdn.example.com/out.mp4',
        },
      );
      final result = await registry.lookup('generate_video')!.execute({
        'prompt': 'x',
      }) as Map<String, dynamic>;
      expect(
        result['report'],
        AppLocalizationsEn().clientToolsVideoGenerated('https://cdn.example.com/out.mp4'),
      );
    });
  });
}
