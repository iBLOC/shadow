import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ⚠️ **回归钉**：dmn-js（@17.x）的 Modeler 没有 `createDiagram()`（那是
// bpmn-js 的 API）⇒ 上一版挂载期调它必炸 `TypeError` ⇒ 外层 catch 把
// 错误挂上红条 ⇒ 画布永远空白、Sync/Export 全灰。修法＝初始化只走
// `importXML()`。本文件用**替身 Modeler**（故意的：没有 createDiagram ⇒
// 如果回归，行为与真库同形 —— TypeError ⇒ 错误条出现 ⇒ 用例红）钉住
// 两件事：① 错误条不出现、徽章走到「canvas ready」；② 示例 DMN 真被
// 喂进 importXML。
const { xmlSeen, instances, FakeModeler } = vi.hoisted(() => {
  const xmlSeen: string[] = [];
  const instances: Array<{ importXML: unknown; destroy: () => void }> = [];
  class FakeModeler {
    importXML = async (xml: string) => {
      xmlSeen.push(xml);
      return { warnings: [] };
    };
    saveXML = async () => ({ xml: '<definitions/>' });
    constructor() {
      instances.push(this);
    }
    destroy() {}
  }
  return { xmlSeen, instances, FakeModeler };
});

vi.mock('dmn-js/lib/Modeler', () => ({ default: FakeModeler }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

import { JdmEditorPage, parseDmnXmlToRules } from '../JdmEditorPage';

beforeEach(() => {
  xmlSeen.length = 0;
  instances.length = 0;
});

describe('JdmEditorPage（dmn-js 画布初始化）', () => {
  it('挂载后不出现 TypeError 错误条，徽章走到 canvas ready', async () => {
    render(<JdmEditorPage />);
    // ⚠️ 全局 setup 的 t 是键透传 ⇒ 断言键名（真翻译由 i18n 词表闸兜底）。
    await waitFor(() =>
      expect(screen.getByText('jdmEditor.canvasReady')).toBeInTheDocument(),
    );
    // 修前这里挂着 `TypeError: modeler.createDiagram is not a function`。
    expect(screen.queryByText(/createDiagram/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument();
  });

  it('示例 DMN 被喂进 importXML（合法 DMN 1.1：rule 包裹＋inputExpression 正形）', async () => {
    render(<JdmEditorPage />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    await waitFor(() => expect(xmlSeen.length).toBeGreaterThan(0));
    const xml = xmlSeen[0];
    expect(xml).toContain('<definitions'); // DMN 根（无命名空间前缀）
    expect(xml).toContain('20191111/MODEL'); // dmn-moddle@12 描述符声明的 1.2 命名空间
    expect(xml).toContain('<decisionTable');
    // 上一版产出的 `<ruleEntry>` 不是 DMN 元素、`<rule>` 从未出现 ⇒
    // dmn-js 解析不出 definitions ⇒ saveXML 答 no definitions loaded。
    expect(xml).toContain('<rule ');
    expect(xml).not.toContain('ruleEntry');
    expect(xml).toContain('typeRef="string"><text>value</text>'); // inputExpression 正形
    expect(xml).toContain('&gt; 25'); // FEEL 文本已转义（value > 25）
  });

  it('parseDmnXmlToRules：符号 → 枚举词（< 同步回表单是 lt，不再静默变成第一项）', () => {
    // 修前：`op: op as ComparisonRule['op']` 把裸符号 '<' 塞进 state
    // ⇒ select 的 option value 是 'lt' ⇒ 匹配不上 ⇒ 显示成第一项 '>'
    // ⇒ 「< 20」同步一轮就静默变「> 20」（数据被改还长得像成功）。
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/">
  <decision id="d"><decisionTable id="t" hitPolicy="FIRST">
    <rule id="r1"><inputEntry><text>value &gt; 25</text></inputEntry><outputEntry><text>"notify"</text></outputEntry></rule>
    <rule id="r2"><inputEntry><text>value &lt; 20</text></inputEntry><outputEntry><text>"notify"</text></outputEntry></rule>
    <rule id="r3"><inputEntry><text>between(value, 20, 25)</text></inputEntry><outputEntry><text>"notify"</text></outputEntry></rule>
  </decisionTable></decision></definitions>`;
    const rules = parseDmnXmlToRules(xml);
    expect(rules.map((r) => r.op)).toEqual(['gt', 'lt', 'between']);
    expect(rules[1].threshold).toBe(20);
    expect(rules[2].high).toBe(25);
  });
});
