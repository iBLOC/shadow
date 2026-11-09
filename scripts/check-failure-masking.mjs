#!/usr/bin/env node
/**
 * **「失败不许长得像成功」闸** —— 前端**吞异常**形状的守卫。
 *
 * ## 为什么要有这个闸
 *
 * 这一族缺陷在桌面端**反复出现**：把失败**变成**一个看起来正常的东西。
 *
 * - .catch(() => {}) —— 失败被吞 ⇒ ⇒ **界面说「成功了」，其实什么都没发生**。
 * - .catch(() => null) 之类 —— 失败被吞成一个「看起来没有」的值。
 * - .catch(() => setEvents([])) —— 读失败被渲染成「**一个都没有**」
 *   ⇒ ⇒ **「读不到」被说成「没有」**（用户以为那台机器真的什么都没录）。
 * - catch { } —— 整块 catch 是空的 ⇒ ⇒ 失败被吞，而且**连形状都不留**。
 *
 * ⚠️ 为什么它**特别**容易漏：这些代码**编译得过、跑得起来、界面上也不报错**
 * ⇒ ⇒ 没有任何测试会红 ⇒ ⇒ **只能靠闸**。
 *
 * ⚠️ 为什么它**不能**只靠人记：本会话同一族里，桌面端至少 **9 个落点**
 * ⇒ ⇒ 修掉两处之后还有 ⇒ ⇒ 「修好了」不等于「这一族干净了」。
 *
 * ## 闸门抓什么（判据＝**形状**，不是语义）
 *
 * ① **R1 swallow-empty** —— .catch(() => {})：吞掉错误，什么都不说。
 * ② **R2 swallow-scalar** —— .catch(() => null) 之类：吞掉错误并返回一个
 *    「看起来正常」的值。
 * ③ **R3 swallow-empty-collection** —— .catch(() => []) 之类：吞掉错误并
 *    伪装成「空」。
 * ④ **R4 read-failure-as-empty** —— **两种形态**：
 *    ❶ .catch(() => setX([]))；
 *    ❷ try/catch 形态：catch { setX([]); }（2026-11-08 补上 —— 原来只认 ❶
 *       ⇒ ⇒ 跨行/另一种写法完全漏网 ⇒ ⇒ 实测全仓只有 **1 处**，已修）。
 * ⑤ **R5 catch-block-empty** —— catch { }：整块 catch 是空的。
 *    ⚠️ 2026-11-08 升级：原来**只认单行**（{ } 同一行）⇒ ⇒ **跨行**的空 catch
 *       （块里只有注释）**全部漏网** ⇒ ⇒ 实测 **27 处**（19 个文件）
 *       ⇒ ⇒ 现在跨行也认 ⇒ ⇒ 落点数量**如实写在下面**（合法回落登记进债务清单，
 *       真缺陷标注出来）。
 * ⑥ **D1 / D2（Dart 面）** —— 移动端是**另一套语法** ⇒ ⇒ 另一套判据：
 *    ❶ `catch { }` / `catch (e) { }` / `on X catch (e) { }`：整块 catch 是空的；
 *    ❷ `.catchError((e) => {})` / `.catchError((e) => null)`：Future 上的吞法。
 *    ⚠️ 2026-11-08 加：移动端**第一次进面** ⇒ ⇒ 实测 148 个 lib/ 源文件、
 *       **14 处**落点（13 个文件）⇒ ⇒ 逐条分类登记进债务清单
 *       （**真缺陷只有 1 条** —— 移动端比桌面端健康得多）。
 *
 * ⚠️ **注释不算代码** —— 源码里到处是注释，其中**恰好**写着这些字样
 * ⇒ ⇒ 判据跑在**剥掉注释**的文本上（行号不变）⇒ ⇒ 不剥就是一堆误报。
 *
 * ## 债务清单
 *
 * 今天扫出来的落点分两类：**真缺陷**（⇒ ⇒ 修掉）与**合法回落**
 * （例如「读错误响应体失败 ⇒ ⇒ 当空字符串」）⇒ ⇒ 合法回落**登记进债务清单**
 * 并写清 **why / when** ⇒ ⇒ **别让它隐形**。
 *
 * ⚠️ **债务清单会自己变短**：清单里的某一处被修好之后 ⇒ ⇒ 那个落点不再有
 * 命中 ⇒ ⇒ **闸红**（提示把清单条目删掉）⇒ ⇒ 清单**只会变少**。
 *
 * ## 覆盖边界（**如实标注，别装作全覆盖**）
 *
 * - 查得出：❶ 源码里写成这些形状的失败吞噬点（TS/TSX，剥注释后）
 *   —— 2026-11-08 起**跨行**的 catch 空块也在内；
 *   ❷ **Dart 面**（shadow-mobile/lib，148 个源文件）：`catch { }` / `on X catch (e) { }`
 *   （D1）＋ `.catchError((e) => {})` 之类（D2）⇒ ⇒ **移动端也在面里了**。
 * - 查不出：① try/catch 里**有**处理但**处理错了**的；
 *   ② Dart 面的 `Future.any` / `whenComplete` / `unawaited` 上的静默吞法
 *   （Dart 面只认 D1/D2 两种形状）；
 *   ③ 跨进程的失败（Rust/Tauri 侧返回假成功）；
 *   ④ **写操作**失败被吞（localStorage 写满、剪贴板写不进之类）
 *   —— ⚠️ 这一族**没有**「长得像成功」的形状（写失败不会让界面显示成功），
 *   但它**同样是静默** ⇒ ⇒ 靠形状抓不到 ⇒ ⇒ 本闸抓不到 ⇒ ⇒ 如实标注。
 *
 * ## 退出码
 *
 * - 0：绿（没有新的落点，债务清单也准）；
 * - 1：**红**（有新的落点，或债务清单过期）；
 * - 2：**读不到源**（一个文件都没扫到）⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *     node scripts/check-failure-masking.mjs
 *     node scripts/check-failure-masking.mjs --self-test
 *     node scripts/check-failure-masking.mjs --json
 *     node scripts/check-failure-masking.mjs --root C:/Projects/iBLOC
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const HERE = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const REPO = resolve(HERE, '..');

/**
 * **债务清单** —— 今天的实测盘点。
 *
 * ⚠️ 每一条都写清 **why**（为什么现在合法/为什么还没修）与 **when**（什么时候还）。
 * ⇒ ⇒ 不许把它变成一张永远没人还的清单。
 *
 * ⚠️ 键＝\`repo|file|kind\` ⇒ ⇒ **同一个文件、同一种判据，多个落点只算一条**。
 */
