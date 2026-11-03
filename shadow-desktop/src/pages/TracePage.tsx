import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Play,
  Pause,
  RotateCcw,
  Download,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useTelencephalonStore } from '../stores/telencephalonStore';

interface TraceEvent {
  event_type: string;
  execution_id: string;
  node_id: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  latency_ms?: number;
  success?: boolean;
  quality_score?: number;
  ts: string;
}

interface TraceNode {
  id: string;
  events: TraceEvent[];
  expanded: boolean;
}

/**
 * 把端脑的 HTTP 基址换成 WebSocket 基址。
 *
 * `http://host:port` → `ws://host:port`；`https://` → `wss://`。
 * ⚠️ 端脑地址在设置里可改 ⇒ 这里**不能**写死 `ws://localhost:60080`
 * （写死 ⇒ 用户改完地址，这页连的还是老地址，与其它页面行为分叉）。
 */
function toWebSocketUrl(httpBase: string): string {
  const base = httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${base.replace(/\/+$/, '')}/api/trace/stream`;
}

export function TracePage() {
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [nodes, setNodes] = useState<Map<string, TraceNode>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const wsRef = useRef<WebSocket | null>(null);
  const tracesEndRef = useRef<HTMLDivElement>(null);
  const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(toWebSocketUrl(baseUrl));
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Trace WebSocket connected');
    };

    ws.onmessage = (event) => {
      if (isPaused) return;
      
      try {
        const trace = JSON.parse(event.data) as TraceEvent;
        setTraces(prev => [...prev, trace]);
        
        setNodes(prev => {
          const next = new Map(prev);
          const existing = next.get(trace.node_id);
          if (existing) {
            next.set(trace.node_id, {
              ...existing,
              events: [...existing.events, trace],
            });
          } else {
            next.set(trace.node_id, {
              id: trace.node_id,
              events: [trace],
              expanded: false,
            });
          }
          return next;
        });
      } catch (e) {
        console.error('Failed to parse trace event:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Trace WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('Trace WebSocket error:', error);
    };
  }, [isPaused, baseUrl]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWebSocket]);

  useEffect(() => {
    tracesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [traces]);

  const toggleNode = (nodeId: string) => {
    setNodes(prev => {
      const next = new Map(prev);
      const node = next.get(nodeId);
      if (node) {
        next.set(nodeId, { ...node, expanded: !node.expanded });
      }
      return next;
    });
  };

  const clearTraces = () => {
    setTraces([]);
    setNodes(new Map());
  };

  const exportTraces = () => {
    const data = JSON.stringify(traces, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traces-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTraces = traces.filter(t => {
    if (filter === 'success') return t.success === true;
    if (filter === 'error') return t.success === false;
    return true;
  });

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'node_start': return <Play size={14} className="text-blue-500" />;
      case 'node_end': return <CheckCircle size={14} className="text-green-500" />;
      case 'flow_end': return <Zap size={14} className="text-yellow-500" />;
      case 'flow_error': return <XCircle size={14} className="text-red-500" />;
      default: return <Activity size={14} className="text-gray-500" />;
    }
  };

  const getSuccessBadge = (success?: boolean) => {
    if (success === undefined) return null;
    return success ? (
      <Badge variant="success" size="sm">成功</Badge>
    ) : (
      <Badge variant="danger" size="sm">失败</Badge>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Activity size={24} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">执行追踪</h1>
            <p className="text-xs text-muted-foreground">实时查看 Flow 执行链路</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-xs text-muted-foreground">
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            icon={isPaused ? <Play size={14} /> : <Pause size={14} />}
          >
            {isPaused ? '继续' : '暂停'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearTraces}
            icon={<RotateCcw size={14} />}
          >
            清空
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportTraces}
            icon={<Download size={14} />}
          >
            导出
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button
          variant={filter === 'all' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          全部 ({traces.length})
        </Button>
        <Button
          variant={filter === 'success' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilter('success')}
        >
          成功 ({traces.filter(t => t.success === true).length})
        </Button>
        <Button
          variant={filter === 'error' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilter('error')}
        >
          失败 ({traces.filter(t => t.success === false).length})
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredTraces.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Activity size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground">等待执行追踪...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(nodes.values()).map((node) => (
              <div key={node.id} className="rounded-lg border border-border bg-card">
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  onClick={() => toggleNode(node.id)}
                >
                  {node.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-mono text-sm font-medium">{node.id}</span>
                  <Badge variant="outline" size="sm">{node.events.length} 事件</Badge>
                  {node.events.some(e => e.success === false) && (
                    <Badge variant="danger" size="sm">有错误</Badge>
                  )}
                </button>
                {node.expanded && (
                  <div className="border-t border-border px-4 py-3">
                    {node.events.map((event, idx) => (
                      <div key={idx} className="flex items-start gap-3 py-2">
                        {getEventIcon(event.event_type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{event.event_type}</span>
                            {getSuccessBadge(event.success)}
                            {event.latency_ms !== undefined && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={12} />
                                {event.latency_ms}ms
                              </span>
                            )}
                          </div>
                          {event.input && (
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
                              {JSON.stringify(event.input, null, 2)}
                            </pre>
                          )}
                          {event.output && (
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
                              {JSON.stringify(event.output, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={tracesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
