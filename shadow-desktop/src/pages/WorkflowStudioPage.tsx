// 顶叶 Workflow Studio — 工作流编排画布 (R-12/R-13 v1)。
//
// 用户目标：以自然语言或可视化方式编排"低级判别工作流"——
// source(采集/传感器) → transform(变换) → agent(脑叶/外部agent)
// → sink(存储/通知)。本页产出符合 parietal workflow-schema 的
// JSON 描述符，可直接被 iBLOC/parietal 的 workflow-runtime 执行。
//
// 设计哲学（与拒 qiankun 同源）：
// - 零第三方画布依赖（不用 reactflow/dagre，~150KB）——自研
//   pointer-event 拖拽 + SVG 连线，v1 够用且完全可控。
// - 持久化走 localStorage（同名覆盖），导出/导入走 JSON 文本，
//   与 parietal workflow-schema 保持字段一一对应。
//
// 节点四种 (对齐 workflow-schema::Node)：
//   source    采集源（diencephalon sensor / 麦克风 / 相机）
//   transform 变换（过滤/聚合，v1 为 JSON op 透传）
//   agent     脑叶或外部 agent（颞叶=音频 / 枕叶=视觉 / A2A 天工等）
//   sink      输出（feishu_card / diencephalon:archive_clip / 通知）
//
// 连线规则：单向 source→…→sink；环会在导出前被客户端 DFS 拦下
// （与 parietal workflow-schema::validate 的三色 DFS 同规则）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Play, Save, Trash2, Upload, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type NodeKind = 'source' | 'transform' | 'agent' | 'sink'

interface EditorNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  /** kind-specific fields:
   *  source: source, filter[]
   *  agent: lobe, prompt
   *  sink: sink, channel
   *  transform: op (JSON string, v1 透传) */
  config: Record<string, string>
}

interface EditorEdge {
  from: string
  to: string
}

const NODE_W = 176
const NODE_H = 64

const KIND_COLORS: Record<NodeKind, string> = {
  source: 'border-blue-500/60 bg-blue-500/10',
  transform: 'border-amber-500/60 bg-amber-500/10',
  agent: 'border-violet-500/60 bg-violet-500/10',
  sink: 'border-green-500/60 bg-green-500/10',
}

const KIND_LABELS: Record<NodeKind, string> = {
  source: 'Source',
  transform: 'Transform',
  agent: 'Agent',
  sink: 'Sink',
}

function detectCycle(nodes: string[], edges: EditorEdge[]): boolean {
  const adj = new Map<string, string[]>()
  nodes.forEach((n) => adj.set(n, []))
  edges.forEach((e) => adj.get(e.from)?.push(e.to))
  const grey = new Set<string>()
  const black = new Set<string>()
  let cyclic = false
  const visit = (n: string) => {
    if (cyclic || black.has(n)) return
    if (grey.has(n)) {
      cyclic = true
      return
    }
    grey.add(n)
    for (const c of adj.get(n) ?? []) visit(c)
    grey.delete(n)
    black.add(n)
  }
  nodes.forEach((n) => visit(n))
  return cyclic
}

