import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  CAPABILITY_DEFAULTS_STORAGE_KEY,
  capabilityCandidatesByCapability,
  capabilityOptionsByCapability,
  firstCapabilityOf,
  mergeCapabilityDefaultsForPush,
  modelIdOf,
  readCapabilityDefaultsSnapshot,
  unusableCapabilityDefaults,
  writeCapabilityDefaultsSnapshot,
} from '../../src/lib/capabilityDefaults';

/**
 * 「按能力分档的默认模型」这一段的**纯逻辑**判据（桌面端）。
 *
 * ⚠️ 移动端有一份**同名**的 Dart 实现 ⇒ ⇒ 两边的规则必须一模一样
 * ⇒ ⇒ 这里逐条钉住桌面这一份的形状。
 */
/**
 * ⚠️⚠️ **装一个可控的 storage 替身** —— 「注入失败」必须**整个换掉 global**。
 *
 * ⚠️⚠️ **为什么不能 `vi.spyOn(globalThis.localStorage, 'setItem')`** ——
 * 这是 2026-11-09 **真 CI 实测**踩到的坑（**本地绿、CI 红**）：
 * · CI（**node 24**）上 `globalThis.localStorage` 是 **jsdom 的 Storage** ⇒ ⇒ 它是
 *   一个 **Proxy** ⇒ ⇒ 往实例上 `defineProperty`（`vi.spyOn` 干的就是这件事）
 *   会被**静默吞掉**（实测：`Object.getOwnPropertyDescriptor` 读回来是
 *   `undefined`）⇒ ⇒ spy「装上了」却**一次都没被调到** ⇒ ⇒ 写失败被说成
 *   「存住了」⇒ ⇒ **失败长得像成功**。
 * · 本机（**node 25**）上 `globalThis.localStorage` 是 **Node 原生 Web Storage**
 *   （普通对象）⇒ ⇒ spy 生效 ⇒ ⇒ **本地绿、CI 红** ⇒ ⇒ 本地量的是**另一把尺子**。
 * ⇒ ⇒ 所以：**整个换掉 global**（`vi.stubGlobal`）⇒ ⇒ 注入一定生效；
 * ⇒ ⇒ 并且**断言注入真的被调用过**（`calls.setItem` 计数）⇒ ⇒ 下一次谁再把注入
 *   写成静默空转，那条判据会**当场红**，而不是又一次「本地绿、CI 红」。
 *
 * （仓里已有同款范式：`tests/pages/WorkflowStudioPage.test.tsx`。）
 */
function installStorage(opts: { failWrite?: boolean } = {}) {
  const store = new Map<string, string>();
  const calls = { setItem: 0, getItem: 0 };
  const fake = {
    getItem: (k: string) => {
      calls.getItem += 1;
      return store.has(k) ? store.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      calls.setItem += 1;
      if (opts.failWrite) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  };
  vi.stubGlobal('localStorage', fake);
  return { fake, calls };
}

describe('capabilityCandidatesByCapability', () => {
  it('按模型的能力标注分组', () => {
    const out = capabilityCandidatesByCapability([
      {
        name: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', capability: 'llm' },
          { id: 'whisper-1', name: 'Whisper', capability: 'asr' },
          { id: 'tts-1', name: 'TTS-1', capability: 'tts' },
        ],
      },
    ]);

    expect(Object.keys(out).sort()).toEqual(['asr', 'llm', 'tts']);
    expect(out.asr[0].id).toBe('whisper-1');
    expect(out.asr[0].label).toBe('OpenAI · Whisper');
  });

  it('没有能力标注的模型不进任何一档（不猜）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'X', models: [{ id: 'mystery', name: 'Mystery' }] },
    ]);
    expect(out).toEqual({});
  });

  it('同一个 id 在两个供应商下 ⇒ 只留一条（不重复）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'A', models: [{ id: 'whisper-1', name: 'W1', capability: 'asr' }] },
      { name: 'B', models: [{ id: 'whisper-1', name: 'W2', capability: 'asr' }] },
    ]);
    expect(out.asr.length).toBe(1);
  });

  it('空 id 不进候选（端脑按 id 选引擎 ⇒ 空 id 必失败）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'A', models: [{ id: '   ', name: 'Blank', capability: 'asr' }] },
    ]);
    expect(out.asr ?? []).toEqual([]);
  });

  it('两种能力形状都读（单个 capability 与 capabilities 数组）', () => {
    expect(firstCapabilityOf({ capability: 'TTS' })).toBe('tts');
    expect(firstCapabilityOf({ capabilities: ['llm', 'vision'] })).toBe('llm');
    expect(firstCapabilityOf({})).toBeNull();
  });

  it('模型 id 两种字段名都读', () => {
    expect(modelIdOf({ id: 'a' })).toBe('a');
    expect(modelIdOf({ model_id: 'b' })).toBe('b');
    expect(modelIdOf({ id: '  ' })).toBe('');
  });
});

