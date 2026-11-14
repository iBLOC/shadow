// jdm-editor Page — DMN 规则图形编辑器 + zen-engine 实时试运行。
//
// 2026-10-18: 这是 shadow-desktop 内的 jdm-editor 入口（不依赖
// 外部 npm `jdm-editor` 包）。前端用 `dmn-js` 渲染 DMN 决策表
//（社区标准编辑库），后端把当前编辑的规则 upsert 到 diencephalon
// thalamus 的 ZenRuleEngine 并试运行。`dmn-js` 导出的是 OMG
// DMN XML，zen 期望的是 GoRules JDM JSON graph——页面内部做
// 一次 DMN XML → 简化 JDM graph 的转换（保留 decisionTable
// 语义，把 input/output/cases 映射到 zen 的 inputNode +
// switchNode 形态）。
//
// 与现有路由（/tasks / /flows / /mcp 等）保持一致：菜单在
// Layout.tsx 加 "JDM Editor" 一项，本页用 React 函数式组件。

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, FileCode, Save, Download, Upload, X,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { invoke } from '@tauri-apps/api/core';

// One comparison rule, serializable to a GoRules JDM graph node
// ("expressionNode") on the zen side. This is the simplest form
// the JDM editor supports — the more complex decision-table
// view is left to a follow-up commit.
interface ComparisonRule {
  id: string;
  variable: string; // top-level binding (e.g. "value")
  op: 'gt' | 'lt' | 'eq' | 'between' | 'outside';
  /** gt/lt/eq: 单阈值; between: lo 阈值 */
  threshold: number;
  /** 仅 between 使用; 默认 -Infinity 让旧数据兼容 */
  high?: number;
}

interface JdmRule {
  rule_id: string;
  any_of: ComparisonRule[];
  // all_of: simple rule composition — a separate code path on
  // the zen side. Empty any_of + non-empty all_of = all-must-match.
  all_of: ComparisonRule[];
}

const EMPTY_RULE: JdmRule = {
  rule_id: 'sensor.bath_temp',
  any_of: [
    { id: 'r1', variable: 'value', op: 'gt', threshold: 25 },
    { id: 'r2', variable: 'value', op: 'lt', threshold: 20 },
  ],
  all_of: [],
};

function toZenGraph(rule: JdmRule): unknown {
  // Convert our simplified JDM shape to a GoRules JDM graph
  // that zen-engine evaluates (inputNode + switchNode +
  // expressionNodes). Empty rules on both sides = always notify;
  // a fully-populated any_of = OR of comparisons, all_of = AND.
  const comparisons = [
    ...rule.any_of.map((r) => ({ ...r, _kind: 'any' as const })),
    ...rule.all_of.map((r) => ({ ...r, _kind: 'all' as const })),
  ];
  if (comparisons.length === 0) {
    return { edges: [], nodes: [] };
  }
  const edges: unknown[] = [
    { id: 'e-in', sourceId: 'input', targetId: 'sw' },
  ];
  const nodes: unknown[] = [
    {
      id: 'input',
      type: 'inputNode',
      name: 'input',
      content: {},
    },
    {
      id: 'sw',
      type: 'switchNode',
      name: `switch-${rule.rule_id}`,
      content: {
        hitPolicy: rule.all_of.length > 0 ? 'all' : 'first',
        statements: comparisons.map((r) => ({
          id: `s-${r.id}`,
          condition: opToFeel(r.op, r),
        })),
      },
    },
  ];
  comparisons.forEach((c, i) => {
    edges.push({
      id: `e-${c.id}`,
      sourceId: 'sw',
      sourceHandle: `s-${c.id}`,
      targetId: `notify-${i}`,
    });
    nodes.push({
      id: `notify-${i}`,
      type: 'expressionNode',
      name: `notify-${rule.rule_id}-${c.id}`,
      content: {
        expressions: [
          { id: `x-${i}`, key: 'action', value: '"notify"' },
        ],
      },
    });
  });
  return { edges, nodes };
}

