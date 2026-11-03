import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Server, Cpu, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { readDoorHeaders } from '../lib/readDoorHeaders';
import { telencephalonClient } from '../lib/telencephalonClient';
import { useTelencephalonStore } from '../stores/telencephalonStore';

interface TelencephalonStatus {
  neuron_reachable: boolean;
  actual_models_count: number;
  available_models: Array<{
    id: string;
    engine?: string;
    available?: boolean;
  }>;
  info: Record<string, unknown> | null;
  hint: string;
}

interface TelencephalonLogs {
  log_path: string;
  line_count: number;
  lines: string[];
}

export function TelencephalonStatusPage() {
  const { t } = useTranslation();
  // ⚠️ **不要写死 `localhost:60080`** —— 端脑地址在设置里可改（`setBaseUrl`），
  // 写死会让这一页与其它所有页面**行为分叉**：用户改完地址，这页还打老地址。
  // ⚠️ 但也别把「端口会变」当理由 —— 桌面端 sidecar 的默认端口**就是** 60080
  // （`src-tauri/src/telencephalon_http.rs` `DEFAULT_ADDR`，有测试钉住）。
  const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);
  const [status, setStatus] = useState<TelencephalonStatus | null>(null);
  const [logs, setLogs] = useState<TelencephalonLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'logs'>('status');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ⚠️ 路径前缀是 `/api/telencephalon/*`（**不是** `/api/cortex/*`）——
      // 服务端早已改名，旧的 `/api/cortex/*` 路由**根本不存在** ⇒ 这一页
      // 以前一直 404，只是没人注意到（页面把错误显示成一行灰字）。
      const resp = await fetch(`${baseUrl}/api/telencephalon/status`, {
        // ⚠️ 读门 = **影子锁 ∪ admin token** ⇒ 两把都递。
        // ⚠️ 这一页打的地址取自 store ⇒ 而 store 的 `setBaseUrl`/`setApiKey`
        // **同步给 client** ⇒ ⇒ 这里就是 client 那张面 ⇒ 递它的影子锁没跑偏。
        headers: await readDoorHeaders(telencephalonClient.getApiKey()),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${baseUrl}/api/telencephalon/logs`, {
        // ⚠️ 读门 = **影子锁 ∪ admin token** ⇒ 两把都递。
        // ⚠️ 这一页打的地址取自 store ⇒ 而 store 的 `setBaseUrl`/`setApiKey`
        // **同步给 client** ⇒ ⇒ 这里就是 client 那张面 ⇒ 递它的影子锁没跑偏。
        headers: await readDoorHeaders(telencephalonClient.getApiKey()),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Server size={20} />
            {t('telencephalonStatus.title', '端脑内部状态')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('telencephalonStatus.subtitle', '查看端脑服务、neuron 推理引擎和叶区的运行状态')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={activeTab === 'status' ? fetchStatus : fetchLogs}
            disabled={loading}
            icon={<RefreshCw size={16} className={cn(loading && 'animate-spin')} />}
          >
            {t('common.refresh', '刷新')}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('status')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'status'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('telencephalonStatus.tabStatus', '状态')}
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'logs'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('telencephalonStatus.tabLogs', '日志')}
        </button>
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="text-red-500" size={20} />
            <div>
              <div className="text-sm font-medium text-foreground">
                {t('telencephalonStatus.connectionError', '无法连接到端脑')}
              </div>
              <div className="text-xs text-muted-foreground">{error}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t(
                  'telencephalonStatus.connectionHint',
                  '端脑应该在 {{url}} 运行。如果未运行，请检查 Tauri 是否正确启动了端脑的 HTTP 面。',
                  { url: baseUrl }
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'status' && status && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={18} className="text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">
                  {t('telencephalonStatus.neuronSection', 'Neuron 推理引擎')}
                </h2>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('telencephalonStatus.neuronReachable', '可访问')}
                  </span>
                  {status.neuron_reachable ? (
                    <Badge variant="default" className="bg-green-500/20 text-green-500">
                      <CheckCircle size={12} className="mr-1" />
                      OK
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle size={12} className="mr-1" />
                      {t('telencephalonStatus.unreachable', '不可达')}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('telencephalonStatus.actualModels', '已注册模型数')}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {status.actual_models_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('telencephalonStatus.availableModels', '可用模型数')}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {status.available_models.length}
                  </span>
                </div>
              </div>
              {status.actual_models_count === 0 && (
                <div className="mt-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                  <div className="text-sm font-medium text-yellow-600">
                    {t('telencephalonStatus.noModelWarning', '⚠️ 没有已注册的 LLM 模型')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {status.hint}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {status.available_models.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-medium text-foreground mb-3">
                  {t('telencephalonStatus.availableModelsList', '可用模型')}
                </h2>
                <div className="space-y-1">
                  {status.available_models.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="text-sm font-mono text-foreground">{m.id}</span>
                      {m.engine && (
                        <Badge variant="secondary">{m.engine}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {status.info && Object.keys(status.info).length > 0 && (
            <Card className="md:col-span-2">
              <CardContent className="p-4">
                <h2 className="text-sm font-medium text-foreground mb-3">
                  {t('telencephalonStatus.neuronInfo', 'Neuron 详细信息')}
                </h2>
                <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md overflow-x-auto">
                  {JSON.stringify(status.info, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <FileText size={16} className="text-muted-foreground" />
              <span className="text-sm text-foreground">
                {logs?.log_path || 'loading...'}
              </span>
              {logs && (
                <Badge variant="secondary">
                  {logs.line_count} {t('telencephalonStatus.lines', '行')}
                </Badge>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
              {logs?.lines.map((line, i) => (
                <div
                  key={i}
                  className="text-muted-foreground hover:text-foreground whitespace-pre-wrap break-all"
                >
                  {line}
                </div>
              ))}
              {(!logs || logs.lines.length === 0) && (
                <div className="text-center text-muted-foreground py-8">
                  {t('telencephalonStatus.noLogs', '暂无日志')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}