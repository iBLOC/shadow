/**
 * 「移动端后台常驻面」判据库（纯函数 · 零依赖）
 * ============================================================================
 *
 * ## 守什么
 *
 * 客户端要求「支持后台运行」（v2.9 落地：Android 前台服务保活）。这条线
 * 一共三处，**少一处就是「写着常驻、其实不常驻」**：
 *
 *   R1  manifest   `AndroidManifest.xml` 必须声明 FGS 权限
 *                  （FOREGROUND_SERVICE / FOREGROUND_SERVICE_DATA_SYNC /
 *                  POST_NOTIFICATIONS）＋ 插件的前台服务
 *                  （`foregroundServiceType` 必须带 dataSync ——
 *                  targetSdk 34+ 缺类型 ⇒ 启动即抛
 *                  `MissingForegroundServiceTypeException`）；
 *   R2  pubspec    `flutter_foreground_task` 依赖必须在（库没了，
 *                  Dart 侧 import 直接编译红 —— 这条是**兜底形状**，
 *                  防「Dart 写了、依赖忘了提交」这种半截提交）；
 *   R3  Dart 面    `background_run_service.dart` 必须有 startService /
 *                  stopService / setTaskHandler / ForegroundServiceTypes.dataSync
 *                  —— 通道的**两端**（起、停、入口、类型）都在同一处对得上。
 *
 * ## 为什么是「形状」判据
 *
 * 这三处的失败模式都是**静默**的：manifest 少一条权限 ⇒ 真机上一点开关
 * 就 `SecurityException`；pubspec 漏提交 ⇒ CI 上 `flutter analyze` 当场红
 * （但本地有缓存的人看不见）；Dart 缺 stop ⇒「关了开关服务还活着」。
 * ⇒ ⇒ 判形状，让它们在**文本层**就红，不用等真机。
 */

/** 剥 XML 注释（`<!-- … -->`）——注释里提到权限名不算声明。 */
export function stripXmlComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

/** 剥 Dart 行注释（`// …`，含 `///`）——注释里提到 API 名不算调用。 */
export function stripDartLineComments(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      // ⚠️ 字符串里的 `//`（`https://…`）不算注释 ⇒ 只剥**字符串外**的。
      let quote = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
          if (ch === '\\') i += 1;
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function manifestHasPermission(manifest, name) {
  const re = new RegExp(
    '<uses-permission\\s[^>]*android:name="' + name + '"',
  );
  return re.test(manifest);
}

/**
 * 判据主体。三个输入都是**源码文本**：
 *   manifest    AndroidManifest.xml 全文；
 *   pubspec     pubspec.yaml 全文；
 *   dartService lib/services/background/background_run_service.dart 全文。
 *
 * 返回 `{ issues: [{ kind, line }], counts }` —— issues 为空 = 绿。
 */
export function findBackgroundServiceIssues(inputs) {
  const issues = [];
  const manifest = stripXmlComments(inputs.manifest);
  const pubspec = String(inputs.pubspec || '');
  const dart = stripDartLineComments(inputs.dartService);

  // ── R1 manifest ──────────────────────────────────────────────
  const fgsPerms = [
    ['android.permission.FOREGROUND_SERVICE', 'missing-fgs-permission'],
    [
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'missing-fgs-permission-data-sync',
    ],
    ['android.permission.POST_NOTIFICATIONS', 'missing-post-notifications'],
  ];
  for (const [name, kind] of fgsPerms) {
    if (!manifestHasPermission(manifest, name)) {
      issues.push({ kind, line: 0 });
    }
  }

  const serviceMatch = manifest.match(
    /<service\s[^>]*android:name="com\.pravera\.flutter_foreground_task\.service\.ForegroundService"[^>]*>/,
  );
  if (!serviceMatch) {
    issues.push({ kind: 'missing-fgs-service', line: 0 });
  } else {
    // targetSdk 34+ 必须带类型；允许 dataSync|其他（多类型并集里有
    // dataSync 就行 —— 启动时 startService 传的就是这个类型）。
    const tag = serviceMatch[0];
    const typeMatch = tag.match(/android:foregroundServiceType="([^"]*)"/);
    if (!typeMatch || !typeMatch[1].split('|').includes('dataSync')) {
      issues.push({ kind: 'service-without-datatype', line: 0 });
    }
  }

  // ── R2 pubspec ───────────────────────────────────────────────
  const pubspecCode = pubspec
    .split('\n')
    .map((l) => (l.trimStart().startsWith('#') ? '' : l))
    .join('\n');
  if (!/^\s*flutter_foreground_task:\s*\S/m.test(pubspecCode)) {
    issues.push({ kind: 'missing-pubspec-dep', line: 0 });
  }

  // ── R3 Dart 面 ───────────────────────────────────────────────
  const dartAnchors = [
    ['FlutterForegroundTask.startService(', 'missing-dart-start'],
    ['FlutterForegroundTask.stopService(', 'missing-dart-stop'],
    ['FlutterForegroundTask.setTaskHandler(', 'missing-dart-handler'],
    ['ForegroundServiceTypes.dataSync', 'missing-dart-datatype'],
  ];
  for (const [anchor, kind] of dartAnchors) {
    if (!dart.includes(anchor)) {
      issues.push({ kind, line: 0 });
    }
  }

  return {
    issues,
    counts: {
      fgsPermissions: fgsPerms.filter(([n]) => manifestHasPermission(manifest, n))
        .length,
      fgsService: serviceMatch ? 1 : 0,
      pubspecDep: /^\s*flutter_foreground_task:\s*\S/m.test(pubspecCode) ? 1 : 0,
      dartAnchors: dartAnchors.filter(([a]) => dart.includes(a)).length,
    },
  };
}
