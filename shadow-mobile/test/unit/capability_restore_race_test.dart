import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/capability_policy_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';

/// **恢复不许覆盖用户的改动** —— 能力授权档位的竞态。
///
/// ## 这条纪律钉的是什么
///
/// [CapabilityPolicyNotifier] 构造时**不 await** `_restore()`（fire-and-forget）
/// ⇒ ⇒ 恢复是**异步**的 ⇒ ⇒ 若用户（或调用方）在这期间改了档位
/// ⇒ ⇒ 恢复一完成就会把 state 覆盖成「文件里那个」⇒ ⇒
/// **用户的改动被静默吃掉**（界面跳回旧档 ⇒ 用户以为没改成）。
///
/// ⇒ ⇒ 这是「失败长得像成功」的近亲：**改动发生了，却被回退**。
///
/// ## 为什么它以前没被发现
///
/// 旧版 `AppConfigService._loadConfig()` 在**文件不存在**时**不动内存**
/// ⇒ ⇒ 单例里残留着上一个用例写进去的档位 ⇒ ⇒ 恢复读回那个残留值
/// ⇒ ⇒ 恰好「没覆盖掉」⇒ ⇒ 绿灯是**巧合**，不是机制。
/// ⇒ ⇒ 「读不到 ⇒ 一律回默认」这条规矩真正生效后，它才显形。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const a11yChannel = MethodChannel('com.ibloc.shadow/accessibility');

  late Directory cfgDir;
  late File cfgFile;

  setUpAll(() async {
    cfgDir = await Directory.systemTemp.createTemp('shadow-gate-race');
    cfgFile = File('${cfgDir.path}/app_config.json');
  });

  tearDownAll(() {
    AppConfigService.configFileOverride = null;
  });

  test('用户改档位后，还在飞的恢复不许把它覆盖掉', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(a11yChannel, (call) async {
      calls.add(call);
      return null;
    });
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(a11yChannel, null);
    });

    AppConfigService.configFileOverride = () async => cfgFile;

    final notifier = CapabilityPolicyNotifier();
    // ⚠️ 故意**不 await** 恢复（构造时它就在飞）⇒ ⇒ 紧接着改档位
    // ⇒ ⇒ 这就是「用户改得比恢复快」的那个窗口。
    await notifier.setMode(
      Capability.mobileUse,
      AuthorizationMode.fullAccess,
    );

    // ⚠️ 给恢复一点时间跑完（它要读盘）。
    await Future<void>.delayed(const Duration(milliseconds: 50));

    // ⚠️ 关键断言：用户的改动**还在** ⇒ ⇒ 恢复没吃掉它。
    expect(
      deviceActionsAllowedFor(notifier.state),
      isTrue,
      reason: '恢复不许把用户刚改的「完全访问」覆盖回默认',
    );

    // ⚠️ 而且推给原生侧的也得是 true（推的是 state，不是别的）。
    final pushed = calls
        .where((c) => c.method == 'setDeviceActionsAllowed')
        .toList();
    expect(pushed, isNotEmpty);
    expect(
      pushed.any((c) => (c.arguments as Map)['allowed'] == true),
      isTrue,
      reason: '必须推 allowed=true',
    );
  });
}
