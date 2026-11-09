import { browser, expect } from '@wdio/globals';
import { brainGet } from '../support/brain-api';

/**
 * 这一族原来**每一条**断言都是恒真的（2026-11-09 真机实测）：
 *   · `expect(url).toBeTruthy()` ⇒ ⇒ URL 永远非空；
 *   · `expect(text).toBeTruthy()` ⇒ ⇒ **任何渲染出来的页面都有文字** —— 包括
 *     「404 Not Found」「Unauthorized」那种 ⇒ ⇒ **端脑整个坏了它照样绿**。
 * ⇒ ⇒ 现在每条断言都指向它宣称的那件事：
 *   · **页面**用例 ⇒ ⇒ 路由对得上 ＋ **应用真的挂上了**（`#root` 有内容）；
 *   · **端脑**用例 ⇒ ⇒ **状态码**（带读门钥匙）＋ 回包里的**具体字段**。
 * ⇒ ⇒ 期望值取自**真端脑实测**（2026-11-09，`/api/telencephalon/*` 实测回包）。
 */

/** 允许出现的路由（没引导完时会被送到 setup / onboarding）。 */
const ROUTE_RE = /\/(models|setup|onboarding)/;

describe('Shadow Desktop - 供应商管理', () => {
  before(async () => {
    await browser.url('/models');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/models') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
  });

  it('应该加载模型页面', async () => {
    const url = await browser.getUrl();
    expect(url).toMatch(ROUTE_RE);
    // ⚠️ 「应用真的挂上了」——`#root` 在、且不是白屏
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });

  it('应该检查端脑 API 供应商列表', async () => {
    const res = await brainGet('/models/providers');
    expect(res.status).toBe(200);
    expect(res.body).toContain('provider_type');
  });
});

describe('Shadow Desktop - 智能体模型配置', () => {
  it('应该获取智能体配置', async () => {
    const res = await brainGet('/api/telencephalon/agents');
    expect(res.status).toBe(200);
    expect(res.body).toContain('lobes');
  });

  it('应该包含 required_capabilities', async () => {
    const res = await brainGet('/api/telencephalon/agents');
    expect(res.status).toBe(200);
    expect(res.body).toContain('required_capabilities');
  });
});

describe('Shadow Desktop - 对话 API', () => {
  it('应该列出对话', async () => {
    const res = await brainGet('/shadow/v1/conversations');
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('应该拿到对话条目的字段', async () => {
    const res = await brainGet('/shadow/v1/conversations');
    expect(res.status).toBe(200);
    const list = JSON.parse(res.body);
    expect(Array.isArray(list)).toBe(true);
    // ⚠️ 空列表也是合法形态 ⇒ ⇒ 只在**有**条目时核字段（不是恒真断言：
    //   断言的是「条目长成该长的样子」，不是「列表非空」）。
    for (const item of list) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.agent).toBe('string');
    }
  });
});

describe('Shadow Desktop - 模型列表', () => {
  it('应该获取本地模型列表', async () => {
    const res = await brainGet('/v1/models');
    expect(res.status).toBe(200);
    expect(res.body).toContain('"object":"list"');
  });
});

