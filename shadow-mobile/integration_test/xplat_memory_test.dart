import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/providers/identity_provider.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'shadow_key.dart';

/// 「手机与宿主机读写**同一份**记忆」—— 这一条**跨设备边界**。
///
/// ## 它证明的是哪一句话
///
/// 「同一个账号 ⇒ 同一个人格 ⇒ 同一个海马体桶 ⇒ 手机写的记忆，宿主机那台
/// 端脑也看得见（反过来也一样）。」
///
/// ⚠️ 之前只能验到前半句：**租户选对了**（手机知道自己是 `persona-xxx`，
/// 而不是「背后没有人」的 `default`）。但「选对桶」≠「读写同一份」——
/// 真正要跨过去的是**存储**那一跳。
///
/// ## 这一跳怎么跨过去
///
/// 手机的记忆读写走 `PrefrontalClient` —— 打在 `localhost:60080` 的
/// `/hippocampus/api/*` 上（**不是**进程内那张端脑面：嵌在 `.so` 里的
/// 端脑**没有**海马体，指向它只会把「连接被拒」换成「404」）。
///
/// 宿主机上跑一台端脑（端脑 + 海马体合成一台服务，`/hippocampus` 是它
/// 挂出来的那张面），然后 `adb reverse tcp:60080 tcp:60080` ⇒ **手机的
/// `localhost:60080` 就是宿主那台** ⇒ 两端连的是**同一份 Lance 存储**。
///
/// ## 还有一个前提：两端得是**同一个人**
///
/// 海马体按租户分桶，租户 = 人格。宿主机那台端脑写记忆时用的租户是
/// **它自己的账号人格**（`hippo_auth()`：没有凭证就回退进程级账号）⇒
/// 宿主机和手机必须是**同一个账号**，否则一个写 `persona-A`、另一个读
/// `persona-B` ⇒ 两个桶 ⇒ 「看起来各写各的，且不报错」。
///
/// ⇒ 所以跑这条测试之前，宿主机那台端脑的身份目录里必须装的是**手机
/// 导出的那个账号**（`AccountIdentity::import` 写的就是同一份
/// `account.key`）⇒ 宿主机自报的人格必须和手机**逐字相同**。
///
/// 这条测试自己把这件事验掉：它拿**手机端脑自报的身份**当 ground truth，
/// 再断言**手机写的记忆落在宿主机那个桶里**（读回来能看见，且 `default`
/// 桶里看不见）。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  /// 宿主机那台端脑（端脑 + 海马体）。
  const hostSurface = 'http://127.0.0.1:60080';

  test('手机写进人格桶的记忆 ⇒ 宿主机那台端脑也看得见（同一份记忆）', () async {
    // ---------------------------------------------------------------------
    // 0) 手机先**认**宿主机的账号。
    //
    //    ⚠️ 为什么是「手机认宿主机」而不是反过来：手机的账号会被**重装**
    //    冲掉（`flutter test integration_test` 会卸载 App ⇒ 私有目录没了 ⇒
    //    下次启动随机生成一个新账号）⇒ 谁后动手谁说了算才没有竞态。
    //
    //    而且这一步走的是**产品自己的导入路径**（端脑的
    //    `POST /shadow/v1/identity`）⇒ 端脑自己写文件、换掉进程级身份、
    //    **立即生效** ⇒ 不需要重启大脑。
    // ---------------------------------------------------------------------
    final hostCode = await readHostAccountCode();
    expect(hostCode, isNotNull, reason: '设备上没有宿主机那台端脑的账号码');

    Map<dynamic, dynamic>? started;
    for (var attempt = 0; attempt < 30; attempt++) {
      started = await channel.invokeMethod<Map<dynamic, dynamic>>(
        'start',
        {'port': 0},
      );
      final port = started?['agentPort'] as int?;
      if (started?['success'] == true && (port ?? 0) > 0) break;
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    final agentPort = started?['agentPort'] as int?;
    expect(agentPort ?? 0, greaterThan(0), reason: '端脑面没起来');

    final key = await readShadowKey();

    final imported = await http.post(
      Uri.parse('http://127.0.0.1:$agentPort/shadow/v1/identity'),
      headers: {
        'Content-Type': 'application/json',
        ...shadowKeyHeaders(key),
      },
      body: jsonEncode({'code': hostCode}),
    );
    expect(
      imported.statusCode,
      200,
      reason: '导入账号失败：${imported.statusCode} ${imported.body}',
    );

    // ---------------------------------------------------------------------
    // 1) 端脑自报的身份 —— **ground truth**。
    // ---------------------------------------------------------------------
    final identityResponse = await http.get(
      Uri.parse('http://127.0.0.1:$agentPort/shadow/v1/identity'),
      headers: shadowKeyHeaders(key),
    );
    expect(
      identityResponse.statusCode,
      200,
      reason: '端脑的身份端点答了 ${identityResponse.statusCode}',
    );
    final identity = jsonDecode(identityResponse.body) as Map<String, dynamic>;
    expect(identity['identified'], isTrue, reason: '端脑没有身份');
    final persona = identity['persona'] as String;
    expect(persona, isNot('default'));

    // ---------------------------------------------------------------------
    // 2) 走 **App 自己那条路**解析身份 —— 租户必须落在那个人格桶上。
    // ---------------------------------------------------------------------
    final client = TelencephalonClient(baseUrl: 'http://127.0.0.1:$agentPort');
    client.setApiKey(key);
    final prefrontal = PrefrontalClient(baseUrl: hostSurface);
    final notifier = IdentityNotifier(client, prefrontal);

    final tenant = await notifier.resolveWithRetry();

    expect(tenant, persona, reason: 'App 解析出的租户和端脑自报的人格不一致');
    expect(prefrontal.tenantId, persona, reason: '租户没落到海马体 client 上');

    // ---------------------------------------------------------------------
    // 3) 往**人格桶**写一条记忆。
    //
    //    这一步跨过了设备边界：`hostSurface` 在手机上指的是**宿主机**那台
    //    端脑（adb reverse）⇒ 写进去的是**宿主的海马体**。
    // ---------------------------------------------------------------------
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final uri = 'memory://xplat-$stamp';
    await prefrontal.addMemory(
      AddMemoryRequest(
        uri: uri,
        content: '跨平台记忆对账 $stamp',
        dimension: 'Agent',
        tenantId: tenant,
      ),
    );

    // ---------------------------------------------------------------------
    // 4) 读回来：自己写的必须看得见（且只在自己的桶里）。
    // ---------------------------------------------------------------------
    final mine = await prefrontal.listMemories(tenantId: tenant);
    expect(
      mine.map((m) => m.uri),
      contains(uri),
      reason: '刚写进人格桶的记忆读不回来（跨设备那一跳断了？）',
    );

    final fallback = await prefrontal.listMemories(tenantId: 'default');
    expect(
      fallback.map((m) => m.uri),
      isNot(contains(uri)),
      reason: '记忆掉进 default 桶了 —— 那是「背后没有人」的桶',
    );

    // ---------------------------------------------------------------------
    // 5) 反向：**宿主机那台端脑**写的记忆，手机这边也得看得见。
    //
    //    用「注册一个叶区」当探针 —— 注册会经 `hippo_store::upsert_memory`
    //    往海马体写一行，而那一行落在**端脑进程级账号的人格桶**里
    //    （`hippo_auth()`：没有凭证就回退本机账号）。
    //
    //    ⇒ 这一条同时证明两件事：
    //    (a) 宿主机那台端脑**确实有账号**（否则它写的是 `default` 桶）；
    //    (b) 它的账号**和手机是同一个**（否则手机在 persona 桶里看不见）。
    // ---------------------------------------------------------------------
    final probe = 'xplat-probe-$stamp';
    final register = await http.post(
      // ⚠️ **没有 `/api` 前缀** —— 叶区注册是端脑面里**唯一**一个不挂 `/api`
      // 的路由（`telencephalon/src/api/lobe_register.rs`：
      // `.route("/telencephalon/lobes/{name}", post(register_handler))`），
      // 而它的兄弟路由全是 `/api/telencephalon/lobes/...`。
      // ⇒ 写成 `/api/telencephalon/lobes/...` 会拿到 **404**，而且**不报错**
      //（只是「没注册上」）。
      //
      // ⚠️ 端点判定表（shadow 仓 ㊷ 条）与 AGENTS.md 里把这个路径写成
      // `/api/telencephalon/lobes/{name}` ⇒ **那几处是错的**（本轮实测：
      // `/api/...` ⇒ 404，`/telencephalon/...` ⇒ 200）。
      Uri.parse('$hostSurface/telencephalon/lobes/$probe'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({
        'kind': 'native',
        'url': 'http://127.0.0.1:9/xplat-probe',
        'agent_card': {
          'name': probe,
          'description': '跨平台记忆对账探针',
          'url': 'http://127.0.0.1:9/xplat-probe',
          'version': '0.1.0',
          // `Capabilities` 的三个字段**全是必填**（没有 serde default）⇒
          // 少一个就是 400，不是「缺省」。
          'capabilities': {
            'streaming': false,
            'push_notifications': false,
            'state_transition_history': false,
          },
        },
      }),
    );
    expect(
      register.statusCode,
      200,
      reason: '宿主机那台端脑没接受叶区注册：${register.statusCode} ${register.body}',
    );

    // 注册是**写穿**到海马体的 ⇒ 行已经在桶里了。读回来找它。
    final afterProbe = await prefrontal.listMemories(tenantId: tenant);
    expect(
      afterProbe.map((m) => m.uri),
      contains('telencephalon:agent:$probe'),
      reason: '端脑写的记忆手机看不见 —— 两端不是同一个桶（账号没对上？）',
    );
  });
}

/// 宿主机那台端脑的账号密钥 —— **从开发机取**（`adb reverse` 指过来）。
///
/// ⚠️ 为什么不放在设备上（`files/xplat_account.txt`）：`flutter test
/// integration_test` 会**重装 App** ⇒ 私有目录被清掉 ⇒ 那个文件会在测试
/// 真正开始之前就没了 ⇒ 只能从宿主机现取。
///
/// ⚠️ 这个串是**明文的恢复凭据**：谁拿到它，谁就是那个人 ⇒ 它只走
/// loopback（`adb reverse` ⇒ 设备侧 127.0.0.1），不入库、不进日志。
Future<String?> readHostAccountCode() async {
  final response = await http.get(
    Uri.parse('http://127.0.0.1:60081/xplat_account.txt'),
  );
  if (response.statusCode != 200) return null;
  // BOM 会被 `trim()` 留着（U+FEFF 不是空白）⇒ 显式去掉。
  final code = response.body.replaceAll('\uFEFF', '').trim();
  return code.isEmpty ? null : code;
}
