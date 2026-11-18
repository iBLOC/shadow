#!/usr/bin/env node
/**
 * 叶区直发闸 —— 「**简单一次 ⇒ 直连；长程/定时 ⇒ 前额叶**」这一刀的门面
 * ============================================================================
 *
 * ## 它钉什么
 *
 * 2026-11-18 这一刀把「叶区之间的 A2A 直发」落成三个真件：
 *
 *   · **出站身份**：前额叶出站的消息带 `metadata.skill` ＋ `metadata.user_id`
 *     ⇒ ⇒ LobeApp 叶区入口（4001 缺 skill / 4002 缺 user_id）不再把每笔
 *     委派打回 —— 否则「前额叶 → 任何叶区」从来没成功过（信封没对上的那一族）；
 *   · **定时任务可以指到叶区**：`ScheduledTask.target_peer`（＋ `skill` /
 *     `user_id`）⇒ runner 真发 A2A；`RepeatSpec::EverySeconds` ＋ 自适应
 *     节拍（有秒级任务时 runner 收紧到 1s）⇒ 监控类节拍有了落点；
 *   · **端脑直发 seam**：`dispatch_to_skill`（按 skill 找叶区 ＋ 两处改写
 *     ＋ 真发）—— 「数据类 ⇒ 顶叶」与「视觉一次性 ⇒ 枕叶」都是它上面的
 *     薄皮 ⇒ ⇒ 不许复制路由。
 *
 * ⚠️ 为什么要有闸：这条 seam 是**「简单一次直连」的裁决点** ⇒ ⇒ 它要是
 * 被改成分叉的复制路由、或者出站身份被悄悄摘掉 ⇒ ⇒ 编译照样过 ⇒ ⇒ 失败
 * 又会长得像成功（4001 静默回来说「对端坏了」）。
 *
 * ## 八条
 *
 *   L1 出站身份面：`_with` 家族 ＋ skill/user_id 上 metadata ＋ 4002 兜底
 *   L2 定时任务面：target_peer/skill/user_id ＋ EverySeconds ＋ 入库 ＋ 秒级判定
 *   L3 runner 面：秒级节拍 ＋ peer 分支 ＋ 真发 `delegate_to_peer_with`
 *   L4 创建时就说真话：永不触发的 spec 当场拒（不许「静默永不跑」）
 *   L5 端脑 seam：一个 `dispatch_to_skill` ＋ 两个薄皮（数据类/视觉）
 *   L6 **负控**：直发面里**不许写死叶区地址**（按注册表找，不许写死端口）
 *   L7 **负控**：「感知叶区不做主」契约**还在**（perception.rs 的那句）
 *   L8 **负控**：VisualQA 的「路由还没接上」告示牌**退场**（不许倒退回去）
 *
 * ## 用法
 *
 *   node scripts/check-lobe-dispatch.mjs              # 判
 *   node scripts/check-lobe-dispatch.mjs --self-test  # 判据自检（N/N）
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sibling } from './lib/sibling-repo.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 10;

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
function hits(src, needle) {
  if (!needle) return 0;
  return src.split(needle).length - 1;
}

/** 写死的叶区地址这一族 ⇒ ⇒ 直发面里一个都不许有（L6 负控词表）。 */
export const HARDCODED_PEERS = [
  'localhost:', '127.0.0.1:', ':9100', ':9300', ':9400', ':18083',
];

/**
 * 去掉注释（行注释 ＋ 块注释）⇒ ⇒ 负控只判**代码**。
 *
 * ⚠️⚠️ **行注释的起点不能是 URL 协议头里的 `//`**（自检逮出来的：头一版
 * 用裸 `indexOf('//')` ⇒ ⇒ `"http://localhost:9300"` 里的 `//` 被当成
 * 注释起点 ⇒ ⇒ **整行后半被切掉** ⇒ ⇒ L6 要抓的「写死地址」恰好长在
 * 那个位置 ⇒ ⇒ 尺子在它最该抓的那一行上失明）⇒ ⇒ 找 `//` 时跳过
 * 前一个字符是 `:` 的那一处。
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(NL)
    .map((line) => {
      let idx = -1;
      for (let i = 0; i + 1 < line.length; i++) {
        if (line[i] === '/' && line[i + 1] === '/' && line[i - 1] !== ':') {
          idx = i;
          break;
        }
      }
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join(NL);
}

/** 所有判据都要出现的词元（一条判据 = 一组必须都在的词元）。 */
function requireAll(src, tokens) {
  return tokens.filter((t) => hits(src, t) === 0);
}