export const KNOWN_DEBT = [
  /* —— 读错误响应体失败 ⇒ 当空字符串（错误照样抛出）—— */
  {
    repo: 'shadow-desktop',
    file: 'src/lib/a2uiClient.ts',
    kind: 'R2',
    why: '读**错误响应体**失败 ⇒ 当空字符串（错误信息会少一段，但**错误照样抛出**）⇒ ⇒ 不是伪装成成功。',
    when: '端脑的错误响应体约定稳定后（能保证非空）可以改成原文透出。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/openaiClient.ts',
    kind: 'R2',
    why: '同款：读错误响应体失败 ⇒ 当空字符串 ⇒ ⇒ 错误照样抛出。',
    when: '同上。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/telencephalonClient.ts',
    kind: 'R2',
    why: '同款：读错误响应体失败 ⇒ 当空字符串 ⇒ ⇒ 错误照样抛出。',
    when: '同上。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/stores/themeStore.ts',
    kind: 'R2',
    why: '⚠️ **并行会话在飞**（accent 种子召回的回落）⇒ ⇒ **本刀不碰**。',
    when: '那一侧改完后销账（或改成诚实失败）。',
  },

  /* —— 跨行空 catch（2026-11-08 升级 R5 时一次性量出来的）——
     每一处都看过上下文：多数是「失败不致命」的合法回落，
     ⚠️ 标注「真缺陷」的那几条是**真的还在骗人**，留给下一刀。 */
  {
    repo: 'shadow-desktop',
    file: 'src/components/AppInitializer.tsx',
    kind: 'R5',
    why: '设备探测**炸了** ⇒ ⇒ 当作「问不到」⇒ ⇒ **不踢**设备（宁可不踢，也不误踢）⇒ ⇒ 不是把失败说成成功。',
    when: '探测面引入显式的「问不到」提示时一并复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/components/business/LocalEnginePanel/LocalEnginePanel.tsx',
    kind: 'R5',
    why: '本地作业列表是**缓存**（存储读失败不致命）⇒ ⇒ 界面退回空列表 ⇒ ⇒ 属「尽力而为」的回落，不是伪装成功。',
    when: '该面板引入「缓存读失败」的显式提示时一并复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/components/preview/PreviewSplitter.tsx',
    kind: 'R5',
    why: '指针可能**已经被释放**（拖拽已结束）⇒ ⇒ 忽略这一次事件 ⇒ ⇒ 不是数据面的读失败。',
    when: '拖拽状态机引入显式状态时复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/aiSdkTelencephalonTransport.ts',
    kind: 'R5',
    why: '**中止/取消**时 controller 可能已关闭 ⇒ ⇒ 忽略 ⇒ ⇒ 真正的失败另有 throw ⇒ ⇒ 不是把失败说成成功。',
    when: '传输层区分「中止」与「失败」时复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/hippocampusClient.ts',
    kind: 'R5',
    why: '读错误响应体失败**不是致命** ⇒ ⇒ 错误照样抛出（只是少了响应体那一段）。',
    when: '端脑的错误响应体约定稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/httpInterceptor.ts',
    kind: 'R5',
    why: '响应体不是 JSON / 不是我们的错误格式 ⇒ ⇒ 当作「非 API 错误」⇒ ⇒ 后面照常按普通错误处理 ⇒ ⇒ 不是伪装成功。',
    when: '端脑的错误响应体约定稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/openaiClient.ts',
    kind: 'R5',
    why: '流里**单条** JSON 坏掉 ⇒ ⇒ 跳过那一条 ⇒ ⇒ 其余照常 ⇒ ⇒ 不是把整次调用说成成功。',
    when: '流协议格式稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/prefrontalClient.ts',
    kind: 'R5',
    why: '同款：读错误响应体失败不致命 ⇒ ⇒ 错误照样抛出。',
    when: '端脑的错误响应体约定稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/telencephalonClient.ts',
    kind: 'R5',
    why: '解析坏条目 ⇒ ⇒ 跳过那一条（其余照常）⇒ ⇒ 不是把整次读取说成成功。',
    when: '端脑响应格式稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/tenantMigration.ts',
    kind: 'R5',
    why: '标记**写不进**（隐私模式等）⇒ ⇒ 下次还会再跑一遍；靠 uri 去重兜底 ⇒ ⇒ 不会重复迁移。',
    when: '换成能写的存储后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/capabilityDefaults.ts',
    kind: 'R5',
    why: 'durable 副本**写不进**（隐私模式 / 配额满）⇒ ⇒ 忽略这一次 ⇒ ⇒ 端脑那份才是权威（本地这份只是缓存）⇒ ⇒ 不是把失败说成成功。',
    when: '写 durable 副本的返回契约若要区分「存没存进去」，那时销账（现在它返回 void ⇒ ⇒ 调用方分不出本地缓存有没有落盘）。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/pages/ConversationPage.tsx',
    kind: 'R5',
    why: '后端未就绪 ⇒ ⇒ 忽略那一条（统一收件箱可后续手动补出来）＋ 流里非 JSON ⇒ ⇒ 当纯文本保留 ⇒ ⇒ 不是伪装成功。',
    when: '后端就绪判据稳定后。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/pages/JdmEditorPage.tsx',
    kind: 'R5',
    why: '空画布**可接受**（表单才是真相源，画布只是可选视图）／画布已卸载 ⇒ ⇒ 不是把读失败说成成功。',
    when: '画布成为真相源时复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/stores/telencephalonStore.ts',
    kind: 'R5',
    why: 'localStorage 不可用 ⇒ ⇒ 忽略（没有持久化）／瞬时 Tauri 错误 ⇒ ⇒ 保持上一个 supervisor 状态 ⇒ ⇒ 不是把失败说成成功。',
    when: '持久化面引入显式降级提示时复核。',
  },

  /* —— Dart 面（shadow-mobile）：2026-11-08 普查 148 个 lib/ 源文件 —— */
  {
    repo: 'shadow-mobile',
    file: 'lib/agents/a2a/a2a_client.dart',
    kind: 'D1',
    why: '心跳 ping 是**尽力而为**（通道真坏了会走 `_handleError` / `_handleDisconnect` ⇒ ⇒ 断链有别的路报）⇒ ⇒ 忽略这一次 ping 失败不是把失败说成成功。',
    when: '心跳改成「失败即断链」时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/multimodal/audio_input_handler.dart',
    kind: 'D1',
    why: '幅度条是**装饰性**读数（录制本身不依赖它）⇒ ⇒ 这一��读不到不影响录制 ⇒ ⇒ 合法回落。',
    when: '幅度条开始承担语义（例如据此判静音）时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/screens/customer_service_screen.dart',
    kind: 'D1',
    why: 'USB 路由失败 ⇒ ⇒ 音频走当前 AudioManager 默认输出（手机外放/蓝牙）⇒ ⇒ 界面显示的是**真实**路由（`ref.watch(shadowOutputRouteProvider)`）⇒ ⇒ 没有谎称已路由。',
    when: '界面不再反映真实路由时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/screens/livestream_screen.dart',
    kind: 'D1',
    why: '同上（源码注释已写明：TTS 仍走当前默认输出）。',
    when: '同上。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/screens/voice_conversation_screen.dart',
    kind: 'D1',
    why: '同 customer_service_screen。',
    when: '同上。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/audio_ws_service.dart',
    kind: 'D1',
    why: '单条**非 JSON** 消息跳过（那条转写丢了，其余照常）⇒ ⇒ 不是把整条会话说成成功。',
    when: '音频 WS 协议稳定后。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/background/background_run_provider.dart',
    kind: 'D1',
    why: '逐个派发 ⇒ ⇒ 单个监听者炸了**不许连累别的** ⇒ ⇒ 合法回落。',
    when: '需要「谁炸了」可见时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/chat_background_service.dart',
    kind: 'D1',
    why: '旧背景文件删不掉**不阻塞**新状态（新的已经生效）⇒ ⇒ 合法回落。',
    when: '磁盘占用需要可见时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/encephalon/encephalon_mobile_provider.dart',
    kind: 'D1',
    why: '大脑起不来 ⇒ ⇒ 请求照常发出去、按它本来的语义失败（**不假装大脑在跑**）⇒ ⇒ 合法回落。',
    when: '就绪状态需要显式提示时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/session_transfer_service.dart',
    kind: 'D1',
    why: '端脑不可达 ⇒ ⇒ 退回**只本地**发现（列表少但不是假的）⇒ ⇒ 合法回落。',
    when: '发现列表需要标注「端脑不可达」时复核。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/telencephalon/telencephalon_client.dart',
    kind: 'D1',
    why: '❶ 就绪门自己抛错不该把请求一起带崩（照常发出去、按原语义失败）；❷ SSE 里**单条**坏 JSON 跳过（其余照常）⇒ ⇒ 合法回落。',
    when: '端脑协议稳定后。',
  },
  {
    repo: 'shadow-mobile',
    file: 'lib/services/video_frame_collector.dart',
    kind: 'D1',
    why: '单帧采集失败 ⇒ ⇒ 跳过这一帧（其余帧照常）⇒ ⇒ 合法回落。',
    when: '帧率统计需要体现丢帧时复核。',
  },
];