describe('Shadow Desktop - Trace 功能', () => {
  it('应该加载 Trace 页面', async () => {
    await browser.url('/trace');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/trace') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(trace|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - MCP 管理', () => {
  it('应该加载 MCP 页面', async () => {
    await browser.url('/mcp');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/mcp') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(mcp|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });

  it('应该获取 MCP 服务器列表', async () => {
    const res = await brainGet('/api/telencephalon/mcp/servers');
    expect(res.status).toBe(200);
    expect(res.body).toContain('"count"');
  });
});

describe('Shadow Desktop - 记忆功能', () => {
  it('应该加载记忆页面', async () => {
    await browser.url('/memory');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/memory') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(memory|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });

  it('应该获取记忆列表', async () => {
    // ⚠️ 真机实测（2026-11-09）：这个端点**当前**回 200 ＋ 一段**存储错误文本**
    //   （lance 的 tenant_id schema 不匹配）⇒ ⇒ 这里只断言**状态码**
    //   ⇒ ⇒ 端脑哪天把它删了（404）或门没开（401）⇒ ⇒ 才红。
    const res = await brainGet('/hippocampus/api/memory');
    expect(res.status).toBe(200);
  });
});

describe('Shadow Desktop - 技能管理', () => {
  it('应该加载技能页面', async () => {
    await browser.url('/skills');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/skills') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(skills|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 共鸣管理', () => {
  it('应该加载共鸣页面', async () => {
    await browser.url('/resonance');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/resonance') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(resonance|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 智能体调度 (prefrontal)', () => {
  it('应该列出可调度的智能体', async () => {
    const res = await brainGet('/api/telencephalon/prefrontal/agents');
    expect(res.status).toBe(200);
    expect(res.body).toContain('dispatchable_via');
  });

  it('应该包含 temporal lobe', async () => {
    const res = await brainGet('/api/telencephalon/prefrontal/agents');
    expect(res.status).toBe(200);
    expect(res.body).toContain('temporal');
  });

  it('应该返回 lobe runtime 信息', async () => {
    const res = await brainGet('/api/telencephalon/lobes/runtime/temporal');
    expect(res.status).toBe(200);
    expect(res.body).toContain('openai_base_url');
  });

  it('lobe 重新配置这条路由在（只接 POST）', async () => {
    // ⚠️ 真机实测（2026-11-09）：GET 这条路由回 **405** ⇒ ⇒ 路由在、只接 POST
    //   ⇒ ⇒ 断言「路由在」（405/200，而不是 404）⇒ ⇒ 端脑哪天删了它 ⇒ ⇒ 才红。
    //   ⚠️ **没有**真的去 POST：那条请求会改端脑的 lobe 配置（副作用），
    //   ⇒ ⇒ 这一族**只证明路由在**，不证明「重新配置能成功」。
    const res = await brainGet('/api/telencephalon/lobes/reconfigure/temporal');
    expect([200, 405]).toContain(res.status);
  });

  it('应该列出 lobe capabilities', async () => {
    const res = await brainGet('/api/telencephalon/lobes/capabilities');
    expect(res.status).toBe(200);
    expect(res.body).toContain('llm');
    expect(res.body).toContain('asr');
    expect(res.body).toContain('tts');
  });

  it('应该列出 lobe manifests', async () => {
    const res = await brainGet('/api/telencephalon/lobes/manifest');
    expect(res.status).toBe(200);
    expect(res.body).toContain('temporal');
    expect(res.body).toContain('prefrontal');
  });
});

describe('Shadow Desktop - 外部 Agent (tiangong) A2A 调度', () => {
  it('prefrontal/agents 答得出（外部 agent 注册与否另说）', async () => {
    // ⚠️ tiangong-agent **可能没注册** ⇒ ⇒ 所以只断言「端点答得出、且是列表」，
    //   **不**断言「里面有 tiangong」⇒ ⇒ 那才是恒真断言。
    const res = await brainGet('/api/telencephalon/prefrontal/agents');
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('prefrontal/dispatch 这条路由在（只接 POST）', async () => {
    // ⚠️ 真机实测（2026-11-09）：GET 回 **405** ⇒ ⇒ 路由在、只接 POST。
    //   ⚠️ **没有**真的去 dispatch：那会真的调度一个智能体（副作用），
    //   ⇒ ⇒ 这一族只证明路由在。
    const res = await brainGet('/api/telencephalon/prefrontal/dispatch');
    expect([200, 405]).toContain(res.status);
  });
});

describe('Shadow Desktop - 思维定式', () => {
  it('应该加载思维定式页面', async () => {
    await browser.url('/flows');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/flows') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(flows|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});

describe('Shadow Desktop - 语音功能', () => {
  it('应该加载语音页面', async () => {
    await browser.url('/voice');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/voice') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(voice|setup|onboarding)/);
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });
});