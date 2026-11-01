#!/usr/bin/env node
/**
 * A2UI 形态的「会话身份」一致性闸 —— **服务端落不落会话 ⇔ 客户端说不说会话身份**。
 *
 * ## 为什么要有这把闸
 *
 * 兄弟会话提了一个问题：「A2UI 形态要不要也补一行『当前会话』？」，
 * 并给了一句前提：「语义一样：那一形态下会话也是端脑那条」。
 *
 * ⚠️⚠️ **那句前提与代码不符**，而这一格若照它做，会**破掉移动端自己立的不变量**：
 * 「界面显示的这条会话 == 消息会落进去的那条」
 * （`shadow-mobile/AGENTS.md` ㋠ 条 / `chat_provider.dart` 的 `switchTo`）。
 *
 * 实测三条链（2026-11-01，**活仓**）：
 *
 * | 环节 | 事实 | 证据 |
 * |---|---|---|
 * | 端脑 `POST /a2a` | **不落会话** —— 每次请求新造 `task_id` + `context_id`，从不碰 `ConversationStore` | `telencephalon/src/api/a2ui_gateway.rs:68-69`（两个 `Uuid::new_v4()`）、`:85`（只读 `state.task_store`）、`:89`（只读 `state.lobe_cache`） |
 * | 客户端 A2UI 发送 | **不经 `chatProvider`** —— `Agent2UIInputBar` 直接 `service.sendMessage(text)` | `shadow-mobile/lib/widgets/chat/agent2ui_view.dart`（输入条） |
 * | 两端 A2UI 界面 | **都不显示会话身份** —— 桌面 `A2uiPanel.tsx` 里 `conversation|session|title` 命中 **0** 次 | 本闸自己量 |
 *
 * ⇒ ⇒ **A2UI 形态是一条「不记会话」的形态**（每一次请求对端脑都是新的
 * `context_id`，没有「上一条会话」这回事）。
 *
 * ## 所以那一行**不该补**
 *
 * 若在 A2UI 形态补「当前会话」那一行 ⇒ ⇒ 它显示的会话**不是**消息会落进去的那条
 * （A2UI 的消息根本不进 `chatProvider` 的会话）⇒ ⇒ **界面开始说谎** ⇒ ⇒
 * 正好是 ㋠ 条治的那个病（消息落错会话、界面却不说）。
 *
 * ## 判据（三条腿，缺一 ⇒ 判不了 ⇒ 退出码 2）
 *
 * ① **服务端**：`/a2a` 的处理函数里**没有**会话存储的使用（`ConversationStore` /
 *    `conversation_store` / `save_conversation` …）⇒ ⇒ 「不落会话」。
 * ② **客户端**：A2UI 视图**不引用**会话身份（`active-conversation` / `sessionId` /
 *    `deriveConversationTitle` …）⇒ ⇒ 「不说会话身份」。
 * ③ **两端一致**：①「不落」⇔ ②「不说」⇒ ⇒ 通过。
 *    ⚠️ **反了就是红** —— 哪天端脑给 `/a2a` 加上会话落盘，客户端就**必须**开始说
 *    会话身份（否则用户不知道消息落在哪条）⇒ ⇒ 这一刀必须能**双向**报红。
 *
 * ⚠️ **不许静默跳过**：服务端源码读不出来 ⇒ ⇒ **判不了** ⇒ 退出码 **2**（不许当绿）。
 *
 * ## 用法
 *
 *   node scripts/check-a2ui-session-identity.mjs
 *   node scripts/check-a2ui-session-identity.mjs --source C:\Projects\iBLOC\telencephalon
 *   node scripts/check-a2ui-session-identity.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 服务端：`POST /a2a` 的处理函数在哪个文件里（真相源在 telencephalon 仓）。 */
const SERVER_FILE = 'src/api/a2ui_gateway.rs';

/** 服务端「落会话」的样子 —— 出现**任何一个** ⇒ 它落会话。 */
const SERVER_SESSION_MARKERS = [
  'ConversationStore',
  'conversation_store',
  'save_conversation',
  'save_turn',
  'conversations.json',
];

/** 客户端：A2UI 视图里「说会话身份」的样子。 */
export const CLIENTS = [
  {
    label: '移动端 A2UI 形态',
    file: 'shadow-mobile/lib/widgets/chat/agent2ui_view.dart',
    markers: ['active-conversation', 'sessionId', 'deriveConversationTitle', 'activeConversationAgent'],
  },
  {
    label: '桌面端 A2UI 面板',
    file: 'shadow-desktop/src/components/chat/A2uiPanel.tsx',
    markers: ['active-conversation', 'sessionId', 'deriveConversationTitle', 'activeConversationAgent'],
  },
];