function opToFeel(op: ComparisonRule['op'], rule: ComparisonRule): string {
  switch (op) {
    case 'gt': return '>';
    case 'lt': return '<';
    case 'eq': return '=';
    case 'between': {
      // FEEL between(x, lo, hi) is a closed interval. hi missing
      // degrades to a one-sided test (operator should set both).
      const hi = rule.high ?? Infinity;
      return `between(${rule.variable}, ${rule.threshold}, ${hi})`;
    }
    case 'outside': {
      // Complement of `between` — "normal range is lo..hi, alert
      // only when OUTSIDE it". The common fish-tank case is the
      // reverse (<20 OR >25), but real-world sensors (room temp,
      // humidity) are usually "alert when outside the comfort
      // band". FEEL has no `!between`, so we spell it out as the
      // two-sided OR.
      const hi = rule.high ?? Infinity;
      return `not(between(${rule.variable}, ${rule.threshold}, ${hi}))`;
    }
  }
}

interface TryRunResult {
  ok: boolean;
  detail: string;
  action?: string;
}

export function JdmEditorPage() {
  const { t } = useTranslation();
  const [rule, setRule] = useState<JdmRule>(EMPTY_RULE);
  const [inputJson, setInputJson] = useState(
    '{\n  "sensor": "bath_temp",\n  "value": 27.3\n}',
  );
  const [tryRun, setTryRun] = useState<TryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const dmnContainerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);
  const [dmnReady, setDmnReady] = useState(false);
  const [dmnError, setDmnError] = useState<string | null>(null);

  // dmn-js Modeler lifecycle. Deterministic import path
  // (`dmn-js/lib/Modeler` — verified against dmn-js@17.12.3).
  // The canvas is presentation: the form below stays canonical,
  // and "Sync from canvas" pulls user edits made in the
  // decision-table UI back into the JdmRule state (saveXML →
  // DMN parse).
  useEffect(() => {
    let cancelled = false;
    let modeler: any = null;
    (async () => {
      try {
        const mod: any = await import('dmn-js/lib/Modeler');
        if (cancelled || !dmnContainerRef.current) return;
        const Ctor = mod?.default ?? mod;
        modeler = new Ctor({
          container: dmnContainerRef.current,
          keyboard: { bindTo: document },
        });
        modelerRef.current = modeler;
        // ⚠️ dmn-js（@17.x）的 Modeler **没有** `createDiagram()` —— 那是
        // bpmn-js 的 API；dmn-js 的初始化就是 `importXML()`（上一版在这里
        // 调 createDiagram 必炸 `TypeError` ⇒ 外层 catch 挂红条 ⇒ 画布
        // 永远空白，Sync/Export 全灰）。示例 XML 由下方规则即时生成。
        // ⚠️ 导入失败**要说**：静默吞掉后照样标 ready = 「canvas ready」
        // 长在没加载 definitions 的空 modeler 上（saveXML 会答
        // 「no definitions loaded」—— 失败长得像成功）。
        try {
          await modeler.importXML(buildSampleDmn(rule));
          if (!cancelled) setDmnReady(true);
        } catch (e) {
          if (!cancelled) {
            setDmnError(
              t('jdmEditor.importFailed', {
                detail: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }
        if (!cancelled) setDmnReady(true);
      } catch (e) {
        if (!cancelled) setDmnError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      modelerRef.current = null;
      try {
        modeler?.destroy();
      } catch {
        // already torn down
      }
    };
  // Intentionally no `rule` dependency: the canvas mounts once;
  // rule changes flow canvas-ward only via "Sync to canvas".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas → form: export the DMN XML the user edited and parse
  // the decision-table rows back into ComparisonRule entries.
  const syncFromCanvas = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) {
      setDmnError(t('jdmEditor.modelerNotReady'));
      return;
    }
    try {
      const { xml } = await modeler.saveXML({ format: true });
      const rules = parseDmnXmlToRules(String(xml));
      if (rules.length === 0) {
        setTryRun({ ok: false, detail: t('jdmEditor.noParsableRows') });
        return;
      }
      setRule((prev) => ({ ...prev, any_of: rules }));
      setTryRun({ ok: true, detail: t('jdmEditor.synced', { count: rules.length }) });
    } catch (e) {
      setDmnError(String(e));
    }
  }, []);

  // Form → canvas: regenerate the DMN XML from the form state
  // and re-import (so canvas edits don't silently diverge).
  const syncToCanvas = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) {
      setDmnError(t('jdmEditor.modelerNotReady'));
      return;
    }
    try {
      await modeler.importXML(buildSampleDmn(rule));
      setTryRun({ ok: true, detail: t('jdmEditor.reimported') });
    } catch (e) {
      setDmnError(String(e));
    }
  }, [rule]);

  // Export the current DMN XML to a downloadable file.
  const exportXml = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    try {
      const { xml } = await modeler.saveXML({ format: true });
      const blob = new Blob([String(xml)], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rule.rule_id.replace(/[^\w.-]/g, '_')}.dmn.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDmnError(String(e));
    }
  }, [rule.rule_id]);

  const zenGraph = useMemo(() => {
    try {
      return JSON.stringify(toZenGraph(rule), null, 2);
    } catch {
      return '/* graph conversion error */';
    }
  }, [rule]);

  const run = useCallback(async () => {
    setBusy(true);
    setTryRun(null);
    try {
      const input = JSON.parse(inputJson);
      const graph = toZenGraph(rule);
      const outcome = await invoke<{ action: string }>('jdm_try_run_rule', {
        graph,
        input,
      });
      setTryRun({
        ok: true,
        detail: t('jdmEditor.evaluated', { action: outcome.action }),
        action: outcome.action,
      });
    } catch (e) {
      setTryRun({ ok: false, detail: String(e) });
    } finally {
      setBusy(false);
    }
  }, [rule, inputJson, t]);

  // Publish: register the rule on the running thalamus so the
  // hot path evaluates it on every subsequent sensor event (no
  // per-call LLM, no per-call invoke). Distinct from `run`,
  // which is a one-shot dry-run against a synthetic input.
  const publish = useCallback(async () => {
    setPublishing(true);
    setTryRun(null);
    try {
      const graph = toZenGraph(rule);
      await invoke('jdm_register_rule', {
        ruleId: rule.rule_id,
        graph,
      });
      setTryRun({
        ok: true,
        detail: t('jdmEditor.published', { id: rule.rule_id }),
      });
    } catch (e) {
      setTryRun({ ok: false, detail: t('jdmEditor.publishFailed', { detail: String(e) }) });
    } finally {
      setPublishing(false);
    }
  }, [rule, t]);

  const onUpload = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.rule_id) setRule(parsed);
        else setTryRun({ ok: false, detail: t('jdmEditor.jsonMissingRuleId') });
      } catch (e) {
        setTryRun({ ok: false, detail: t('jdmEditor.parseFailed', { detail: String(e) }) });
      }
    };
    reader.readAsText(f);
  }, [t]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode className="w-6 h-6" />
          <h1 className="text-2xl font-semibold">{t('jdmEditor.title')}</h1>
          <Badge variant="secondary">{t('jdmEditor.zenBacked')}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            navigator.clipboard?.writeText(zenGraph);
            setTryRun({ ok: true, detail: t('jdmEditor.graphCopied') });
          }}>
            <Download className="w-4 h-4 mr-1" /> {t('jdmEditor.copyGraph')}
          </Button>
          <label>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onUpload}
            />
            <Button variant="outline" size="sm" asChild={false}>
              <span><Upload className="w-4 h-4 mr-1" /> {t('jdmEditor.uploadJson')}</span>
            </Button>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('jdmEditor.rule')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-sm font-medium">{t('jdmEditor.ruleId')}</label>
            <Input
              value={rule.rule_id}
              onChange={(e) => setRule({ ...rule, rule_id: e.target.value })}
            />
            <RuleSection
              title={t('jdmEditor.anyOf')}
              items={rule.any_of}
              onChange={(items) => setRule({ ...rule, any_of: items })}
            />
            <RuleSection
              title={t('jdmEditor.allOf')}
              items={rule.all_of}
              onChange={(items) => setRule({ ...rule, all_of: items })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('jdmEditor.tryRunTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-sm font-medium">{t('jdmEditor.inputJson')}</label>
            <Textarea
              rows={5}
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <Button onClick={run} disabled={busy}>
                <Play className="w-4 h-4 mr-1" /> {t('jdmEditor.evaluate')}
              </Button>
              {tryRun && (
                <Badge variant={tryRun.ok ? 'default' : 'destructive'}>
                  {tryRun.ok ? 'OK' : 'ERR'} — {tryRun.detail}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>{t('jdmEditor.dmnTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={dmnReady ? 'default' : 'secondary'}>
              {dmnReady ? t('jdmEditor.canvasReady') : t('jdmEditor.loading')}
            </Badge>
            {dmnError && <Badge variant="destructive">{dmnError}</Badge>}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={publish}
              disabled={busy || publishing}
            >
              <Save className="w-4 h-4 mr-1" />
              {publishing ? t('jdmEditor.publishing') : t('jdmEditor.publish')}
            </Button>
            <Button size="sm" variant="outline" onClick={syncFromCanvas} disabled={!dmnReady}>
              <Download className="w-4 h-4 mr-1" /> {t('jdmEditor.syncFromCanvas')}
            </Button>
            <Button size="sm" variant="outline" onClick={syncToCanvas} disabled={!dmnReady}>
              <Upload className="w-4 h-4 mr-1" /> {t('jdmEditor.syncToCanvas')}
            </Button>
            <Button size="sm" variant="outline" onClick={exportXml} disabled={!dmnReady}>
              <Save className="w-4 h-4 mr-1" /> {t('jdmEditor.exportXml')}
            </Button>
          </div>
          <div
            ref={dmnContainerRef}
            className="h-[480px] w-full border rounded"
            style={{ background: 'var(--background)' }}
          />
          <p className="text-xs text-muted-foreground">
            {t('jdmEditor.canvasHint')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>{t('jdmEditor.graphTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64 font-mono">
            {zenGraph}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

interface RuleSectionProps {
  title: string;
  items: ComparisonRule[];
  onChange: (items: ComparisonRule[]) => void;
}

function RuleSection({ title, items, onChange }: RuleSectionProps) {
  const { t } = useTranslation();
  const update = (idx: number, patch: Partial<ComparisonRule>) => {
    onChange(items.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () => {
    const id = `r${items.length + 1}_${Date.now()}`;
    onChange([...items, { id, variable: 'value', op: 'gt', threshold: 0 }]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{title}</label>
        <Button size="sm" variant="ghost" onClick={add}>
          <Save className="w-3 h-3 mr-1" /> {t('jdmEditor.add')}
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('jdmEditor.emptyFallThrough')}</p>
      )}
      {items.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={r.variable}
            onChange={(e) => update(i, { variable: e.target.value })}
            placeholder={t('jdmEditor.variable')}
          />
          <select
            className="border rounded px-2 py-1 bg-background text-foreground"
            value={r.op}
            onChange={(e) => update(i, { op: e.target.value as ComparisonRule['op'] })}
          >
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="eq">=</option>
            <option value="between">between</option>
            <option value="outside">outside</option>
          </select>
          <Input
            className="w-20"
            type="number"
            value={r.threshold}
            onChange={(e) => update(i, { threshold: Number(e.target.value) })}
            placeholder={(r.op === 'between' || r.op === 'outside') ? t('jdmEditor.lo') : t('jdmEditor.value')}
          />
          {(r.op === 'between' || r.op === 'outside') && (
            <Input
              className="w-20"
              type="number"
              value={r.high ?? ''}
              onChange={(e) =>
                update(i, {
                  high: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder={t('jdmEditor.hi')}
            />
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => remove(i)}
            aria-label={t('jdmEditor.remove')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function buildSampleDmn(rule: JdmRule): string {
  // Minimal valid DMN 1.2 XML with one decision table — the
  // dmn-js importXML target（命名空间必须是 dmn-moddle 描述符声明的
  // `20191111/MODEL/`＝DMN 1.2 —— 1.1/1.4 它都不认，根元素会落成
  // unknown ⇒ definitions 为空）。⚠️ **这一版是真的 DMN**：上一版产出的
  // `<ruleEntry>` 不是 DMN 元素、`<rule>` 从未出现、inputExpression
  // 缺 `<text>` 子元素、命名空间是 dmn-js 不认的 1.4 ⇒ dmn-js 解析不出
  // definitions ⇒ saveXML 答「no definitions loaded」（画布 ready 也是假绿）。
  // 行形状与 parseDmnXmlToRules 对齐：inputEntry text =
  // `variable op num`（gt/lt/eq）或 `between(...)` / `not(between(...))`。
  const rows = rule.any_of
    .map((r, i) => {
      const feel =
        r.op === 'between' || r.op === 'outside'
          ? opToFeel(r.op, r)
          : `${r.variable} ${opToFeel(r.op, r)} ${r.threshold}`;
      return `    <rule id="rule-${r.id}">
      <inputEntry id="InputEntry_${i + 1}"><text>${xmlText(feel)}</text></inputEntry>
      <outputEntry id="OutputEntry_${i + 1}"><text>"notify"</text></outputEntry>
    </rule>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" namespace="http://camunda.org/schema/1.0/dmn" id="definitions" name="definitions">
  <decision id="decision" name="${xmlAttr(rule.rule_id)}">
    <decisionTable id="decisionTable" hitPolicy="FIRST">
      <input id="input" label="value">
        <inputExpression id="inputExpression" typeRef="string"><text>value</text></inputExpression>
      </input>
      <output id="output" name="action" typeRef="string" />
${rows}
    </decisionTable>
  </decision>
</definitions>`;
}

/** XML 文本节点最小转义 —— FEEL 里的 `<` 不转义会把整个文档吃断。 */
function xmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** XML 属性值最小转义。 */
function xmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/// Parse the rule rows back out of a dmn-js-exported DMN XML.
///
/// dmn-js decision tables serialize each row as
/// `<rule id="..."><inputEntry><text>FEEL</text></inputEntry>...
/// </rule>`. We extract two FEEL shapes:
/// - Simple comparisons: `variable > 25` / `<` / `=`
/// - Range expressions: `between(variable, lo, hi)` (FEEL standard)
///
/// Other FEEL forms (functions, durations, ranges) are skipped —
/// those need a full expression editor and remain deferred.
/** FEEL 比较符号 → ComparisonRule 枚举词（表单下拉的 option value）。 */
const OP_SYMBOL_TO_WORD: Record<string, string> = {
  '>': 'gt',
  '<': 'lt',
  '=': 'eq',
};

export function parseDmnXmlToRules(xml: string): ComparisonRule[] {
  const out: ComparisonRule[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows = Array.from(doc.getElementsByTagName('rule'));
  for (const row of rows) {
    const inputs = Array.from(row.getElementsByTagName('inputEntry'));
    for (const input of inputs) {
      const text = input.getElementsByTagName('text')[0]?.textContent?.trim();
      if (!text) continue;
      // Simple comparison: variable op number
      const simple = text.match(/^(\w+)\s*(>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
      if (simple) {
        const [, variable, op, threshold] = simple;
        // ⚠️ 符号→枚举：ComparisonRule['op'] 是 'gt'/'lt'/'eq'（表单下拉
        // 的 option value）。`as` 直塞裸符号 ⇒ select 匹配不上任何项
        // ⇒ 静默显示成第一项（「< 20」同步回表单变「> 20」—— 失败
        // 长得像成功，且数据被改）。
        const opWord = OP_SYMBOL_TO_WORD[op] as ComparisonRule['op'];
        out.push({
          id: `${variable}_${out.length}`,
          variable,
          op: opWord,
          threshold: Number(threshold),
        });
        continue;
      }
      // Range: between(variable, lo, hi) — and its complement
      // not(between(...)) which is the common "alert when OUTSIDE
      // the comfort band" shape (room temp / humidity).
      const range = text.match(
        /^(not\()?between\(\s*(\w+)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)(\)?)$/,
      );
      if (range) {
        const [, negated, variable, lo, hi] = range;
        out.push({
          id: `${variable}_${out.length}`,
          variable,
          op: negated ? 'outside' : 'between',
          threshold: Number(lo),
          high: Number(hi),
        });
        continue;
      }
      // Other shapes: skipped
    }
  }
  return out;
}
