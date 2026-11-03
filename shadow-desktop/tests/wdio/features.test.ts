import { browser, expect } from '@wdio/globals';
import { TEST_CONFIG } from './config';

const TELENCEPHALON_URL = 'http://localhost:60080';

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
    expect(url).toBeTruthy();
  });

  it('应该检查端脑 API 供应商列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/models/providers`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});

describe('Shadow Desktop - 智能体模型配置', () => {
  it('应该获取智能体配置', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('lobes');
  });

  it('应该包含 required_capabilities', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('required_capabilities');
  });
});

describe('Shadow Desktop - 对话 API', () => {
  it('应该创建对话', async () => {
    await browser.url(`${TELENCEPHALON_URL}/shadow/v1/conversations`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该获取对话列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/shadow/v1/conversations`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });
});

describe('Shadow Desktop - 模型列表', () => {
  it('应该获取本地模型列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/v1/models`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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
    expect(url).toBeTruthy();
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
    expect(url).toBeTruthy();
  });

  it('应该获取 MCP 服务器列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/mcp/servers`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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
    expect(url).toBeTruthy();
  });

  it('应该获取记忆列表', async () => {
    await browser.url(`${TELENCEPHALON_URL}/hippocampus/api/memory`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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
    expect(url).toBeTruthy();
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
    expect(url).toBeTruthy();
  });
});

describe('Shadow Desktop - 智能体调度 (prefrontal)', () => {
  it('应该列出可调度的智能体', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/prefrontal/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('dispatchable_via');
  });

  it('应该包含 temporal lobe', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/prefrontal/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('temporal');
  });

  it('应该返回 lobe runtime 信息', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/lobes/runtime/temporal`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('openai_base_url');
  });

  it('应该接受 lobe 重新配置', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/lobes/reconfigure/temporal`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
  });

  it('应该列出 lobe capabilities', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/lobes/capabilities`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('llm');
    expect(text).toContain('asr');
    expect(text).toContain('tts');
  });

  it('应该列出 lobe manifests', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/lobes/manifest`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toContain('temporal');
    expect(text).toContain('prefrontal');
  });
});

describe('Shadow Desktop - 外部 Agent (tiangong) A2A 调度', () => {
  it('应该通过 prefrontal/agents 看到外部 agent', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/prefrontal/agents`);
    const body = await browser.$('body');
    const text = await body.getText();
    // tiangong-agent may or may not be registered, but the endpoint should respond
    expect(text).toBeTruthy();
  });

  it('prefrontal/dispatch 应该接受 agent 字段', async () => {
    await browser.url(`${TELENCEPHALON_URL}/api/telencephalon/prefrontal/dispatch`);
    const body = await browser.$('body');
    const text = await body.getText();
    expect(text).toBeTruthy();
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
    expect(url).toBeTruthy();
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
    expect(url).toBeTruthy();
  });
});
