import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI SDK 那条路的**客户端工具清单**。
 *
 * ⚠️ 这条路今天**零消费方**（`useTelencephalonChat` 不被引用），所以它坏掉了
 * 也不会有任何现网故障 —— 但它一旦被接上，**工具清单必须和
 * `ConversationPage` 那条路完全一样**。
 *
 * 认错的代价很具体：两条路给模型看的工具不一样 ⇒ **同一个模型、同一个问题，
 * 走哪条路决定模型能不能调 `set_theme`** ⇒ 而且这个差异在界面上**完全看不出来**
 * （模型就是没调，用户只会觉得「它这会儿不听指挥」）。
 *
 * 所以这里锁的是**「两条路同一个来源」**，不是把 schema 字面量再抄一遍
 * （字面量由 `clientTools.test.ts` 锁，跨端那份由移动端锁）。
 */
const { streamMessage } = vi.hoisted(() => ({
  streamMessage: vi.fn(),
}));

vi.mock('../telencephalonClient', () => ({
  telencephalonClient: { streamMessage },
}));

import { createTelencephalonChatTransport } from '../aiSdkTelencephalonTransport';
import { desktopClientTools, toOpenAiTools } from '../clientTools';

async function* emptyEventStream() {
  // 什么都不产出：这条测试只关心**发出去什么**，不关心回来的内容。
}

describe('AI SDK 路的客户端工具清单', () => {
  beforeEach(() => {
    streamMessage.mockReset();
    streamMessage.mockImplementation(() => emptyEventStream());
  });

  async function sendOne(text: string) {
    const transport = createTelencephalonChatTransport({ conversationId: 'conv-1' });
    await transport.sendMessages({
      messages: [{ role: 'user', content: text }],
      abortSignal: undefined,
    });
    expect(streamMessage).toHaveBeenCalledTimes(1);
    return streamMessage.mock.calls[0][1] as {
      text: string;
      tools?: Array<{ type: string; function: { name: string } }>;
      await_tool_result?: boolean;
    };
  }

  it('随消息把**这台设备能跑的客户端工具**发给端脑', async () => {
    const request = await sendOne('把主题换成靛蓝');

    expect(request.text).toBe('把主题换成靛蓝');
    expect(request.tools).toBeDefined();
    const names = request.tools!.map((t) => t.function.name);
    expect(names).toContain('set_theme');
  });

  it('工具清单与 `toOpenAiTools(desktopClientTools)` **逐字一致** —— 与 ConversationPage 那条路同一个来源', async () => {
    const request = await sendOne('把主题换成靛蓝');

    expect(request.tools).toEqual(toOpenAiTools(desktopClientTools));
  });

  it('形状是 OpenAI 的 function 形状（端脑按这个透传给 LLM）', async () => {
    const request = await sendOne('把主题换成靛蓝');

    for (const tool of request.tools!) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
    }
  });

  it('声明「等结果」—— 端脑才能在同一回合里接着说', async () => {
    const request = await sendOne('把主题换成靛蓝');

    // 不声明的话，端脑不敢等 —— 那一回合就只剩一张沉默的卡片，
    // 模型的话要等到**下一回合**才说得出。
    // ⚠️ 字段名是 snake_case：这个对象被原样 `JSON.stringify` 发出去。
    expect(request.await_tool_result).toBe(true);
  });
});