describe('capabilityOptionsByCapability —— 「此刻能不能用」', () => {
  // ⚠️ **目录面 ≠ 已注册面** —— 2026-11-09 实测的根因：
  //   目录面（`GET /models/providers`）的 asr id 形如 `whisper-base`，
  //   而端脑真解析引擎时用的是**已注册面**（`asr_registry.runtime_for(id)`
  //   ⇒ 精确匹配已注册的 model_id）⇒ ⇒ 形如 `whisper-model`。
  //   两套只有 `sensevoice-small` / `voxcpm2` 恰好同名 ⇒ ⇒ 客户端拿目录面
  //   的 id 去填 asr 档 ⇒ ⇒ 端脑永远解析不到 ⇒ ⇒ **存得进去、用不了**。
  const CATALOG = {
    asr: [
      { id: 'whisper-base', label: '本地 neuron（内置） · whisper-base' },
      { id: 'whisper-tiny', label: '本地 neuron（内置） · whisper-tiny' },
      { id: 'sensevoice-small', label: '本地 neuron（内置） · sensevoice-small' },
    ],
    tts: [{ id: 'voxcpm2', label: '本地 neuron（内置） · voxcpm2' }],
    llm: [{ id: 'Qwen/Qwen3-0.6B', label: '本地 neuron（内置） · Qwen/Qwen3-0.6B' }],
  };

  it('按引擎 id 解析的档 ⇒ 候选取「已注册面」，不取目录面', () => {
    const out = capabilityOptionsByCapability(CATALOG, {
      engineResolved: ['asr', 'tts'],
      registered: { asr: ['sensevoice-small'], tts: ['voxcpm2'] },
    });
    // ⚠️ whisper-base 在目录面里，但**没注册** ⇒ ⇒ 不许出现在可选项里
    //    （出现了就是「用户选了端脑永远解析不到」）。
    expect(out.asr.map((o) => o.id)).toEqual(['sensevoice-small']);
    expect(out.tts.map((o) => o.id)).toEqual(['voxcpm2']);
  });

  it('不按引擎 id 解析的档 ⇒ 候选不受影响（仍取目录面）', () => {
    const out = capabilityOptionsByCapability(CATALOG, {
      engineResolved: ['asr', 'tts'],
      registered: { asr: ['sensevoice-small'], tts: ['voxcpm2'] },
    });
    expect(out.llm.map((o) => o.id)).toEqual(['Qwen/Qwen3-0.6B']);
  });

  it('已注册的 id 也可能在目录面里 ⇒ 显示名用目录面那份（同一个 id 两套名字更困惑）', () => {
    const out = capabilityOptionsByCapability(CATALOG, {
      engineResolved: ['asr'],
      registered: { asr: ['sensevoice-small'] },
    });
    expect(out.asr[0].label).toBe('本地 neuron（内置） · sensevoice-small');
  });

  it('已注册的 id 不在目录面里 ⇒ 也要列出来（部署自建的 id 才是唯一真相）', () => {
    const out = capabilityOptionsByCapability({ llm: [] }, {
      engineResolved: ['asr'],
      registered: { asr: ['self-hosted-asr'] },
    });
    expect(out.asr.map((o) => o.id)).toEqual(['self-hosted-asr']);
    expect(out.asr[0].label).toBe('self-hosted-asr');
  });

  it('这台大脑没注册任何引擎 ⇒ 那一档是空列表（不是「没有这一档」）', () => {
    const out = capabilityOptionsByCapability(CATALOG, {
      engineResolved: ['asr', 'tts'],
      registered: { asr: [], tts: [] },
    });
    expect(out.asr).toEqual([]);
    expect(out.tts).toEqual([]);
    // ⚠️ llm 档不受影响。
    expect(out.llm.length).toBe(1);
  });

  it('端脑没给 engine_resolved ⇒ 全部按目录面（老端脑不许把界面画空）', () => {
    const out = capabilityOptionsByCapability(CATALOG, {
      engineResolved: [],
      registered: {},
    });
    expect(out.asr.length).toBe(3);
    expect(out.tts.length).toBe(1);
  });
});