export function WorkflowStudioPage() {
  const { t } = useTranslation()
  const [name, setName] = useState('my-workflow')
  const [nodes, setNodes] = useState<EditorNode[]>([])
  const [edges, setEdges] = useState<EditorEdge[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  // --- localStorage 持久化 ---
  const storageKey = `shadow.workflow.${name}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const data = JSON.parse(raw)
        setNodes(data.nodes ?? [])
        setEdges(data.edges ?? [])
      }
    } catch {
      // 无存档 — 空画布。
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const persist = useCallback(
    (n: EditorNode[], e: EditorEdge[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ nodes: n, edges: e }))
      } catch {
        // 配额满等 — 静默。
      }
    },
    [storageKey],
  )

  const updateAll = useCallback(
    (n: EditorNode[], e: EditorEdge[]) => {
      setNodes(n)
      setEdges(e)
      persist(n, e)
    },
    [persist],
  )

  // --- 节点操作 ---
  const addNode = useCallback(
    (kind: NodeKind) => {
      const id = `${kind}-${Math.random().toString(36).slice(2, 6)}`
      const node: EditorNode = {
        id,
        kind,
        x: 80 + Math.random() * 320,
        y: 80 + Math.random() * 200,
        config:
          kind === 'source'
            ? { source: 'home-mic', filter: '' }
            : kind === 'agent'
              ? { lobe: 'temporal', prompt: '' }
              : kind === 'sink'
                ? { sink: 'feishu_card', channel: '' }
                : { op: '{}' },
      }
      updateAll([...nodes, node], edges)
      setSelected(id)
    },
    [nodes, edges, updateAll],
  )

  const removeNode = useCallback(
    (id: string) => {
      updateAll(
        nodes.filter((n) => n.id !== id),
        edges.filter((e) => e.from !== id && e.to !== id),
      )
      setSelected(null)
      if (connectFrom === id) setConnectFrom(null)
    },
    [nodes, edges, updateAll, connectFrom],
  )

  const updateConfig = useCallback(
    (id: string, key: string, value: string) => {
      updateAll(
        nodes.map((n) =>
          n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n,
        ),
        edges,
      )
    },
    [nodes, edges, updateAll],
  )

  // --- 拖拽 ---
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    const node = nodes.find((n) => n.id === id)
    if (!node || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = {
      id,
      dx: e.clientX - rect.left - node.x,
      dy: e.clientY - rect.top - node.y,
    }
    setSelected(id)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left - drag.dx)
    const y = Math.max(0, e.clientY - rect.top - drag.dy)
    setNodes((prev) =>
      prev.map((n) => (n.id === drag.id ? { ...n, x, y } : n)),
    )
  }

  const onCanvasPointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null
      persist(nodes, edges)
    }
  }, [nodes, edges, persist])

  // --- 连线 ---
  const toggleConnect = useCallback(
    (id: string) => {
      if (!connectFrom) {
        setConnectFrom(id)
        return
      }
      if (connectFrom === id) {
        setConnectFrom(null)
        return
      }
      // 自环 / 重复边拒绝。
      if (
        connectFrom === id ||
        edges.some((e) => e.from === connectFrom && e.to === id)
      ) {
        setConnectFrom(null)
        return
      }
      updateAll([...nodes, ...[]], [...edges, { from: connectFrom, to: id }])
      setConnectFrom(null)
    },
    [connectFrom, edges, nodes, updateAll],
  )

  // --- 校验 + 导出 ---
  const cyclic = useMemo(
    () => detectCycle(nodes.map((n) => n.id), edges),
    [nodes, edges],
  )

  const exportJson = useCallback(() => {
    if (cyclic) {
      setError(t('workflowStudio.errorCycle'))
      return
    }
    const descriptor = {
      name,
      version: 1,
      nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, ...n.config })),
      edges: edges.map((e) => ({ from: e.from, to: e.to })),
    }
    const blob = new Blob([JSON.stringify(descriptor, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.workflow.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setOkMsg(t('workflowStudio.exported', { file: `${name}.workflow.json` }))
  }, [name, nodes, edges, cyclic, t])

  const importJson = useCallback(
    (text: string) => {
      try {
        const data = JSON.parse(text)
        const importedNodes: EditorNode[] = (data.nodes ?? []).map(
          (n: { id: string; kind: NodeKind; [k: string]: unknown }, i: number) => ({
            id: n.id,
            kind: n.kind,
            x: 60 + (i % 4) * 220,
            y: 60 + Math.floor(i / 4) * 140,
            config: Object.fromEntries(
              Object.entries(n).filter(
                ([k]) => !['id', 'kind'].includes(k),
              ),
            ) as Record<string, string>,
          }),
        )
        const importedEdges: EditorEdge[] = (data.edges ?? []).map((e: { from: string; to: string }) => ({
          from: e.from,
          to: e.to,
        }))
        updateAll(importedNodes, importedEdges)
        setOkMsg(t('workflowStudio.imported', { count: importedNodes.length }))
      } catch (e) {
        setError(String(e))
      }
    },
    [updateAll, t],
  )

  const selectedNode = nodes.find((n) => n.id === selected) ?? null

  return (
    <div className="flex h-full flex-col gap-3 p-2">
      {/* 工具栏 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Input
            className="w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workflowStudio.namePlaceholder')}
            data-testid="workflow-name"
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addNode('source')}>
            <Zap className="h-3.5 w-3.5" />{t('workflowStudio.addNodeSource')}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addNode('transform')}>
            {t('workflowStudio.addNodeTransform')}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addNode('agent')}>
            {t('workflowStudio.addNodeAgent')}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addNode('sink')}>
            {t('workflowStudio.addNodeSink')}
          </Button>
          <span className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={exportJson}
            disabled={nodes.length === 0 || cyclic}
            data-testid="workflow-export"
          >
            <Save className="h-3.5 w-3.5" />
            {t('workflowStudio.export')}
          </Button>
          <label>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => importJson(String(reader.result))
                reader.readAsText(f)
              }}
            />
            <span
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-muted"
              data-testid="workflow-import"
            >
              <Upload className="h-3.5 w-3.5" />
              {t('workflowStudio.import')}
            </span>
          </label>
        </CardContent>
      </Card>

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
      {okMsg && (
        <p className="text-xs text-green-600">{okMsg}</p>
      )}
      {cyclic && (
        <p className="text-xs text-destructive">{t('workflowStudio.cycleDetected')}</p>
      )}

      {/* 画布 + 属性面板 */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={canvasRef}
          className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border bg-grid"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          data-testid="workflow-canvas"
        >
          {/* SVG 连线层 */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {edges.map((e) => {
              const a = nodes.find((n) => n.id === e.from)
              const b = nodes.find((n) => n.id === e.to)
              if (!a || !b) return null
              const x1 = a.x + NODE_W
              const y1 = a.y + NODE_H / 2
              const x2 = b.x
              const y2 = b.y + NODE_H / 2
              const mx = (x1 + x2) / 2
              return (
                <g key={`${e.from}->${e.to}`}>
                  <path
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    fill="none"
                    strokeWidth={1.5}
                    markerEnd="url(#arrow)"
                  />
                  {/* 点击删除边的热区 */}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer"
                    onClick={() =>
                      updateAll(
                        nodes,
                        edges.filter((x) => x !== e),
                      )
                    }
                  />
                </g>
              )
            })}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
              </marker>
            </defs>
          </svg>

          {/* 节点卡片 */}
          {nodes.map((n) => (
            <div
              key={n.id}
              className={cn(
                'absolute flex select-none flex-col justify-center rounded-lg border-2 px-3 py-2 text-xs shadow-sm',
                KIND_COLORS[n.kind],
                selected === n.id && 'ring-2 ring-primary',
                connectFrom === n.id && 'ring-2 ring-green-500',
              )}
              style={{ left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H }}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              data-testid={`workflow-node-${n.id}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">{n.id}</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    removeNode(n.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <span className="font-medium">{KIND_LABELS[n.kind]}</span>
              {/* 连线桩：左入右出 */}
              <button
                className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border bg-card hover:bg-primary"
                title={t('workflowStudio.connectOut')}
                onClick={(ev) => {
                  ev.stopPropagation()
                  toggleConnect(n.id)
                }}
              />
              <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border bg-muted" />
            </div>
          ))}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {t('workflowStudio.empty')}
            </div>
          )}
        </div>

        {/* 属性面板 */}
        <Card className="w-72 flex-shrink-0">
          <CardContent className="flex flex-col gap-3 p-4 text-sm">
            <div className="font-medium">{t('workflowStudio.properties')}</div>
            {selectedNode ? (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">id</Label>
                  <div className="font-mono text-xs">{selectedNode.id}</div>
                </div>
                {Object.entries(selectedNode.config).map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1">
                    <Label className="text-[11px] text-muted-foreground">{k}</Label>
                    <Input
                      value={v}
                      onChange={(e) =>
                        updateConfig(selectedNode.id, k, e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive"
                  onClick={() => removeNode(selectedNode.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('workflowStudio.deleteNode')}
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('workflowStudio.noSelection')}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              {t('workflowStudio.connectHint')}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
