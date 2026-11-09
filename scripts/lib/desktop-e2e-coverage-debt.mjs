/**
 * **桌面端 E2E「真跑承重」的债清单** —— 谁在 CI 里**真的被跑过**。
 *
 * ⚠️⚠️ **为什么要有这份清单**（2026-11-11 真跑级实测 · 本仓 iBLOC/shadow）：
 *   「仓里有这个测试文件」**不等于**「它被跑过」⇒ ⇒ 覆盖率故事里那一片是**空头**。
 *   实测（`scripts/check-desktop-e2e-coverage.mjs`）：
 *   · Playwright 族 **26 个规格**，CI 的 `playwright test` 命令**只点名 4 个**
 *     ⇒ ⇒ **22 个规格的断言从未在 CI 里被执行过**；
 *   · wdio 族 **4 个** ＋ tauri-e2e 族 **6 个** ＋ 旧 e2e-tests 族 **3 个**
 *     ⇒ ⇒ CI 里**一次都没跑过**（只有 E2E Typecheck 给它们做**类型**检查
 *     ⇒ ⇒ 「类型对了」≠「跑过了」）。
 *
 * ⇒ ⇒ 这份清单的作用：**把隐形债变成显形债**，并且**新增即红**
 *   （新加一个规格却忘了接进 CI ⇒ ⇒ 闸立刻红 ⇒ ⇒ 覆盖率故事不会悄悄变虚）。
 *
 * ⚠️⚠️ **为什么是「逐文件」而不是「按目录 pattern」**（2026-11-11 实测踩到的坑）：
 *   第一版用 `pattern: '^tests/wdio/'` 这种整族登记 ⇒ ⇒ **新增即红失效** ——
 *   以后在 `tests/wdio/` 下加一个新文件，它**自动被 pattern 盖住** ⇒ ⇒
 *   闸不红 ⇒ ⇒ **债在悄悄长大而没人看见**。
 *   ⇒ ⇒ 所以每一条都**指名道姓**写死一个文件 ⇒ ⇒ 新文件**必然**落进「未登记」⇒ ⇒ 闸必红。
 *   ⚠️ 这是本族纪律的通用形态：**「登记」必须精确到能让新增漏网变成不可能**。
 *
 * ⚠️ **登记过期也判红** —— 一旦某个文件被接进 CI（或被删掉），这条登记就必须**销掉**
 *   （承 U+3475 条那条纪律：「修缺陷与销账必须同一个提交」）。
 */

/** 四族各自的登记理由（**逐文件** ⇒ ⇒ 新增必红）。 */
const R = {
  playwright:
    'CI 只点名 4 个 Playwright 规格（e2e-conversation-flow / e2e-task-scheduling / ' +
    'business-flow-ui / telencephalon-endpoints）⇒ ⇒ 本文件从未在 CI 里跑过',
  wdio:
    'wdio 族整族还没进 CI（chromedriverCustomPath 写死 linux 路径 ⇒ ⇒ 本机跑不起来）' +
    '⇒ ⇒ 只有类型闸（E2E Typecheck）⇒ ⇒ 「类型对了」≠「跑过了」',
  tauri:
    'tauri-e2e 族整族还没进 CI（需要 tauri-driver ＋ 真桌面会话）⇒ ⇒ 只有类型闸 ' +
    '（E2E Typecheck）⇒ ⇒ 「类型对了」≠「跑过了」',
  legacy:
    '旧 e2e-tests 套件整族还没进 CI（跑的是 wdio.conf.js 那条老路）⇒ ⇒ 只有类型闸 ' +
    '⇒ ⇒ 「类型对了」≠「跑过了」',
};

/**
 * 债清单 —— **每条一个文件**（⇒ ⇒ 新增即红）。
 *
 * @type {{family: string, file: string, reason: string}[]}
 */
export const COVERAGE_DEBT = [
  // ── Playwright 族：CI 只点名 4 个 ⇒ ⇒ 其余 22 个从未在 CI 里跑过。
  { family: 'playwright', file: 'tests/e2e-ui/conversation-chat.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/conversation.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/discovery.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/e2e-provider-conversation.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/flows.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/group.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/logs.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/mcp.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/memory.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/models.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/onboarding.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/providers-models.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/providers.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/resonance.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/settings.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/setup.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/skills.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/taskboard.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/three-state-providers.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/video-sources.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/visual-qa-clarification.spec.ts', reason: R.playwright },
  { family: 'playwright', file: 'tests/e2e-ui/voice.spec.ts', reason: R.playwright },

  // ── wdio 族：整族都没进 CI（pnpm test:wdio 需要 chromedriver ＋ 真浏览器）。
  { family: 'wdio', file: 'tests/wdio/api.test.ts', reason: R.wdio },
  { family: 'wdio', file: 'tests/wdio/conversation.test.ts', reason: R.wdio },
  { family: 'wdio', file: 'tests/wdio/features.test.ts', reason: R.wdio },
  { family: 'wdio', file: 'tests/wdio/pages.test.ts', reason: R.wdio },

  // ── tauri-e2e 族：整族都没进 CI（需要 tauri-driver ＋ 真桌面会话）。
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/__tests__/state-reset.test.ts', reason: R.tauri },
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/smoke/api.test.ts', reason: R.tauri },
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/smoke/conversation.test.ts', reason: R.tauri },
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/smoke/features.test.ts', reason: R.tauri },
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/smoke/pages.test.ts', reason: R.tauri },
  { family: 'tauri-e2e', file: 'tests/tauri-e2e/smoke/startup.test.ts', reason: R.tauri },

  // ── 旧 e2e-tests 套件：整族都没进 CI（跑的是 wdio.conf.js 那条老路）。
  { family: 'e2e-tests', file: 'e2e-tests/specs/app.e2e.js', reason: R.legacy },
  { family: 'e2e-tests', file: 'e2e-tests/specs/navigation.e2e.js', reason: R.legacy },
  { family: 'e2e-tests', file: 'e2e-tests/specs/providers.e2e.js', reason: R.legacy },
];
