// 记录模式 — /document/:taskId 页面数据展示。
//
// v1 使用纯 HTML 表格展示 task 事件数据（不依赖 Univer——
// @univerjs/presets 0.6.10 的 API 需要在真实浏览器里验证后接入）。
// 数据来源：recording_events 命令（同 RecordingPage 的数据源）。
// 后续版本接入 Univer 表格编辑 + 飞书发布。

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface RecordingEvent {
  id: string;
  session_id: string;
  event_type: 'audio' | 'video';
  start_rel_ms: number;
  end_rel_ms: number;
  content: string;
  person_ids: string[];
  confidence: number;
}

interface SummaryReport {
  id: string;
  session_id: string;
  text: string;
  person_names: string[];
  event_count: number;
  time_range: [number, number];
}

export function DocumentPage() {
  const { taskId = '' } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    invoke<RecordingEvent[]>('recording_events', { sessionId: taskId })
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
    invoke<SummaryReport | null>('recording_report', { sessionId: taskId })
      .then(setReport)
      .catch(() => {});
  }, [taskId]);

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        missing task id
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="font-mono text-sm font-medium">{taskId}</span>
      </div>

      {/* 总结报告 */}
      {report && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-green-500" />
            Summary Report
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm">{report.text}</pre>
          <div className="mt-2 text-xs text-muted-foreground">
            {report.event_count} events · {report.person_names.join(', ') || 'no participants'}
          </div>
        </div>
      )}

      {/* 事件表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            No events recorded for this session.
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Content</th>
                <th className="px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      e.event_type === 'audio' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'
                    )}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {fmtTime(e.start_rel_ms)}–{fmtTime(e.end_rel_ms)}
                  </td>
                  <td className="px-3 py-2">{e.content}</td>
                  <td className="px-3 py-2 font-mono text-xs">{(e.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}