/**
 * 纯函数：各源文件的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const pfOutbound = sources.pfOutbound || '';
  const pfSchedule = sources.pfSchedule || '';
  const pfRunner = sources.pfRunner || '';
  const pfSchedHandler = sources.pfSchedHandler || '';
  const telLobes = sources.telLobes || '';
  const telPerception = sources.telPerception || '';
  const telSnapshotFace = sources.telSnapshotFace || '';
  const telState = sources.telState || '';
  const telApiMod = sources.telApiMod || '';
  const telDoorPolicy = sources.telDoorPolicy || '';
  const telA2AClient = sources.telA2AClient || '';
  const occipitalMain = sources.occipitalMain || '';

  // L1 —— 出站身份面（skill / user_id 真的上线）
  {
    const missing = requireAll(pfOutbound, [
      'pub async fn delegate_to_peer_with(',
      'pub async fn fire_and_forget_with(',
      'fn make_user_message_with(',
      '"skill".to_string()',
      '"user_id".to_string()',
      'Some("prefrontal".to_string())',
    ]);
    if (missing.length > 0) {
      add('L1', 'prefrontal/src/a2a_outbound.rs',
        '出站身份面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 委派不带 skill/user_id ⇒ LobeApp 叶区一律 4001/4002（委派从来没成功过那一族）');
    }
  }

  // L2 —— 定时任务面（能指到叶区 ＋ 有秒级档）
  {
    const missing = requireAll(pfSchedule, [
      'pub target_peer: Option<String>',
      'pub skill: Option<String>',
      'pub user_id: Option<String>',
      'EverySeconds { n: u32 },',
      'pub fn create_with_routing(',
      'pub fn has_seconds_cadence(&self) -> bool',
    ]);
    if (missing.length > 0) {
      add('L2', 'prefrontal/src/schedule.rs',
        '定时任务面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 定时任务只喂自己（打不到叶区）或没有秒级档（监控节拍落不了地）');
    }
  }

  // L3 —— runner 面（真分支 ＋ 真发 ＋ 自适应节拍）
  {
    const missing = requireAll(pfRunner, [
      'pub const SECONDS_TICK',
      'has_seconds_cadence()',
      'async fn dispatch_to_peer(',
      'delegate_to_peer_with(',
      'if let Some(peer_id) = claimed.target_peer.clone()',
    ]);
    if (missing.length > 0) {
      add('L3', 'prefrontal/src/server/schedule_runner.rs',
        'runner 的 peer 分支不在了（缺：' + missing.join('、') + '）⇒ ⇒ 定时任务永远到不了叶区，或节拍锁死在分钟档');
    }
  }

  // L4 —— 创建时就说真话（永不触发的 spec 当场拒）
  {
    const missing = requireAll(pfSchedHandler, [
      'pub target_peer: Option<String>',
      'create_with_routing(',
      'next_run_after(chrono::Utc::now()).is_none()',
    ]);
    if (missing.length > 0) {
      add('L4', 'prefrontal/src/server/schedule_handler.rs',
        '创建时校验不在了（缺：' + missing.join('、') + '）⇒ ⇒ 永不触发的 spec 会静默永不跑（失败长得像成功那一族）');
    }
  }

  // L5 —— 端脑 seam（一条 seam ＋ 两个薄皮，不许复制路由）
  {
    const missing = requireAll(telLobes, [
      'async fn dispatch_to_skill(',
      'pub const VISUAL_SKILL: &str = "face_recognition";',
      'dispatch_to_skill(DATA_TASK_SKILL',
      'dispatch_to_skill(VISUAL_SKILL',
    ]);
    if (missing.length > 0) {
      add('L5', 'telencephalon/src/lobes/mod.rs',
        '直发 seam 不在了（缺：' + missing.join('、') + '）⇒ ⇒ 直发路由分叉成复制份 ⇒ 挪一处漂一处');
    }
  }

  // L6 —— 负控：直发面里不许写死叶区地址（按注册表找）
  {
    // ⚠️ **逐文件**切 `#[cfg(test)]` ＋ 去注释 ⇒ ⇒ 谁也不牵连谁。
    const implFaces = [
      { name: 'prefrontal/src/a2a_outbound.rs', src: pfOutbound },
      { name: 'prefrontal/src/server/schedule_runner.rs', src: pfRunner },
    ];    for (const { name, src } of implFaces) {
      const implementation = stripComments(src.split('#[cfg(test)]')[0]);
      const leaked = HARDCODED_PEERS.filter((t) => hits(implementation, t) > 0);
      if (leaked.length > 0) {
        add('L6', name,
          '直发面里写死了叶区地址（' + leaked.join('、') + '）⇒ ⇒ 注册表那一格成了摆设（单机碰巧通、跨机永远不通那一族）');
      }
    }
  }

  // L7 —— 负控：「感知叶区不做主」契约还在（这刀只加直发，不许拆契约）
  {
    const missing = requireAll(telPerception, ['sensing lobes never act']);
    if (missing.length > 0) {
      add('L7', 'telencephalon/src/lobes/perception.rs',
        '「sensing lobes never act」契约不在了 ⇒ ⇒ 感知叶区开始自己做主 ⇒ 监控链绕过去重/送达纪律');
    }
  }

  // L8 —— 负控：VisualQA 的告示牌退场（路由真接了，不许倒退回去）
  {
    const signboard = stripComments(telLobes);
    if (hits(signboard, '这一档的路由**还没接上**') > 0) {
      add('L8', 'telencephalon/src/lobes/mod.rs',
        '「路由还没接上」的告示牌又回来了 ⇒ ⇒ VisualQA 的真路由被倒退掉（告示牌长回来＝路由没了）');
    }
  }

  // L9 —— 帧生产端面（宿主能推帧进来：路由 ＋ 快照槽 ＋ 门开口）
  {
    const missing = requireAll(telSnapshotFace, [
      'pub struct VisualSnapshotFrame',
      'pub fn router(state: AppState) -> Router',
      '"/api/telencephalon/visual-qa/snapshot"',
      'verify_admin_token(',
      'camera_id',
      'data_b64',
    ]);
    if (missing.length > 0) {
      add('L9', 'telencephalon/src/api/visual_snapshot.rs',
        '帧生产端面不在了（缺：' + missing.join('、') + '）⇒ ⇒ 宿主没有地方推帧 ⇒ ⇒ 「摄像头现在看到了什么」永远没有帧可问');
    }
    const missingSlot = requireAll(telState, ['pub visual_snapshot:']);
    if (missingSlot.length > 0) {
      add('L9', 'telencephalon/src/state.rs',
        '快照槽不在了（缺：' + missingSlot.join('、') + '）⇒ ⇒ 推进来的帧没有地方放');
    }
    const missingWiring = requireAll(telApiMod, [
      'pub mod visual_snapshot;',
      'visual_snapshot::router(state.clone())',
    ]);
    if (missingWiring.length > 0) {
      add('L9', 'telencephalon/src/api/mod.rs',
        '帧面没装进路由（缺：' + missingWiring.join('、') + '）⇒ ⇒ 路由存在但没人挂它 ⇒ ⇒ 注册成功、请求 404（失败长得像成功那一族）');
    }
    const missingDoor = requireAll(telDoorPolicy, [
      '/api/telencephalon/visual-qa/snapshot',
    ]);
    if (missingDoor.length > 0) {
      add('L9', 'telencephalon/src/api/door_policy.txt',
        '帧面没有门开口 ⇒ ⇒ 未匹配到门型的路径**压根不进中间件** ⇒ ⇒ 门形漂移');
    }
  }

  // L10 —— 帧的线上契约（Data part 上线 ＋ 枕叶从 parts 解）
  {
    // ❶ 端脑客户端：Data part 必须**上线**（以前落到 `_ => None` 被丢掉）。
    //
    // ⚠️⚠️ **为什么不能只判词元「Data part 那几行在不在」**（自检逮到的
    //    「尺子自己钝了」）：变异把 Data 臂改成 `=> None`、后面再补一段
    //    **同名的** Data 臂 ⇒ ⇒ 裸词**照样命中** ⇒ ⇒ 尺子看不见「Data
    //    被吃掉了」⇒ ⇒ **判据要判行为**：**Data 臂后面跟的必须是
    //    `Some(`** ⇒ ⇒ 那样「改成 None」就当场被抓。
    const clientImpl = stripComments(telA2AClient.split('#[cfg(test)]')[0]);
    // ⚠️ **逐臂判 ＋ 臂的边界要准**（自检两次逮到的）：
    //    ❶ Data 臂若有**两处**（变异会补一处的）⇒ ⇒ 只看第一处 ⇒ ⇒ 放过；
    //    ❷ 臂**不能**用固定窗口切（窗口会把**下一处**臂也吞进来 ⇒ ⇒
    //       改坏的那处反而从下一处读到 `Some(`）⇒ ⇒ 臂的边界＝**到下一个
    //       `MessagePart::` 为止**（上限 300 防跑飞）。
    const dataArms = [];
    {
      const MARK = 'MessagePart::Data { data }';
      let idx = clientImpl.indexOf(MARK);
      while (idx >= 0) {
        const next = clientImpl.indexOf('MessagePart::', idx + MARK.length);
        const end = next >= 0 ? Math.min(next, idx + 300) : Math.min(clientImpl.length, idx + 300);
        dataArms.push(clientImpl.slice(idx, end));
        idx = clientImpl.indexOf(MARK, idx + 1);
      }
    }
    const dataArmOk = dataArms.length > 0
      && dataArms.every((arm) => arm.includes('=> Some(serde_json::json!({'));
    if (!dataArmOk) {
      add('L10', 'telencephalon/src/a2a/client.rs',
        'Data part 没有真的上线（有一处臂不是 `=> Some(...)`）⇒ ⇒ 帧到不了枕叶 ⇒ ⇒ 而界面一切正常（枕叶回「bad frame payload」，看着像对面坏了）');
    }
    // ❷ **负控**：part 映射那一段不许留通配臂（`_ => None`）——
    //    那会把新变体悄悄吃掉。
    //
    // ⚠️⚠️ **口径要窄**（真判当场红逮到的）：整个文件里**还有另一处**
    //    `_ => None`（把 parts 拼成**文本**那一步：File 只取 uri、Data
    //    不参与文本拼接）⇒ ⇒ 那处是**合法且必要**的 ⇒ ⇒ 判整个文件
    //    ⇒ ⇒ 尺子会误伤 ⇒ ⇒ 只判 **Data 臂之后紧跟的那一臂**：通配臂
    //    紧跟在 Data 后面 ⇒ ⇒ 它**吃的就是** Data ⇒ ⇒ 那是漏子。
    const afterData = dataArms.length > 0 ? dataArms[0] : '';    if (hits(afterData, '_ => None') > 0) {
      add('L10', 'telencephalon/src/a2a/client.rs',
        'part 映射里 Data 臂后面跟着通配臂 `_ => None` ⇒ ⇒ 新变体（Data）会被悄悄吃掉 ⇒ ⇒ 帧永远到不了枕叶（通配臂＝协议漏子的形状）');
    }
    // ❸ 枕叶：必须能从 parts 里解出帧（老形状不许破）。
    const missingParts = requireAll(occipitalMain, [
      'fn frame_from_context(',
      'extra.get("parts")',
      'eq_ignore_ascii_case("data")',
    ]);
    if (missingParts.length > 0) {
      add('L10', 'occipital/src/main.rs',
        '枕叶不会从 parts 里解帧（缺：' + missingParts.join('、') + '）⇒ ⇒ 端脑真发来的那种形状解不出来 ⇒ ⇒ 枕叶永远报「bad frame payload」');
    }
  }

  return findings;
}

/**
 * 跨仓判据源 —— **每个文件一个 key**（不是「一个仓一个 key」）。
 *
 * ⚠️ 为什么（本体闸真撞出来的）：负控要判**每个文件各自的实现段** ⇒ ⇒
 * `#[cfg(test)]` 的位置因文件而异 ⇒ ⇒ 拼成一个串再切 ⇒ ⇒ 尺子钝了。
 */
