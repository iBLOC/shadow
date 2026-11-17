import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/device_data_channel.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// 「**模型能设置聊天背景**」这一格（2026-11-17）。
///
/// ## 这一格为什么是承重的
///
/// ⚠️ 手机**本来就有**聊天背景（设置页能挑图、能落盘、能跨重启）⇒ ⇒ 但
/// **模型调不到它**⇒ ⇒ 用户说「把聊天背景换成这张」⇒ ⇒ 模型**只能**退回
/// 去用无障碍**盲点屏幕**（`mobile_tap` 一个坐标）⇒ ⇒ 那不是「设置背景」，
/// 是「赌坐标」⇒ ⇒ 用户看到的现象就是「模型只会瞎点」。
///
/// ⇒ ⇒ 这一格钉的是：**工具在**、**参数说得清**、**权限那一档没被绕过**、
/// **字节真的搬进了 App 目录**、**落盘走的是界面那一层**、**失败都响亮**。

/// **假通道** —— 把原生层换成可断言的东西。
class _FakeChannel extends DeviceDataChannel {
  _FakeChannel({this.granted = true});

  bool granted;

  /// 被搬过的 URI（按顺序）。
  final List<String> copied = [];

  @override
  Future<bool> hasOsPermission(String capabilityWire) async => granted;

  @override
  Future<PermissionRequestOutcome> requestPermissionDetailed(
    String capabilityWire,
  ) async {
    permissionRequests++;
    if (requestResult) granted = true;
    return PermissionRequestOutcome(
      granted: requestResult,
      dialogShown: requestResult,
      permanentlyDenied: false,
      superseded: false,
    );
  }

  /// 「申请权限」这个动作的结果（模拟用户批 / 不批）。
  bool requestResult = false;

  /// 断言用：被问了几次权限。
  int permissionRequests = 0;

  @override
  Future<String> copyMediaToAppFiles(String uri) async {
    copied.add(uri);
    return '/data/user/0/com.ibloc.shadow/files/chat_background/background_1.jpg';
  }
}

/// 造一份注册表 —— 聊天背景的落盘那一半是**假的**（单测不碰文件系统）。
ClientToolRegistry _registry({
  required DeviceDataChannel channel,
  Future<void> Function(String? path)? apply,
}) {
  return buildMobileClientTools(
    setAccentColor: (_) async {},
    setDarkMode: (_) async {},
    fetchSurfaceEvents: (_) async => <Map<String, Object?>>[],
    generateImage: (_) async => <String, dynamic>{},
    deviceDataChannel: channel,
    setChatBackgroundPath: apply,
  );
}

void main() {
  test('这个工具在注册表里（模型能叫得出它）', () {
    final registry = _registry(channel: _FakeChannel());
    expect(
      registry.supports('set_chat_background'),
      true,
      reason: 'the tool is missing ⇒ ⇒ the model can only fall back to blind taps',
    );
  });

  test('它要相册那一档能力（不因为「只是换背景」就绕过授权）', () {
    final registry = _registry(channel: _FakeChannel());
    final tool = registry.lookup('set_chat_background')!;
    expect(
      tool.capability,
      Capability.photos,
      reason: 'the background image comes from the album ⇒ ⇒ that authorisation applies',
    );
    final declared = tool.parameters?['properties']?['required_permissions'];
    expect(
      declared != null,
      true,
      reason: 'the tool must declare the permission it needs ⇒ ⇒ the app can '
          'check the declaration against the real requirement',
    );
  });

  test('给了 contentUri ⇒ ⇒ 字节搬进 App 目录 ⇒ ⇒ 落盘走界面那一层', () async {
    final channel = _FakeChannel();
    final applied = <String?>[];
    final registry = _registry(
      channel: channel,
      apply: (path) async => applied.add(path),
    );

    final result = await registry.lookup('set_chat_background')!.execute({
      'content_uri': 'content://media/external/images/media/123',
    });

    expect(
      channel.copied,
      ['content://media/external/images/media/123'],
      reason: 'the bytes must be copied into the app directory ⇒ ⇒ a content:// '
          'uri is not readable by dart and its permission is temporary',
    );
    expect(
      applied,
      ['/data/user/0/com.ibloc.shadow/files/chat_background/background_1.jpg'],
      reason: 'the copied path must be the one the app stores ⇒ ⇒ the '
          'background survives a restart',
    );
    expect(result, containsPair('applied', 'background'));
  });

  test('clear ⇒ ⇒ 恢复默认底（不去搬字节）', () async {
    final channel = _FakeChannel();
    final applied = <String?>[];
    final registry = _registry(
      channel: channel,
      apply: (path) async => applied.add(path),
    );

    final result = await registry.lookup('set_chat_background')!.execute({
      'clear': true,
    });

    expect(channel.copied, isEmpty, reason: 'clearing must not copy anything');
    expect(applied, [null], reason: 'clearing must reset the stored path');
    expect(result, containsPair('applied', 'cleared'));
  });

  test('两个参数都没有 ⇒ ⇒ 响亮地失败（不默默什么也不做）', () async {
    final registry = _registry(channel: _FakeChannel());
    expect(
      () => registry.lookup('set_chat_background')!.execute(<String, dynamic>{}),
      throwsA(isA<FormatException>()),
      reason: 'an empty call must fail loudly ⇒ ⇒ a silent no-op looks like success',
    );
  });

  test('宿主没接线 ⇒ ⇒ 响亮地失败（不假装设好了）', () async {
    final registry = _registry(channel: _FakeChannel());
    expect(
      () => registry.lookup('set_chat_background')!.execute({
        'content_uri': 'content://media/external/images/media/123',
      }),
      throwsA(isA<StateError>()),
      reason: 'an unwired host must say so ⇒ ⇒ "not wired" must never look like "set"',
    );
  });

  test('相册权限没给 ⇒ ⇒ 失败（不偷偷读用户的相册）', () async {
    final channel = _FakeChannel(granted: false);
    final applied = <String?>[];
    final registry = _registry(
      channel: channel,
      apply: (path) async => applied.add(path),
    );

    await expectLater(
      registry.lookup('set_chat_background')!.execute({
        'content_uri': 'content://media/external/images/media/123',
      }),
      throwsA(isA<StateError>()),
    );
    expect(channel.copied, isEmpty, reason: 'nothing may be read without it');
    expect(applied, isEmpty, reason: 'and nothing may be stored either');
  });
}
