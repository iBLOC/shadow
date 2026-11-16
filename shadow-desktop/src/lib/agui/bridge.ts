import { pickReportPayload } from '../clientTools';
import type { ClientToolRegistry } from '../clientTools';
import { buildAguiUserContent } from './client';
import type { AguiInlineFile } from './client';
import type { AguiContentPart, AguiTool } from './types';
import type { ClientToolOutcome } from './toolOutcomeGate';
import { failedOutcome } from './toolOutcomeGate';

/**
 * 桌面端 ⇒ ⇒ AG-UI 的**形状转换**（这一层唯一干这件事的地方）。
 *
 * ⚠️ **为什么单独一层**：页面里散着两处形状转换（工具清单 ＋ 用户内容）
 * ⇒ ⇒ 换协议时它们会各改各的 ⇒ ⇒ 这一层把它们钉在一起 ⇒ ⇒ 判据也钉在这里。
 */

/**
 * 设备工具清单 ⇒ ⇒ AG-UI 的**扁平**形状。
 *
 * ⚠️ AG-UI 的工具是 `{name, description?, parameters?}`（**不套 function**）
 * ⇒ ⇒ 端脑自己再包成 OpenAI 形状（端脑那一侧有判据钉着）⇒ ⇒ 两端各包一次是
 * **两处真相** ⇒ ⇒ 客户端这一处**不许**包。
 */
export function toAguiTools(registry: ClientToolRegistry): AguiTool[] {
  return registry.names.map((name) => {
    const tool = registry.lookup(name)!;
    return {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    };
  });
}

/** 一张待发的图片（**data URL**）。 */
export interface StagedImage {
  id: string;
  dataUrl: string;
}

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$/i;

/**
 * data URL ⇒ ⇒ （MIME ＋ base64）。
 *
 * ⚠️ **形状不对 ⇒ 响亮地拒**（端脑那侧也是响亮地拒）⇒ ⇒ **不许**静默丢图
 * ⇒ ⇒ 丢了图用户只看到「它没看我发的东西」。
 */
export function parseDataUrl(dataUrl: string): AguiInlineFile {
  const m = DATA_URL.exec(dataUrl.trim());
  if (!m) throw new Error('staged image is not a base64 data URL');
  return { mediaType: m[1].toLowerCase(), base64: m[2].replace(/\s+/g, '') };
}

/**
 * 这一轮的用户内容（文本 ＋ **内联**图片）—— AG-UI 规范形状。
 *
 * ⚠️ **只给内联、不给远程 URL**：端脑**不去拉**远程 URL ⇒ ⇒ 客户端必须内联字节
 * ⇒ ⇒ 这一层只提供「内联」这一种入口。
 */
export function buildAguiUserParts(
  text: string,
  images: StagedImage[] = [],
): AguiContentPart[] {
  const files = images.map((img) => parseDataUrl(img.dataUrl));
  return buildAguiUserContent(text, files);
}

/**
 * 设备工具跑完 ⇒ ⇒ 交回端脑的那一句。
 *
 * ⚠️ **只把 `report` 那一句交出去**（组件树是给界面的）⇒ ⇒ 与 legacy 路
 * 同一条规则（`pickReportPayload`）⇒ ⇒ 两端模型看到的形状一致。
 * ⚠️ **失败必须带 error** ⇒ ⇒ 不能只把失败原因塞进 content。
 */
export function toToolOutcome(
  ok: boolean,
  result: unknown,
  errorText?: string,
): ClientToolOutcome {
  if (!ok) return failedOutcome(errorText ?? 'tool failed');
  const payload = pickReportPayload(result);
  if (typeof payload === 'string') return { ok: true, content: payload };
  try {
    return { ok: true, content: JSON.stringify(payload ?? null) };
  } catch {
    // 序列化不了 ⇒ ⇒ 说清是什么，不要让模型收到「undefined」。
    return { ok: true, content: '[tool result is not serializable]' };
  }
}