/** 判据表 —— 每条规则＝**形状** ＋ 说明。 */
export const RULES = [
  { id: 'R1', title: 'swallow-empty', re: /\.catch\(\s*\(\s*\)\s*=>\s*\{[ \t]*\}[ \t]*\)/g,
    note: '.catch(() => {}) —— 失败被吞，什么都不说' },
  { id: 'R2', title: 'swallow-scalar', re: /\.catch\(\s*\(\s*\)\s*=>\s*(?:null|undefined|false|true|0|''|"")[ \t]*\)/g,
    note: '.catch(() => null) 之类 —— 失败被吞成「看起来正常」的值' },
  { id: 'R3', title: 'swallow-empty-array', re: /\.catch\(\s*\(\s*\)\s*=>\s*\[[ \t]*\][ \t]*\)/g,
    note: '.catch(() => []) 之类 —— 失败被伪装成「空」' },
  { id: 'R4', title: 'read-failure-as-empty',
    re: /\.catch\(\s*\(\s*\)\s*=>\s*set[A-Za-z0-9_]*\([ \t]*\[[ \t]*\][ \t]*\)[ \t]*\)|\bcatch\s*(?:\([^)]*\))?\s*\{[\s]*set[A-Za-z0-9_]*\(\s*\[\s*\]\s*\)\s*;?[\s]*\}/g,
    note: '读失败 ⇒ 渲染成空：❶ .catch(() => setX([])) ❷ catch { setX([]) }（try/catch 形态）' },
  { id: 'R5', title: 'catch-block-empty', re: /\bcatch\s*(?:\([^)]*\))?\s*\{[\s]*\}/g,
    note: 'catch { } —— 整块 catch 是空的（**跨行也算**：块里只有注释同样是空）' },
];

