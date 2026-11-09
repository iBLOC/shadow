// ⚠️ **这个文件是 mock 上游的「大脑」** —— 它决定 mock 怎么回话。
//
// ## 为什么它存在（2026-11-09 真机实测 + CI 产物取证）
//
// CI 上「Playwright E2E」那一步**从来没跑绿过** ⇒ ⇒ 本机复现拿到第一因：
// 端脑的**意图分类**调用要求大脑回**一个 JSON 对象**
// （`telencephalon/src/lobes/intent.rs` 的 `parse_intent_json`），
// 而 mock 上游**固定回一句散文** ⇒ ⇒ 端脑报
// `the brain did not return intent JSON` ⇒ ⇒ 502 ⇒ ⇒ 对话历史恒 0
// ⇒ ⇒ `business-flow-ui.spec.ts` 的「多轮对话验证 history 累积」
// 与「验证 prefrontal dispatch 响应」两条**同一个第一因**、一起红。
//
// ⇒ ⇒ 所以 mock 必须**按语义分诊**：
// **意图分类**那次调用 ⇒ 回 JSON；**其它**调用（叶区自己回答）⇒ 回散文。
//
// ⚠️ **按语义，不按版式**：判据是「system 提示词是不是意图分类器那份」
// ⇒ ⇒ 不是「第几次调用」「body 有几个字段」这种会随实现漂的东西。

// 端脑意图分类器 system 提示词里的稳定标记。
//
// ⚠️ 它来自端脑自己的常量 `INTENT_SYSTEM_PROMPT`（`lobes/intent.rs`）
// ⇒ ⇒ 端脑改了这句话，mock 的分诊就会失效 ⇒ ⇒ **那时这条判据会红**
// ⇒ ⇒ 而不是**悄悄变成散文**。
export const INTENT_MARKER = '意图分类器';

// 契约里的意图白名单（`telencephalon/src/lobes/intent.rs` 的 `parse_intent_json`）。
export const INTENT_KINDS = [
  'chat',
  'task_create',
  'task_confirm',
  'task_query',
  'task_update',
  'memory_query',
  'agent_query',
  'visual_qa',
  'visual_task',
];

// 任务类的话 ⇒ 判成 `task_create`（真 LLM 也会这么判）。
const TASK_CUES = /任务|建个|创建|帮我建|安排一下|预约|提醒我/;

// 这次调用是不是**意图分类**？
//
// ⚠️ 只看 **system** 消息 ⇒ ⇒ 用户话里出现「意图分类器」四个字也不会误判
// ⇒ ⇒ 也**不会**因为对话上下文里恰好有那四个字而误判。
export function isIntentClassificationCall(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some(
    (m) => m && m.role === 'system' && String(m.content || '').includes(INTENT_MARKER),
  );
}

// 取**用户这一句**（意图分类提示词里的 `[用户这一句]` 槽）。
//
// ⚠️ 只取这一段 ⇒ ⇒ 不取 `[对话上下文]` 那一段 ⇒ ⇒ 「上一轮建过任务」
// 不会把这一轮的「second」误判成要建任务。
export function extractUserUtterance(messages) {
  if (!Array.isArray(messages)) return '';
  const users = messages
    .filter((m) => m && m.role === 'user')
    .map((m) => String(m.content || ''));
  const raw = users.length ? users[users.length - 1] : '';
  const marker = '[用户这一句]';
  const at = raw.indexOf(marker);
  const after = at >= 0 ? raw.slice(at + marker.length) : raw;
  return after.split('\n\n[对话上下文]')[0].trim();
}

// 把一句话判成端脑契约里的意图。
//
// ⚠️ **只判「要不要建任务」这一件事** ⇒ ⇒ 其余一律 `chat`
// ⇒ ⇒ 理由：mock 的职责是**让端脑的契约被走通**，不是**模拟一个聪明的大脑**
// ⇒ ⇒ 判得越多，mock 与真模型的差距越大 ⇒ ⇒ 越容易「绿得像假绿」。
export function classifyIntent(text) {
  const t = String(text || '');
  if (TASK_CUES.test(t)) {
    return { intent: 'task_create', title: t.slice(0, 60) };
  }
  return { intent: 'chat' };
}

// 一次调用 ⇒ mock 该回什么内容。
//
// ⚠️ 意图分类 ⇒ **JSON**（端脑要解析它）；其它 ⇒ **散文**（叶区要读它）。
export function buildMockReply(messages, reply) {
  if (isIntentClassificationCall(messages)) {
    return JSON.stringify(classifyIntent(extractUserUtterance(messages)));
  }
  return reply;
}