const SOURCE_FILES = {
  pfOutbound: { repo: 'prefrontal', files: ['src/a2a_outbound.rs'] },
  pfSchedule: { repo: 'prefrontal', files: ['src/schedule.rs'] },
  pfRunner: { repo: 'prefrontal', files: ['src/server/schedule_runner.rs'] },
  pfSchedHandler: { repo: 'prefrontal', files: ['src/server/schedule_handler.rs'] },
  telLobes: { repo: 'telencephalon', files: ['src/lobes/mod.rs'] },
  telPerception: { repo: 'telencephalon', files: ['src/lobes/perception.rs'] },
  telSnapshotFace: { repo: 'telencephalon', files: ['src/api/visual_snapshot.rs'] },
  telState: { repo: 'telencephalon', files: ['src/state.rs'] },
  telApiMod: { repo: 'telencephalon', files: ['src/api/mod.rs'] },
  telDoorPolicy: { repo: 'telencephalon', files: ['src/api/door_policy.txt'] },
  telA2AClient: { repo: 'telencephalon', files: ['src/a2a/client.rs'] },
  occipitalMain: { repo: 'occipital', files: ['src/main.rs'] },
};

function readSources() {
  const sources = {};
  const missing = [];
  for (const [key, spec] of Object.entries(SOURCE_FILES)) {
    // ⚠️ `sibling()` 返回**路径字符串**（布局 A 仓外优先，B 仓内兜底），
    //    找不到时是 null ⇒ ⇒ 这里不猜，落到 B 布局的路径上让 missing
    //    把话说完（退出码 2，不是 crash）。
    const base = sibling(REPO_ROOT, spec.repo) || join(REPO_ROOT, spec.repo);
    for (const rel of spec.files) {
      const path = join(base, rel);
      if (!existsSync(path)) {
        missing.push(spec.repo + '/' + rel);
        continue;
      }
      // ⚠️ **原样读**（不切）⇒ ⇒ 切的动作放在 evaluate 里**逐文件**做
      //    ⇒ ⇒ 因为 `#[cfg(test)]` 的位置因文件而异。
      sources[key] = readFileSync(path, 'utf8');
    }
  }
  return { sources, missing };
}

