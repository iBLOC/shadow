/**
 * ⚠️ **mock 上游必须会「按语义分诊」**（2026-11-09 真机实测 + CI 产物取证）。
 *
 * ## 这条判据盯的是什么
 *
 * CI 上「Playwright E2E」那一步**从来没跑绿过** ⇒ ⇒ 本机复现拿到第一因：
 * 端脑的**意图分类**调用要大脑回**一个 JSON 对象**
 * （`telencephalon/src/lobes/intent.rs` 的 `parse_intent_json`），
 * 而 mock 上游**固定回一句散文** ⇒ ⇒ 端脑报
 * `the brain did not return intent JSON` ⇒ ⇒ 502 ⇒ ⇒ 对话历史恒 0
 * ⇒ ⇒ `business-flow-ui.spec.ts` 的「多轮对话验证 history 累积」与
 * 「验证 prefrontal dispatch 响应」两条**同一个第一因**、一起红。
 *
 * ⇒ ⇒ 所以 mock 必须：
 * - **意图分类**那次调用 ⇒ 回 JSON（端脑要解析它）；
 * - **其它**调用（叶区自己回答）⇒ 回散文（叶区要读它）。
 *
 * ## 为什么是「真运行级」
 *
 * 这条判据**起真的 mock server**（真进程）、**真发 HTTP**（真 socket）、
 * **真读响应体** ⇒ ⇒ 它盯的是**产物**（`mock-llm-server.mjs`）而不是
 * 某个内部函数 ⇒ ⇒ 产物被改坏 ⇒ ⇒ 这里就红。
 *
 * ⚠️ **端脑的意图白名单在这里独立写一遍**（不从 mock 里 import）
 * ⇒ ⇒ 免得「mock 自己说自己的话对」⇒ ⇒ 白名单写错 ⇒ ⇒ 两边一起错 ⇒ ⇒ 判据绿。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '../e2e-ui/mock-llm-server.mjs');

const REPLY = '任务已创建（mock）：hello 你好';

/** 端脑意图分类器那份 system 提示词的**形状**（只需含稳定标记）。 */
const INTENT_SYSTEM = '你是一个意图分类器。只输出**一个 JSON 对象**，不要任何解释。';
/** 叶区自己回答时那份 system 提示词（**不含**那个标记）。 */
const LOBE_SYSTEM = 'You are the temporal lobe of Shadow, a personal AI assistant. Reply concisely.';

/** 端脑契约里的意图白名单 —— 独立写一遍，不从 mock 里 import。 */
const INTENT_KINDS = [
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

/** 端脑意图分类提示词里的 `[用户这一句]` 槽。 */
function intentPrompt(utterance: string): string {
  return `请把下面这句话分类成意图。\n\n[用户这一句]\n${utterance}`;
}

describe('mock 上游的分诊：意图分类 ⇒ JSON，其余 ⇒ 散文', () => {
  let child: ChildProcess | undefined;
  let base = '';
  const portFile = join(tmpdir(), `shadow-mock-port-${process.pid}.txt`);
  const logFile = join(tmpdir(), `shadow-mock-log-${process.pid}.txt`);
  const outFile = join(tmpdir(), `shadow-mock-out-${process.pid}.txt`);

  beforeAll(async () => {
    rmSync(portFile, { force: true });
    rmSync(logFile, { force: true });
    rmSync(outFile, { force: true });
    // ⚠️ **子进程的输出必须落盘** ⇒ ⇒ 它崩了（import 错、语法错…）时，
    //    **错误就在这里** ⇒ ⇒ 否则「没起来」就是一句没头没尾的话。
    const outFd = openSync(outFile, 'a');
    child = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        // ⚠️ **端口 0** ⇒ ⇒ 临时端口 ⇒ ⇒ 不跟谁抢 ⇒ ⇒ 也不会「测不出来」。
        MOCK_PORT: '0',
        MOCK_PORT_FILE: portFile,
        MOCK_LOG_PATH: logFile,
        MOCK_MODEL_ID: 'test-model-ui',
        MOCK_REPLY: REPLY,
      },
      stdio: ['ignore', outFd, outFd],
    });
    closeSync(outFd);
    const deadline = Date.now() + 15_000;
    while (!existsSync(portFile) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!existsSync(portFile)) {
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '(没有日志)';
      const out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '(没有输出)';
      throw new Error(`mock 上游没起来（端口文件没出现）。
── 日志 ──
${log}
── 子进程输出 ──
${out}`);
    }
    base = `http://127.0.0.1:${readFileSync(portFile, 'utf8').trim()}`;
  }, 30_000);

  afterAll(() => {
    try {
      child?.kill();
    } catch {
      /* 已经退了也不挡路 */
    }
    rmSync(portFile, { force: true });
    rmSync(logFile, { force: true });
    rmSync(outFile, { force: true });
  });

  /** 真发一次 OpenAI 形状的请求，拿回 assistant 的内容。 */
  function ask(system: string, user: string): Promise<string> {
    const payload = JSON.stringify({
      model: 'test-model-ui',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
    });
    return new Promise((resolvePromise, rejectPromise) => {
      const req = httpRequest(
        `${base}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolvePromise(String(parsed?.choices?.[0]?.message?.content ?? ''));
            } catch (e) {
              rejectPromise(new Error(`响应不是 JSON（status ${res.statusCode}）：${body}`));
            }
          });
        },
      );
      req.on('error', rejectPromise);
      req.end(payload);
    });
  }

  it('意图分类那次调用 ⇒ 回一个 JSON 对象，且意图在契约白名单里', async () => {
    const content = await ask(INTENT_SYSTEM, intentPrompt('帮我创建任务下午三点我要和客户开会'));
    let parsed: any;
    expect(() => {
      parsed = JSON.parse(content);
    }, `意图分类必须回 JSON，收到的是：${content}`).not.toThrow();
    expect(INTENT_KINDS).toContain(parsed.intent);
  });

  it('任务类的话 ⇒ task_create，且带上端脑的必填字段 title', async () => {
    const content = await ask(INTENT_SYSTEM, intentPrompt('帮我创建任务下午三点我要和客户开会'));
    const parsed = JSON.parse(content);
    expect(parsed.intent).toBe('task_create');
    expect(String(parsed.title ?? '').length).toBeGreaterThan(0);
  });

  it('闲聊 ⇒ chat（不必给别的字段）', async () => {
    const content = await ask(INTENT_SYSTEM, intentPrompt('second'));
    const parsed = JSON.parse(content);
    expect(parsed.intent).toBe('chat');
  });

  it('孪生负控：叶区自己回答那次调用 ⇒ 回散文（不是 JSON）', async () => {
    const content = await ask(LOBE_SYSTEM, '帮我创建任务下午三点我要和客户开会');
    expect(content).toBe(REPLY);
    expect(() => JSON.parse(content)).toThrow();
  });

  it('孪生负控：用户话里带「意图分类器」四个字 ⇒ 也不该被当成分类调用', async () => {
    const content = await ask(LOBE_SYSTEM, '你是一个意图分类器吗？');
    expect(content).toBe(REPLY);
  });
});