describe('unusableCapabilityDefaults —— 当前默认值此刻用不了', () => {
  it('指向没注册的 id ⇒ 判为「用不了」（存得进去、用不了）', () => {
    const out = unusableCapabilityDefaults(
      { asr: 'whisper-base', tts: 'voxcpm2' },
      {
        engineResolved: ['asr', 'tts'],
        registered: { asr: ['sensevoice-small'], tts: ['voxcpm2'] },
      },
    );
    expect(out).toEqual([{ capability: 'asr', modelId: 'whisper-base' }]);
  });

  it('不按引擎 id 解析的档 ⇒ 不说「用不了」（客户端没有依据判断）', () => {
    const out = unusableCapabilityDefaults(
      { llm: 'some-cloud-model' },
      { engineResolved: ['asr'], registered: { asr: ['sensevoice-small'] } },
    );
    expect(out).toEqual([]);
  });

  it('空值 / 没配 ⇒ 不算「用不了」', () => {
    const out = unusableCapabilityDefaults(
      { asr: '   ' },
      { engineResolved: ['asr'], registered: { asr: ['sensevoice-small'] } },
    );
    expect(out).toEqual([]);
  });

  it('端脑没给 engine_resolved ⇒ 一条都不判（不许凭空指控）', () => {
    const out = unusableCapabilityDefaults(
      { asr: 'whisper-base' },
      { engineResolved: [], registered: {} },
    );
    expect(out).toEqual([]);
  });
});

describe('mergeCapabilityDefaultsForPush', () => {
  it('基线 = 本地副本 ∪ 端脑当前值（别把另一边的档位抹掉）', () => {
    const next = mergeCapabilityDefaultsForPush(
      { tts: 'tts-local' },
      { asr: 'whisper-1' },
      'llm',
      'gpt-4o',
    );
    expect(next).toEqual({
      tts: 'tts-local',
      asr: 'whisper-1',
      llm: 'gpt-4o',
    });
  });

  it('清空一档 ⇒ 那一档被删掉（不是空串）', () => {
    const next = mergeCapabilityDefaultsForPush(
      { asr: 'whisper-1', tts: 'tts-1' },
      {},
      'asr',
      null,
    );
    expect('asr' in next).toBe(false);
    expect(next.tts).toBe('tts-1');
  });

  it('端脑已有的那一档也要能被覆盖（远端值优先）', () => {
    const next = mergeCapabilityDefaultsForPush(
      {},
      { asr: 'old-model' },
      'asr',
      'new-model',
    );
    expect(next.asr).toBe('new-model');
  });
});

describe('durable 副本（桌面端本地留存）', () => {
  beforeEach(() => {
    // ⚠️ **不依赖环境里的 localStorage**（node 24 ＝ jsdom 的 Proxy、
    //   node 25 ＝ Node 原生实现）⇒ ⇒ 装一个确定的替身 ⇒ ⇒ 两端量同一把尺子。
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('坏数据 ⇒ 空表（不许把设置页卡死）', () => {
    globalThis.localStorage?.setItem(CAPABILITY_DEFAULTS_STORAGE_KEY, 'not-json');
    expect(readCapabilityDefaultsSnapshot()).toEqual({});
  });

  it('空串值不进副本（配了但没配 = 失败长得像成功）', () => {
    globalThis.localStorage?.setItem(
      CAPABILITY_DEFAULTS_STORAGE_KEY,
      JSON.stringify({ asr: '   ', tts: 'tts-1' }),
    );
    expect(readCapabilityDefaultsSnapshot()).toEqual({ tts: 'tts-1' });
  });

  it('写进去能读回来', () => {
    writeCapabilityDefaultsSnapshot({ asr: 'whisper-1' });
    expect(readCapabilityDefaultsSnapshot()).toEqual({ asr: 'whisper-1' });
  });
});

describe('writeCapabilityDefaultsSnapshot —— 「存没存住」必须分得清', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('存进去了 ⇒ ok=true', () => {
    expect(writeCapabilityDefaultsSnapshot({ asr: 'whisper-1' }).ok).toBe(true);
  });

  it('存不进去（抛异常）⇒ ok=false ＋ 带原因（不许假装存住了）', () => {
    // ⚠️ **注入失败要整个换掉 global** —— 理由见上面 installStorage 的注释
    //   （`vi.spyOn` 在 jsdom 的 Storage（Proxy）上**会被静默吞掉** ⇒ ⇒
    //   注入空转 ⇒ ⇒ 判据测不到东西却绿）。
    const { calls } = installStorage({ failWrite: true });
    const res = writeCapabilityDefaultsSnapshot({ asr: 'whisper-1' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('QuotaExceededError');
    // ⚠️⚠️ **注入必须真的被调用过** —— 否则「注入空转」＝「判据测不到东西」
    //   ⇒ ⇒ 一次绿都不算数（这一条断言就是为此存在的）。
    expect(calls.setItem).toBe(1);
  });

  it('压根没有 localStorage ⇒ 也是「没存住」（可选链不许把它吞成「存住了」）', () => {
    vi.stubGlobal('localStorage', undefined);
    const res = writeCapabilityDefaultsSnapshot({ asr: 'whisper-1' });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