/** 客户端**发消息**的那条路 —— 必须**不**经过会话存储。 */
export const CLIENT_SEND_PATHS = [
  {
    label: '移动端 A2UI 发送',
    file: 'shadow-mobile/lib/widgets/chat/agent2ui_view.dart',
    // 会话存储的入口：出现**任何一个** ⇒ 它把消息写进了「某条会话」。
    sessionMarkers: ['chatProvider', 'createConversation', 'streamMessage'],
  },
];

/**
 * 服务端：`/a2a` 落不落会话？
 *
 * ⚠️ **只看处理函数那一段** —— 整个文件里可能别处提到「conversation」（注释、
 * 别的路由）⇒ 全文件扫会误判。
 * ⇒ 取 `async fn a2ui_message_stream` 到下一个顶层 `fn` 之前。
 */
export function serverPersistsSession(text) {
  const start = text.indexOf('async fn a2ui_message_stream');
  if (start < 0) return { known: false, reason: '读不到 a2ui_message_stream 这个处理函数' };
  const rest = text.slice(start + 'async fn a2ui_message_stream'.length);
  const nextFn = rest.search(/\n(?:pub )?(?:async )?fn /);
  const body = nextFn < 0 ? rest : rest.slice(0, nextFn);
  const hits = SERVER_SESSION_MARKERS.filter((m) => body.includes(m));
  return { known: true, persists: hits.length > 0, hits };
}

/** 客户端：说没说会话身份？ */
export function clientMentionsSession(text, markers) {
  const hits = markers.filter((m) => text.includes(m));
  return hits;
}

/** 客户端：发消息时有没有走会话存储？ */
export function clientSendsViaSession(text, sessionMarkers) {
  const hits = sessionMarkers.filter((m) => text.includes(m));
  return hits;
}

/** 判据本体：服务端落不落 ⇔ 客户端说不说。 */
export function evaluate(server, clients) {
  const problems = [];
  if (!server.known) {
    return [{ fatal: true, message: '服务端读不出来 ⇒ 判不了：' + server.reason }];
  }
  for (const c of clients) {
    const mentions = clientMentionsSession(c.text, c.markers);
    const viaSession = c.sendPathHits.length > 0;
    // ① 服务端落会话 ⇒ 客户端**必须**开始说（否则用户不知道消息落在哪条）。
    if (server.persists && mentions.length === 0) {
      problems.push({
        fatal: false,
        message: c.label + '：端脑的 /a2a 现在**落会话**了，但客户端**从不显示会话身份**'
          + ' ⇒ 用户不知道消息落在哪条 ⇒ 要么两端一起改，要么闸改成别的一致性。',
      });
    }
    // ② 服务端不落会话 ⇒ 客户端**不许**说（说了就是界面说谎）。
    if (!server.persists && mentions.length > 0) {
      problems.push({
        fatal: false,
        message: c.label + '：端脑的 /a2a **不落会话**，但客户端显示会话身份（'
          + mentions.join(', ') + '）⇒ ⇒ 那一行显示的会话**不是**消息会落进去的那条'
          + ' ⇒ ⇒ 界面说谎 ⇒ ⇒ 不许补。',
      });
    }
    // ③ 发送路径不许绕会话存储（那是「消息落错会话」的入口）。
    if (viaSession) {
      problems.push({
        fatal: false,
        message: c.label + '：发送路径**经过了会话存储**（'
          + c.sendPathHits.join(', ') + '）⇒ ⇒ A2UI 形态变成「记会话」的形态'
          + ' ⇒ ⇒ 那客户端就**必须**开始显示会话身份（否则界面与实际落点对不上）。',
      });
    }
  }
  return problems;
}

function parseArgs(argv) {
  const opts = { source: resolve(REPO, '..', 'telencephalon'), selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法: node scripts/check-a2ui-session-identity.mjs [--source <端脑>] [--self-test]');
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }
  return opts;
}

