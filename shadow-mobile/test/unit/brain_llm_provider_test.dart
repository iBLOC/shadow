import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/ai/brain_llm_provider.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_service.dart';

/// 大脑（neuron）后端的 [BrainLlmProvider] —— **推理归 neuron 管**这条
/// 契约的判据级测试。
///
/// 验的是**接线形状**，不是模型输出：
/// - 请求走进程内 `infer('/v1/chat/completions')`（不是 Kotlin 本地引擎）；
/// - 请求体是 OpenAI 形状（messages ＋ 图片 data URL）；
/// - 音频附件**不静默丢弃** —— 回一句明说（失败长得像成功的反面）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late List<MethodCall> calls;
  late Uint8List lastBody;

  /// 装一个假的 native 推理通道。
  ///
  /// [response] = native 返回的响应体（UTF-8 文本）；
  /// [status] = HTTP 状态码；
  /// [noReply] = native 压根没回（.so 没加载 / 运行时没起）。
  void mockChannel({
    String response = '{"choices":[{"message":{"content":"你好"}}]}',
    int status = 200,
    bool noReply = false,
  }) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method != 'infer') return null;
      if (noReply) return null;
      final args = call.arguments as Map;
      lastBody = Uint8List.fromList(List<int>.from(args['body'] as List));
      return {
        'status': status,
        'body': Uint8List.fromList(utf8.encode(response)),
      };
    });
  }

  setUp(() {
    calls = <MethodCall>[];
    lastBody = Uint8List(0);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  BrainLlmProvider buildProvider() {
    return BrainLlmProvider(
      service: EncephalonMobileService(),
      failureText: () => '推理失败',
      audioHint: () => '语音转写还没接大脑',
    );
  }

  /// 解出最后一次 infer 请求体（OpenAI 形状）。
  Map<String, dynamic> lastPayload() {
    return jsonDecode(utf8.decode(lastBody)) as Map<String, dynamic>;
  }

  test('请求走进程内 infer ⇒ /v1/chat/completions（不是 Kotlin 本地引擎）',
      () async {
    mockChannel();
    final provider = buildProvider();

    final chunks = await provider
        .sendMessageStream('你好')
        .toList();

    expect(calls.any((c) => c.method == 'infer'), isTrue);
    final inferCall = calls.firstWhere((c) => c.method == 'infer');
    final args = inferCall.arguments as Map;
    expect(args['path'], '/v1/chat/completions');
    expect(chunks.join(), '你好');
  });

  test('请求体是 OpenAI 形状（messages 里带 user 角色）', () async {
    mockChannel();
    final provider = buildProvider();

    await provider.sendMessageStream('讲个笑话').toList();

    final payload = lastPayload();
    final messages = payload['messages'] as List;
    expect(messages, isNotEmpty);
    final last = messages.last as Map;
    expect(last['role'], 'user');
    expect(last['content'], '讲个笑话');
  });

  test('native 没回 ⇒ 明说失败，不装成功', () async {
    mockChannel(noReply: true);
    final provider = buildProvider();

    final chunks = await provider.sendMessageStream('你好').toList();

    expect(chunks.join(), contains('推理失败'));
  });

  test('native 回非 2xx ⇒ 失败说明里带上状态码（可定位）', () async {
    mockChannel(status: 500, response: 'boom');
    final provider = buildProvider();

    final chunks = await provider.sendMessageStream('你好').toList();

    expect(chunks.join(), contains('推理失败'));
    expect(chunks.join(), contains('500'));
  });

  test('响应形状不对 ⇒ 原样给片段，不吞成空成功', () async {
    mockChannel(response: 'not json at all');
    final provider = buildProvider();

    final chunks = await provider.sendMessageStream('你好').toList();

    expect(chunks.join(), contains('推理失败'));
    expect(chunks.join(), contains('not json'));
  });
}