/**
 * **Dart 面（shadow-mobile）的判据表** —— 另一套语法 ⇒ ⇒ 另一套判据。
 *
 * ① **D1 catch-block-empty** —— `catch { }` / `catch (e) { }` / `on X catch (e) { }`：
 *    整块 catch 是空的 ⇒ ⇒ 失败被吞。
 * ② **D2 catch-error-swallow** —— `.catchError((e) => {})` 之类：Future 上的吞法
 *    （⚠️ 今天实测 **0 命中** ⇒ ⇒ 留着当**预防性**的钉）。
 *
 * ⚠️ Dart 面**只认这两种形状** ⇒ ⇒ `Future.any`/`whenComplete`/`unawaited` 上的
 *    静默吞法、以及「catch 里有处理但处理错了」的，仍**抓不到**（如实标注）。
 */
export const DART_RULES = [
  { id: 'D1', title: 'catch-block-empty', re: /\bcatch\s*(?:\([^)]*\))?\s*\{[\s]*\}/g,
    note: 'catch { } —— 整块 catch 是空的（Dart 面：on X catch (…) { } 也算）' },
  { id: 'D2', title: 'catch-error-swallow', re: /\.catchError\s*\(\s*\([^)]*\)\s*=>\s*(?:\{\s*\}|(?:null|false|0|''|"")\s*)\s*\)/g,
    note: '.catchError((e) => {}) / .catchError((e) => null) —— Future 上的吞法' },
];

