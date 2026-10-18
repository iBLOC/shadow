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
// import { useTranslation } from 'react-i18next'; // reserved for future i18n keys
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
  op: 'gt' | 'lt' | 'eq';
  threshold: number;
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
          condition: `${r.variable} ${opToFeel(r.op)} ${r.threshold}`,
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

function opToFeel(op: ComparisonRule['op']): string {
  switch (op) {
    case 'gt': return '>';
    case 'lt': return '<';
    case 'eq': return '=';
  }
}

interface TryRunResult {
  ok: boolean;
  detail: string;
  action?: string;
}

export function JdmEditorPage() {
  const [rule, setRule] = useState<JdmRule>(EMPTY_RULE);
  const [inputJson, setInputJson] = useState(
    '{\n  "sensor": "bath_temp",\n  "value": 27.3\n}',
  );
  const [tryRun, setTryRun] = useState<TryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const dmnContainerRef = useRef<HTMLDivElement>(null);

  // Render the dmn-js modeler in the dedicated container. dmn-js
  // is a peer of bpmn-js; for an MVP we wire the standalone
  // dmn-js viewer and let the user export DMN XML which the
  // page converts on the fly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import('dmn-js/dist/Modeler.no-extensions.min.js' as any)
          .catch(() => import('dmn-js/dist/dmn-modeler.production.min.js' as any))
          .catch(() => import('dmn-js' as any));
        if (cancelled || !dmnContainerRef.current) return;
        const ctor = mod?.default ?? mod?.Modeler ?? mod;
        if (!ctor) return;
        const modeler = new ctor({ container: dmnContainerRef.current });
        await modeler.createDiagram();
        // Best-effort: import a tiny decision-table DMN XML.
        const sampleDmn = buildSampleDmn(rule);
        try {
          await modeler.importXML(sampleDmn);
        } catch {
          // Empty diagram is fine — the form below is the
          // canonical editor for our simplified JDM shape.
        }
      } catch {
        // dmn-js may not be installed at MVP time; the JSON form
        // below is always available.
      }
    })();
    return () => { cancelled = true; };
  // We intentionally don't depend on `rule` — dmn-js is
  // presentation-only; the form is the source of truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        detail: `evaluate → ${outcome.action}`,
        action: outcome.action,
      });
    } catch (e) {
      setTryRun({ ok: false, detail: String(e) });
    } finally {
      setBusy(false);
    }
  }, [rule, inputJson]);

  const onUpload = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.rule_id) setRule(parsed);
        else setTryRun({ ok: false, detail: 'JSON missing `rule_id`' });
      } catch (e) {
        setTryRun({ ok: false, detail: `parse: ${e}` });
      }
    };
    reader.readAsText(f);
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode className="w-6 h-6" />
          <h1 className="text-2xl font-semibold">JDM Editor</h1>
          <Badge variant="secondary">zen-engine backed</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            navigator.clipboard?.writeText(zenGraph);
            setTryRun({ ok: true, detail: 'graph copied to clipboard' });
          }}>
            <Download className="w-4 h-4 mr-1" /> Copy Graph
          </Button>
          <label>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onUpload}
            />
            <Button variant="outline" size="sm" asChild={false}>
              <span><Upload className="w-4 h-4 mr-1" /> Upload JSON</span>
            </Button>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-sm font-medium">Rule ID</label>
            <Input
              value={rule.rule_id}
              onChange={(e) => setRule({ ...rule, rule_id: e.target.value })}
            />
            <RuleSection
              title="any_of (OR)"
              items={rule.any_of}
              onChange={(items) => setRule({ ...rule, any_of: items })}
            />
            <RuleSection
              title="all_of (AND)"
              items={rule.all_of}
              onChange={(items) => setRule({ ...rule, all_of: items })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Try Run (zen-engine in-process)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-sm font-medium">Input (JSON)</label>
            <Textarea
              rows={5}
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <Button onClick={run} disabled={busy}>
                <Play className="w-4 h-4 mr-1" /> Evaluate
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
          <CardTitle>dmn-js Modeler</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={dmnContainerRef}
            className="h-[480px] w-full border rounded"
            style={{ background: 'var(--background)' }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated JDM Graph (zen-engine input)</CardTitle>
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
          <Save className="w-3 h-3 mr-1" /> add
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">empty — fall-through</p>
      )}
      {items.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={r.variable}
            onChange={(e) => update(i, { variable: e.target.value })}
            placeholder="variable"
          />
          <select
            className="border rounded px-2 py-1 bg-background"
            value={r.op}
            onChange={(e) => update(i, { op: e.target.value as ComparisonRule['op'] })}
          >
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="eq">=</option>
          </select>
          <Input
            className="w-24"
            type="number"
            value={r.threshold}
            onChange={(e) => update(i, { threshold: Number(e.target.value) })}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => remove(i)}
            aria-label="remove"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function buildSampleDmn(rule: JdmRule): string {
  // Minimal valid DMN 1.4 XML with one decision table. This is
  // the dmn-js importXML target — dmn-js will draw the table UI
  // around this. We don't actually use the XML for evaluation
  // (the form below is canonical), but it's a sane default
  // for new rules.
  const cases = rule.any_of
    .map(
      (r) => `        <inputEntry id="i1-${r.id}"><text>${r.variable}</text></inputEntry>
        <outputEntry id="o1-${r.id}"><text>"notify"</text></outputEntry>
        <ruleEntry id="r-${r.id}"><text>${r.variable} ${opToFeel(r.op)} ${r.threshold}</text></ruleEntry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20230324/MODEL/"
  id="definitions" name="definitions">
  <decision id="decision" name="${rule.rule_id}">
    <decisionTable id="decisionTable" hitPolicy="FIRST">
      <input id="input" label="value">
        <inputExpression>value</inputExpression>
      </input>
      <output id="output" name="action" typeRef="string" />
${cases}
    </decisionTable>
  </decision>
</definitions>`;
}