function selfTest() {
  let failed = 0;
  const check = (name, ok) => {
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  };
  console.log('判据自检：');

  // ⚠️ 夹具必须与真实输入**同形**（同形：函数体里真的用了会话存储）。
  const serverNoSession =
    'async fn a2ui_message_stream(\n    State(state): State<AppState>,\n) -> Result<Sse<impl Stream<Item = Result<Event, axum::Error>>>, (StatusCode, Json<Value>)> {\n'
    + '    let task_id = Uuid::new_v4().to_string();\n'
    + '    let context_id = Uuid::new_v4().to_string();\n'
    + '    let tasks = state.task_store.list_tasks(None).await;\n'
    + '}\n'
    + 'fn other_helper() { let x = 1; }\n';
  const serverWithSession =
    'async fn a2ui_message_stream(\n    State(state): State<AppState>,\n) {\n'
    + '    state.conversation_store.save_conversation(&conv).await;\n'
    + '}\n';

  const s1 = serverPersistsSession(serverNoSession);
  check('服务端不落会话 ⇒ 认得出来', s1.known === true && s1.persists === false);
  const s2 = serverPersistsSession(serverWithSession);
  check('服务端落会话 ⇒ 认得出来', s2.known === true && s2.persists === true);
  const s3 = serverPersistsSession('async fn something_else() {}');
  check('读不到处理函数 ⇒ 判不了（不是「不落」）', s3.known === false);

  // ⚠️ 同形：别处提到 conversation 不算数（只看处理函数那一段）。
  const serverMentionElsewhere =
    'async fn a2ui_message_stream(\n    State(state): State<AppState>,\n) {\n    let tasks = state.task_store.list_tasks(None).await;\n}\n'
    + 'fn other() { let c = ConversationStore::new(); }\n';
  check('处理函数**之外**提到会话存储 ⇒ 仍判「不落会话」',
    serverPersistsSession(serverMentionElsewhere).persists === false);

  const mkClient = (text, sendPathHits = []) => ({
    label: '假客户端',
    text,
    markers: CLIENTS[0].markers,
    sendPathHits,
  });

  const plain = mkClient('Widget build() { return Text(\"hello\"); }');
  const server = { known: true, persists: false };
  check('服务端不落 + 客户端不说 ⇒ 无问题', evaluate(server, [plain]).length === 0);

  const claims = mkClient('Padding(key: ValueKey(\'active-conversation\'))');
  const p1 = evaluate(server, [claims]);
  check('服务端不落 + 客户端说 ⇒ 红（界面说谎）', p1.length === 1);

  const serverPersists = { known: true, persists: true };
  const p2 = evaluate(serverPersists, [plain]);
  check('服务端落 + 客户端不说 ⇒ 红（用户不知道落在哪条）', p2.length === 1);

  const p3 = evaluate(server, [mkClient('service.sendMessage(text)', ['chatProvider'])]);
  check('发送路径经过会话存储 ⇒ 红', p3.length === 1);

  const fatal = evaluate({ known: false, reason: 'x' }, [plain]);
  check('服务端判不了 ⇒ 致命问题（退出码 2）', fatal.length === 1 && fatal[0].fatal === true);

  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

// ⚠️ **主流程只在「直接运行本文件」时执行** —— 本模块也被别的脚本
// （反向验证驱动）import 进来复用判据函数 ⇒ ⇒ 若在这里无条件跑并
// `process.exit`，会把 import 方**当场掐死**（实测踩到过）。
const isEntry = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (!isEntry) {
  // 被 import：只导出判据，不跑流程、不改退出码。
} else {
const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest();
} else {
  const serverPath = join(opts.source, SERVER_FILE);
  if (!existsSync(serverPath)) {
    console.error('服务端源码读不出来 ⇒ 判不了（不是「一致」）：' + serverPath);
    process.exit(2);
  }
  const server = serverPersistsSession(readFileSync(serverPath, 'utf8'));
  if (!server.known) {
    console.error('服务端判不了：' + server.reason);
    process.exit(2);
  }

  console.log('服务端 /a2a（真相源: ' + opts.source + '）：');
  console.log('  落会话？ ' + (server.persists ? '是（' + server.hits.join(', ') + '）' : '否（每次新 context_id，不碰会话存储）'));

  const clients = [];
  for (const c of CLIENTS) {
    const full = join(REPO, c.file);
    if (!existsSync(full)) {
      console.error('客户端文件不存在: ' + c.file);
      process.exit(2);
    }
    const text = readFileSync(full, 'utf8');
    const mentions = clientMentionsSession(text, c.markers);
    const send = CLIENT_SEND_PATHS.find((s) => s.file === c.file);
    const sendPathHits = send ? clientSendsViaSession(text, send.sessionMarkers) : [];
    clients.push({ label: c.label, text, markers: c.markers, sendPathHits });
    console.log('  ' + c.label + ' ⇒ 说会话身份？ '
      + (mentions.length === 0 ? '否' : '是（' + mentions.join(', ') + '）')
      + ' ｜ 发送经会话存储？ ' + (sendPathHits.length === 0 ? '否' : '是（' + sendPathHits.join(', ') + '）'));
  }

  const problems = evaluate(server, clients);
  const fatal = problems.find((p) => p.fatal);
  if (fatal) {
    console.error('判不了：' + fatal.message);
    process.exit(2);
  }
  if (problems.length === 0) {
    console.log('✔ A2UI 形态的「会话身份」两端一致（不落 ⇒ 不说）⇒ 那一行**不该补**，补了就是界面说谎。');
    process.exit(0);
  }
  console.log('❌ A2UI 形态的「会话身份」不一致：');
  for (const p of problems) console.log('  ' + p.message);
  process.exit(1);
}
}