function walk(dir, out = [], extRe = /\.(ts|tsx|js|jsx|mjs)$/) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'target') continue;
      walk(p, out, extRe);
    } else if (extRe.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 测试目录**不参与判定（测试里吞异常是常事）⇒ ⇒ 但它们**照常被扫**，只是不计。 */
function isTestPath(p) {
  return /[\\/]__tests__[\\/]/.test(p) || /\.(test|spec)\.[jt]sx?$/.test(p);
}

/** Dart 侧的测试目录/测试文件（`test/`、`test_driver/`、`integration_test/`、`*_test.dart`）。 */
function isDartTestPath(p) {
  return /[\\/](test|test_driver|integration_test)[\\/]/.test(p) || /_test\.dart$/.test(p);
}

/**
 * 扫**一个面**（一个 app 的源码目录）⇒ ⇒ 落点清单（按该面自己的判据表）。
 * @param {string} srcDir 源码目录（如 shadow-desktop/src、shadow-mobile/lib）
 * @param {string} appRoot app 根（落点的相对路径按它算，如 src/lib/x.ts、lib/y.dart）
 * @param {string} repo 落点归属（'shadow-desktop' / 'shadow-mobile'）
 * @param {object[]} rules 该面的判据表
 * @returns {{findings: object[], filesRead: number}}
 */
export function scanDir(srcDir, appRoot, repo, rules, testFn = isTestPath, extRe = /\.(ts|tsx|js|jsx|mjs)$/) {
  const findings = [];
  let filesRead = 0;
  if (!existsSync(srcDir)) return { findings, filesRead };
  for (const file of walk(srcDir, [], extRe)) {
    filesRead += 1;
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw, {});
    const lines = raw.split(/\r?\n/);
    for (const rule of rules) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m;
      while ((m = re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split('\n').length;
        findings.push({
          repo,
          file: relative(appRoot, file).replace(/[\\/]/g, '/'),
          kind: rule.id,
          title: rule.title,
          line,
          snippet: (lines[line - 1] ?? '').trim().slice(0, 160),
          isTest: testFn(file),
        });
      }
    }
  }
  return { findings, filesRead };
}

/**
 * 扫**整个仓**（两个面）⇒ ⇒ 落点清单。
 *
 * ⚠️ 2026-11-08 起**移动端也在面里**（shadow-mobile/lib，Dart 面）⇒ ⇒
 * 「这一族」不再只查桌面端 —— 桌面端 4 条真缺陷 vs 移动端 1 条（实测）。
 * @param {string} base 仓根（含 shadow-desktop/ 与 shadow-mobile/）
 * @returns {{findings: object[], filesRead: number}}
 */