/** 自检：合成夹具 ⇒ ⇒ 每一格都有自己的形状 ⇒ ⇒ 自检不会恒绿。 */
function selfTest() {
  const good = {
    pfOutbound: [
      'pub async fn delegate_to_peer(',
      'pub async fn delegate_to_peer_with(',
      'pub async fn fire_and_forget_with(',
      'fn make_user_message_with(text: &str, skill: Option<&str>, user_id: Option<&str>) -> Message {',
      '        (Some(_), None) => Some("prefrontal".to_string()),',
      '            map.insert("skill".to_string(), serde_json::Value::String(s.to_string()));',
      '            map.insert("user_id".to_string(), serde_json::Value::String(u));',
      '#[cfg(test)]',
      'const 测试里可以写死地址_localhost_9300: u8 = 0;',
    ].join(NL),
    pfSchedule: [
      'pub struct ScheduledTask {',
      '    pub target_peer: Option<String>,',
      '    pub skill: Option<String>,',
      '    pub user_id: Option<String>,',
      '}',
      '    EverySeconds { n: u32 },',
      '    pub fn create_with_routing(',
      '    pub fn has_seconds_cadence(&self) -> bool {',
      '#[cfg(test)]',
      'const 测试段_不受负控: u8 = 0;',
    ].join(NL),
    pfRunner: [
      'pub const TICK: Duration = Duration::from_secs(30);',
      'pub const SECONDS_TICK: Duration = Duration::from_secs(1);',
      '            let tick = if state.schedule_store.has_seconds_cadence() {',
      '    if let Some(peer_id) = claimed.target_peer.clone() {',
      '    async fn dispatch_to_peer(',
      '        .delegate_to_peer_with(',
    ].join(NL),
    pfSchedHandler: [
      'pub struct CreateScheduleRequest {',
      '    pub target_peer: Option<String>,',
      '}',
      '    if payload.spec.next_run_after(chrono::Utc::now()).is_none() {',
      '    state.schedule_store.create_with_routing(',
    ].join(NL),
    telLobes: [
      'pub const DATA_TASK_SKILL: &str = "ingest_spreadsheet";',
      'pub const VISUAL_SKILL: &str = "face_recognition";',
      'async fn dispatch_to_skill(',
      '    let reply = dispatch_to_skill(DATA_TASK_SKILL, message, app_state).await?;',
      '                match dispatch_to_skill(VISUAL_SKILL, &qa_message, app_state).await {',
    ].join(NL),
    telPerception: [
      '//! Per the v3 architecture decision: **sensing lobes never act**.',
    ].join(NL),
    telSnapshotFace: [
      'pub struct VisualSnapshotFrame {',
      '    pub camera_id: String,',
      '    pub data_b64: String,',
      '}',
      'pub fn router(state: AppState) -> Router {',
      '        .route("/api/telencephalon/visual-qa/snapshot", post(push_snapshot))',
      '    if verify_admin_token(&headers, &expected).is_err() {',
    ].join(NL),
    telState: [
      '    pub visual_snapshot: StdArc<std::sync::Mutex<Option<VisualSnapshotFrame>>>,',
    ].join(NL),
    telApiMod: [
      'pub mod visual_snapshot;',
      '        .merge(visual_snapshot::router(state.clone()))',
    ].join(NL),
    telDoorPolicy: [
      '/api/telencephalon/visual-qa/snapshot          *      admin',
    ].join(NL),
    telA2AClient: [
      '                MessagePart::Data { data } => Some(serde_json::json!({',
      '                    "type": "Data",',
      '                    "data": data,',
      '                })),',
    ].join(NL),
    occipitalMain: [
      'fn frame_from_context(extra: &serde_json::Value) -> Option<Frame> {',
      '    let parts = extra.get("parts")?.as_array()?;',
      '        if !kind.eq_ignore_ascii_case("data") {',
    ].join(NL),
  };

  // ⚠️ 每条变异**显式写它要撞哪条判据**（`rule`）⇒ ⇒ 判据名与变异名**解耦**。
  const mutations = [
    { rule: 'L1', label: 'L1（出站身份面缺了）', mutate: (s) => { s.pfOutbound = s.pfOutbound.replace('pub async fn delegate_to_peer_with(', 'pub async fn delegatePeerWith('); } },
    { rule: 'L1', label: 'L1（4002 兜底没了）', mutate: (s) => { s.pfOutbound = s.pfOutbound.replace('Some("prefrontal".to_string())', 'None'); } },
    { rule: 'L2', label: 'L2（秒级档没了）', mutate: (s) => { s.pfSchedule = s.pfSchedule.replace('EverySeconds { n: u32 },', 'EverySec { n: u32 },'); } },
    { rule: 'L2', label: 'L2（target_peer 没了）', mutate: (s) => { s.pfSchedule = s.pfSchedule.replace('pub target_peer: Option<String>,', ''); } },
    { rule: 'L3', label: 'L3（peer 分支没了）', mutate: (s) => { s.pfRunner = s.pfRunner.replace('async fn dispatch_to_peer(', 'async fn run_peer_job('); } },
    { rule: 'L3', label: 'L3（自适应节拍没了）', mutate: (s) => { s.pfRunner = s.pfRunner.replace('has_seconds_cadence()', 'always_false()'); } },
    { rule: 'L4', label: 'L4（创建时校验没了）', mutate: (s) => { s.pfSchedHandler = s.pfSchedHandler.replace('next_run_after(chrono::Utc::now()).is_none()', 'next_run_after(chrono::Utc::now()).is_some()'); } },
    { rule: 'L5', label: 'L5（seam 没了）', mutate: (s) => { s.telLobes = s.telLobes.replace('async fn dispatch_to_skill(', 'async fn dispatch_to_somewhere('); } },
    { rule: 'L5', label: 'L5（视觉薄皮没了）', mutate: (s) => { s.telLobes = s.telLobes.replace('dispatch_to_skill(VISUAL_SKILL', 'dispatch_to_skill(OTHER_SKILL'); } },
    { rule: 'L6', label: 'L6（地址写死进了直发面）', mutate: (s) => { s.pfRunner = 'let peer_url = "http://localhost:9300/a2a/tasks/send";' + NL + s.pfRunner; } },
    { rule: 'L7', label: 'L7（感知契约被拆）', mutate: (s) => { s.telPerception = s.telPerception.replace('sensing lobes never act', 'sensing lobes may act'); } },
    { rule: 'L8', label: 'L8（告示牌倒退回来）', mutate: (s) => { s.telLobes = s.telLobes.replace('async fn dispatch_to_skill(', 'text: "这一档的路由**还没接上**".to_string(),' + NL + 'async fn dispatch_to_skill('); } },
    { rule: 'L9', label: 'L9（帧面没装进路由）', mutate: (s) => { s.telApiMod = s.telApiMod.replace('visual_snapshot::router(state.clone())', 'visual_snapshot::router_unused(state.clone())'); } },
    { rule: 'L9', label: 'L9（帧面没有门开口）', mutate: (s) => { s.telDoorPolicy = s.telDoorPolicy.replace('/api/telencephalon/visual-qa/snapshot          *      admin', '/api/telencephalon/visual-qa/other                 *      admin'); } },
    { rule: 'L9', label: 'L9（快照槽没了）', mutate: (s) => { s.telState = s.telState.replace('pub visual_snapshot:', 'pub snapshot_slot:'); } },
    { rule: 'L10', label: 'L10（Data part 没上线）', mutate: (s) => { s.telA2AClient = s.telA2AClient.replace('MessagePart::Data { data } => Some(serde_json::json!({', 'MessagePart::Data { data } => None,' + NL + '                #[allow(unreachable_patterns)] MessagePart::Data { data } => Some(serde_json::json!({'); } },
    { rule: 'L10', label: 'L10（通配臂把 Data 吃掉）', mutate: (s) => { s.telA2AClient = s.telA2AClient.replace('                    "data": data,', '                    "data": data,' + NL + '                })),' + NL + '                _ => None,' + NL + '                #[allow(unreachable_patterns)] MessagePart::Data { data } => Some(serde_json::json!({'); } },
    { rule: 'L10', label: 'L10（枕叶不会解 parts）', mutate: (s) => { s.occipitalMain = s.occipitalMain.replace('extra.get("parts")', 'extra.get("partz")'); } },
  ];

  let total = 0;
  let failed = 0;
  const check = (name, cond) => {
    total += 1;
    if (!cond) failed += 1;
    console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name);
  };

  check('合规夹具零告警', evaluate(good).length === 0);

  for (const { rule, label, mutate } of mutations) {
    const broken = JSON.parse(JSON.stringify(good));
    mutate(broken);
    const findings = evaluate(broken);
    const rules = Array.from(new Set(findings.map((f) => f.rule)));
    check(
      '变异 ' + label + ' 恰好被它自己逮到（且不牵连别条）',
      rules.length === 1 && rules[0] === rule
    );
  }

  console.log('判据自检：' + (total - failed) + '/' + total);
  if (failed > 0) {
    console.error('❌ 自检失败：' + failed + ' 条');
    process.exit(1);
  }
  console.log('✅ 自检通过');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  const { sources, missing } = readSources();
  if (missing.length > 0) {
    console.error('❌ 判不了：兄弟仓的判据源没读全 ⇒ ⇒ 缺失：');
    for (const m of missing) console.error('   - ' + m);
    console.error('（这不是「没问题」，是「没判」）');
    process.exit(2);
  }
  const findings = evaluate(sources);
  if (findings.length > 0) {
    console.error('❌ 叶区直发闸红：' + findings.length + ' 条');
    for (const f of findings) {
      console.error('  [' + f.rule + '] ' + f.file);
      console.error('      ' + f.detail);
    }
    process.exit(1);
  }
  console.log('✅ 叶区直发闸绿：' + RULE_COUNT + '/' + RULE_COUNT + ' 条判据');
}

main();