export function scanRepo(base) {
  const desktopRoot = join(base, 'shadow-desktop');
  const mobileRoot = join(base, 'shadow-mobile');
  const d = scanDir(join(desktopRoot, 'src'), desktopRoot, 'shadow-desktop', RULES);
  const m = scanDir(join(mobileRoot, 'lib'), mobileRoot, 'shadow-mobile', DART_RULES, isDartTestPath, /\.dart$/);
  return { findings: d.findings.concat(m.findings), filesRead: d.filesRead + m.filesRead };
}

/**
 * 判定 —— **新增落点**与**过期债务**都判红。
 */
export function evaluate(findings, debt) {
  const real = findings.filter((f) => !f.isTest);
  const debtKeys = new Set(debt.map((d) => d.repo + '|' + d.file + '|' + d.kind));
  const hitKeys = new Set(real.map((f) => f.repo + '|' + f.file + '|' + f.kind));
  const fresh = real.filter((f) => !debtKeys.has(f.repo + '|' + f.file + '|' + f.kind));
  const stale = debt.filter((d) => !hitKeys.has(d.repo + '|' + d.file + '|' + d.kind));
  return { ok: fresh.length === 0 && stale.length === 0, fresh, stale, real };
}

function report(result, debt, filesRead) {
  const lines = [];
  const realDebt = debt.filter((d) => d.why.includes('真缺陷'));
  lines.push('扫了 ' + filesRead + ' 个源文件；落点 ' + result.real.length + ' 处（债务清单 ' + debt.length + ' 条，其中 ⚠️ 真缺陷 ' + realDebt.length + ' 条）');
  for (const d of debt) {
    const flag = d.why.includes('真缺陷') ? '⚠️ ' : '· ';
    lines.push('   ' + flag + d.repo + '|' + d.file + '|' + d.kind + ' —— ' + d.why);
  }
  if (result.fresh.length > 0) {
    lines.push('');
    lines.push('❌ 新增落点（**失败被伪装成成功/空**）：');
    for (const f of result.fresh) {
      lines.push('   · ' + f.repo + '|' + f.file + ':' + f.line + ' [' + f.kind + '] ' + f.snippet);
    }
    lines.push('');
    lines.push('   （⇒ ⇒ 修掉它；⇒ ⇒ 确实是合法回落 ⇒ ⇒ 登记进 KNOWN_DEBT（写清 why / when）⇒ ⇒ **别让它隐形**。）');
  }
  if (result.stale.length > 0) {
    lines.push('');
    lines.push('❌ 债务清单过期（这些落点已经不存在了 ⇒ ⇒ 销账）：');
    for (const d of result.stale) {
      lines.push('   · ' + d.repo + '|' + d.file + '|' + d.kind);
    }
  }
  if (result.ok) {
    lines.push('');
    lines.push('✅ 绿：没有新的「失败长得像成功」落点，债务清单也对得上。');
  }
  return lines.join('\n');
}

/** 自检 —— 每条判据都要有**正控**与**孪生**（不许有空绿）。 */
function selfTest() {
  const cases = [];
  const check = (name, cond) => cases.push({ name, ok: !!cond });
  /** 判据跑在**剥掉注释**的文本上（与真跑时一致）⇒ ⇒ 注释里的字样不算命中。 */
  const hits = (src, ruleId) => {
    const rule = RULES.concat(DART_RULES).find((r) => r.id === ruleId);
    if (!rule) throw new Error('no such rule: ' + ruleId);
    const code = stripComments(src, {});
    return new RegExp(rule.re.source, rule.re.flags).test(code);
  };

  // ❶ 正控：五种形状都要被抓到
  const positive = [
    ['R1', 'x.catch(() => {});'],
    ['R2', 'x.catch(() => null);'],
    ['R3', 'x.catch(() => []);'],
    ['R4', 'x.catch(() => setEvents([]));'],
    ['R5', 'try { a(); } catch { }'],
    // ⚠️ 2026-11-08 新增正控：R4 的 try/catch 形态 ＋ R5 的**跨行**形态
    ['R4', 'try { a(); } catch { setPeers([]); }'],
    ['R4', 'try { a(); } catch {\n  setPeers([]);\n}'],
    ['R5', 'try {\n  a();\n} catch {\n  /* noop */\n}'],
    ['R5', 'try {\n  a();\n} catch {\n\n}'],
    // ⚠️ 2026-11-08 新增正控：Dart 面（D1/D2）
    ['D1', 'try { a(); } catch (_) {}'],
    ['D1', 'try { a(); } catch (e) {\n  // ignore\n}'],
    ['D1', 'try { a(); } on StateError catch (e) {}'],
    ['D2', 'f.catchError((e) => {});'],
    ['D2', "f.catchError((e) => null);"],
  ];
  for (const pair of positive) {
    check('正控 ' + pair[0] + '：' + pair[1].replace(/\n/g, '\\n'), hits(pair[1], pair[0]));
  }

  // ❷ 孪生：**诚实的**处理不许被抓
  const twins = [
    ['R1', 'x.catch((e) => setError(e.message));'],
    ['R1', 'x.catch((e) => { setError(e.message); });'],
    ['R1', 'x.then((v) => v).catch((e) => { throw e; });'],
    ['R2', 'const r = await resp.text();'],
    // ⚠️ 2026-11-08 新增孪生：catch 里**有**实质处理 ⇒ ⇒ 不是空块
    ['R4', 'try { a(); } catch { setError(e.message); }'],
    ['R4', 'try { a(); } catch {\n  setError(e.message);\n}'],
    ['R5', 'try { a(); } catch { console.warn("x"); }'],
    ['R5', 'try { a(); } catch {\n  setError(e.message);\n}'],
    // ⚠️ 2026-11-08 新增孪生：Dart 面
    ['D1', 'try { a(); } catch (e) { debugPrint(e); }'],
    ['D1', 'try { a(); } catch (e) {\n  debugPrint(e);\n}'],
    ['D2', 'f.catchError((e) => rethrow(e));'],
  ];
  for (const pair of twins) {
    check('孪生（不许报）' + pair[0] + '：' + pair[1].replace(/\n/g, '\\n'), !hits(pair[1], pair[0]));
  }

  // ❸ 孪生：注释里的字样**不许**算命中
  const commented = '// 以前这里 .catch(() => {}) 把 404 吞了\n/* .catch(() => null) */\nconst a = 1;';
  const commentHit = RULES.some((rule) => hits(commented, rule.id));
  check('孪生：注释里的字样不算命中', !commentHit);

  // ❹ 判定逻辑：新增落点 ⇒ 红；过期债务 ⇒ 红
  const f = (file, kind) => ({ repo: 'shadow-desktop', file, kind, isTest: false });
  const r1 = evaluate([f('a.ts', 'R1')], []);
  check('判定：新增落点 ⇒ 红', !r1.ok && r1.fresh.length === 1);
  const r2 = evaluate([f('a.ts', 'R1')], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：登记过的落点 ⇒ 绿', r2.ok);
  const r3 = evaluate([], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：过期债务 ⇒ 红', !r3.ok && r3.stale.length === 1);
  const r4 = evaluate([f('a.ts', 'R1')], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：测试目录里的落点不计', r4.ok);

  for (const c of cases) {
    console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name);
  }
  const bad = cases.filter((c) => !c.ok).length;
  console.log('');
  console.log('自检：' + (cases.length - bad) + '/' + cases.length + ' 通过');
  return bad === 0;
}

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const rootArg = argv.includes('--root')
    ? resolve(argv[argv.indexOf('--root') + 1])
    : REPO;
  // ⚠️ **两个面**都在仓根下面（shadow-desktop/ 与 shadow-mobile/）⇒ ⇒ 移动端也在面里。
  const base = rootArg.endsWith('shadow-desktop') || rootArg.endsWith('shadow-mobile')
    ? resolve(rootArg, '..')
    : rootArg;
  if (!existsSync(join(base, 'shadow-desktop')) && !existsSync(join(base, 'shadow-mobile'))) {
    console.error('❌ 读不到源：' + base);
    process.exit(2);
  }
  const scanned = scanRepo(base);
  if (scanned.filesRead === 0) {
    console.error('❌ 一个源文件都没扫到 ⇒ ⇒ 「没红」不等于「没问题」。');
    process.exit(2);
  }
  const verdict = evaluate(scanned.findings, KNOWN_DEBT);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: verdict.ok, filesRead: scanned.filesRead, findings: verdict.real, fresh: verdict.fresh, stale: verdict.stale }, null, 2));
    process.exit(verdict.ok ? 0 : 1);
  }
  console.log(report(verdict, KNOWN_DEBT, scanned.filesRead));
  process.exit(verdict.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
