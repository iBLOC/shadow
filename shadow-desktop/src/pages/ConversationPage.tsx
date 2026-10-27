import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { telencephalonClient } from '../lib/telencephalonClient';
import { computeTokenStats } from '../lib/tokenStats';
import { useConversationStore } from '../stores/conversationStore';
import { useChatDisplayStore } from '../stores/chatDisplayStore';
import { useCompanionModeStore } from '../stores/companionModeStore';
import { WakeWordDetector } from '../lib/wakeWordDetector';
import { Button, EmptyState } from '../components/ui';
import { VoiceButton } from '../components/ui/voice-button';
import { MoveSessionDialog } from '../components/MoveSessionDialog';
import { ChartCard } from '../components/chatbi';
import { VisualQaClarificationChip } from '../components/chat/VisualQaClarificationChip';
import { FeishuPublishedCard } from '../components/chat/FeishuPublishedCard';
import { AudioEventChip } from '../components/chat/AudioEventChip';
import { ComputerUsePendingModal, type ComputerUseAction } from '../components/computerUse/ComputerUsePendingModal';
import { RecordingPanel } from '../components/recording/RecordingPanel';
import { isChatBiPayload } from '../lib/chatbi/guards';
import type { ChatBiPayload } from '../lib/chatbi/guards';
import type { Conversation, ConversationKind, Message, RecordingMode, VisualQaClarification } from '../types';
import {
  Send,
  Plus,
  Trash2,
  Bot,
  User,
  Search,
  MessageSquare,
  Sparkles,
  Mic,
  Video,
  ArrowRightLeft,
  Paperclip,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

interface StagedImage {
  id: string;
  dataUrl: string;
  file: File;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ConversationPage() {
  const { t } = useTranslation();
  const {
    conversations,
    activeConversationId,
    addConversation,
    removeConversation,
    updateConversation,
    setActiveConversation,
    addMessage,
    updateMessage,
    setSessionId,
  } = useConversationStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // R-11 — computer-use preview-before-commit state. Modal lifecycle is
  // decoupled from message stream so a Cancel clears without re-rendering.
  // The setter is set from the assistant SSE handler at line ~176 and the
  // pending value feeds the page-level modal at line ~520.
  const [pendingCuAction, setPendingCuAction] = useState<import('../components/computerUse/ComputerUsePendingModal').ComputerUseAction | null>(null);
  // Settings → UI "Token 统计" toggle — when on, each assistant reply gets
  // a live token-count / speed line under its bubble.
  const showTokenStats = useChatDisplayStore((s) => s.showTokenStats);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // + 三选一弹层：点击外部 / Esc 关闭。
  useEffect(() => {
    if (!showCreateMenu) return;
    const onClick = (e: MouseEvent) => {
      if (
        createMenuRef.current &&
        e.target instanceof Node &&
        !createMenuRef.current.contains(e.target)
      ) {
        setShowCreateMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showCreateMenu]);

  // 启动时从后端拉 recording 会话，补齐 store 中尚未存在的项。
  // 这是 /recording 页面被吸收进来的关键：历史录音会话要继续出现在统一收件箱里。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await invoke<
          Array<{
            id: string;
            mode: RecordingMode;
            started_at: string;
            ended_at: string | null;
            wallclock_start_ms: number;
          }>
        >('recording_list');
        const knownIds = new Set(conversations.map((c) => c.id));
        for (const s of list) {
          if (cancelled) break;
          if (knownIds.has(s.id)) continue;
          const kind: ConversationKind = s.mode === 'audio' ? 'audio' : 'video';
          addConversation({
            id: s.id,
            kind,
            title:
              kind === 'audio'
                ? t('conversation.audioSessionFallback', { defaultValue: '语音会话' })
                : t('conversation.videoSessionFallback', { defaultValue: '视频会话' }),
            messages: [],
            createdAt: new Date(s.started_at),
            updatedAt: new Date(s.started_at),
            recordingStartedAt: s.started_at,
            recordingEndedAt: s.ended_at,
            recordingWallclockStartMs: s.wallclock_start_ms,
          });
        }
      } catch {
        // 后端未就绪 — 忽略，统一收件箱可后续手动 + 出来。
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅启动一次；后续流式事件由 RecordingPanel 内部轮询处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewConversation = () => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      kind: 'text',
      title: t('conversation.newChat'),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addConversation(conversation);
  };

  /** + 三选一弹层中语音/视频的回调。直接调 `recording_start` 写入后端，
   *  把返回的 bookkeeping 落到 conversation store；AI 不参与（record-only）。 */
  const handleCreateRecording = async (mode: RecordingMode) => {
    setShowCreateMenu(false);
    try {
      const s = await invoke<{
        id: string;
        mode: RecordingMode;
        started_at: string;
        ended_at: string | null;
        wallclock_start_ms: number;
      }>('recording_start', { mode });
      const conversation: Conversation = {
        id: s.id,
        kind: mode === 'audio' ? 'audio' : 'video',
        title:
          mode === 'audio'
            ? t('conversation.newAudioTitle', { defaultValue: '语音会话' })
            : t('conversation.newVideoTitle', { defaultValue: '视频会话' }),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        recordingStartedAt: s.started_at,
        recordingEndedAt: s.ended_at,
        recordingWallclockStartMs: s.wallclock_start_ms,
      };
      addConversation(conversation);
    } catch (e) {
      console.error('recording_start failed', e);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
      if (file.size > MAX_IMAGE_SIZE) continue;
      const dataUrl = await fileToDataUrl(file);
      setStagedImages(prev => [...prev, { id: crypto.randomUUID(), dataUrl, file }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (id: string) => {
    setStagedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && stagedImages.length === 0) || !activeConversationId) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    addMessage(activeConversationId, userMessage);
    setInput('');
    setStagedImages([]);
    setIsLoading(true);

    try {
      const conversation = conversations.find(c => c.id === activeConversationId);
      let conversationId = conversation?.sessionId;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!conversationId || attempt > 0) {
            const newConv = await telencephalonClient.createConversation({});
            conversationId = newConv.id;
            setSessionId(activeConversationId, conversationId);
          }

          let accumulated = '';
          let chatbiPayload: ChatBiPayload | undefined;
          let visualQaClarification: VisualQaClarification | undefined;
          // Local engines stream slowly (seconds per token on CPU) —
          // render the reply incrementally instead of only after the
          // stream ends, which looked like a hung app.
          let streamingId: string | null = null;
          // Token-stats window opens at the first streamed delta so the
          // speed measures generation, not connection setup.
          let firstDeltaAt: number | null = null;
          const liveStats = () =>
            showTokenStats
              ? computeTokenStats(accumulated, firstDeltaAt ?? Date.now())
              : undefined;
          for await (const event of telencephalonClient.streamMessage(conversationId, { text: input })) {
            if (event.type === 'delta' && event.delta) {
              accumulated += event.delta;
              if (firstDeltaAt === null) firstDeltaAt = Date.now();
              if (!streamingId) {
                streamingId = crypto.randomUUID();
                addMessage(activeConversationId, {
                  id: streamingId,
                  role: 'assistant',
                  content: event.delta,
                  timestamp: new Date(),
                  token_stats: liveStats(),
                });
              } else {
                updateMessage(activeConversationId, streamingId, {
                  content: accumulated,
                  token_stats: liveStats(),
                });
              }
            } else if (event.type === 'clarification' && event.clarification) {
              // The telencephalon wire does not yet emit 'clarification'
              // events; this branch is a desktop-side hook for a future
              // visual-QA clarification flow. Cast through unknown.
              visualQaClarification = event.clarification as
                | VisualQaClarification
                | undefined;
            } else if (event.type === 'audio_event' && event.audio) {
              // BC-01..05 — surface the audio event as its own
              // message so it appears as a distinct chip in the
              // chat stream rather than text the agent reacted to.
              addMessage(activeConversationId, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: new Date(event.timestamp ?? Date.now()),
                audio_event: {
                  classId: event.audio.classId,
                  confidence: event.audio.confidence,
                  source: event.audio.source,
                  timestamp: event.timestamp,
                },
              });
            } else if (event.type === 'computer_use_action' && event.computerUse) {
              // R-11 — surface the proposed action as a modal
              // outside the message stream so the user gets a
              // blocking Proceed / Cancel dialog. The modal maps the
              // SSE event to the corresponding cu_* Tauri command on
              // confirm; Cancel just clears state.
              const cu = event.computerUse;
              let action: ComputerUseAction | null = null;
              if (cu.action === 'mouse_click' && cu.x != null && cu.y != null && cu.button != null) {
                action = { kind: 'mouse_click', x: cu.x, y: cu.y, button: cu.button };
              } else if (cu.action === 'mouse_move' && cu.x != null && cu.y != null) {
                action = { kind: 'mouse_move', x: cu.x, y: cu.y };
              } else if (cu.action === 'keyboard_type' && cu.text != null) {
                action = { kind: 'keyboard_type', text: cu.text };
              } else if (cu.action === 'keyboard_combo' && cu.combo != null) {
                action = { kind: 'keyboard_combo', combo: cu.combo };
              }
              if (action) setPendingCuAction(action);
            } else if (event.type === 'done') {
              if (accumulated.trim().startsWith('{')) {
                try {
                  const parsed = JSON.parse(accumulated);
                  if (isChatBiPayload(parsed)) {
                    chatbiPayload = parsed;
                  }
                } catch {
                  // not JSON — keep as plain text
                }
              }
              break;
            } else if (event.type === 'error') {
              throw new Error(event.error || 'cortex stream error');
            }
          }

          const finalContent = chatbiPayload
            ? t('conversation.chatbi.chartTitle', {
                sql: chatbiPayload.sql_executed,
                ms: chatbiPayload.took_ms,
              })
            : accumulated || t('conversation.noResponse');
          // Final token-stats snapshot now that the stream has closed.
          const finalStats = (() => {
            if (!showTokenStats) return undefined;
            // For ChatBI payloads the "reply" is the chart title, not the
            // streamed text — only compute stats when we have a real
            // stream window.
            if (chatbiPayload || firstDeltaAt === null) return undefined;
            return computeTokenStats(accumulated, firstDeltaAt);
          })();
          if (streamingId) {
            // The streaming bubble already exists — finalize it.
            updateMessage(activeConversationId, streamingId, {
              content: finalContent,
              chatbi: chatbiPayload,
              visual_qa_clarification: visualQaClarification,
              token_stats: finalStats ?? liveStats(),
            });
          } else {
            addMessage(activeConversationId, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: finalContent,
              timestamp: new Date(),
              chatbi: chatbiPayload,
              visual_qa_clarification: visualQaClarification,
              token_stats: finalStats,
            });
          }
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorStr = String(error).toLowerCase();
          const isSessionError =
            errorStr.includes('session') ||
            errorStr.includes('not found') ||
            errorStr.includes('invalid') ||
            errorStr.includes('expired') ||
            errorStr.includes('conversation');

          if (isSessionError && attempt === 0) {
            setSessionId(activeConversationId, '');
            conversationId = undefined;
            continue;
          }
          break;
        }
      }

      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('conversation.error', { error: lastError?.message || 'Unknown error' }),
        timestamp: new Date(),
      };
      addMessage(activeConversationId, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-lg border border-border bg-card">
      {/* Sidebar */}
      <aside className="flex w-[280px] flex-shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{t('conversation.title')}</h3>
          <div className="relative" ref={createMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={18} />}
              onClick={() => setShowCreateMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={showCreateMenu}
              data-testid="conversation-new-button"
            />
            {showCreateMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setShowCreateMenu(false);
                    handleNewConversation();
                  }}
                  data-testid="conversation-new-text"
                >
                  <MessageSquare size={14} className="text-muted-foreground" />
                  <span className="flex-1">{t('conversation.newTextChat')}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('conversation.newDefaultBadge', { defaultValue: '默认' })}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void handleCreateRecording('audio')}
                  data-testid="conversation-new-audio"
                >
                  <Mic size={14} className="text-muted-foreground" />
                  <span className="flex-1">{t('conversation.newAudioChat')}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void handleCreateRecording('video')}
                  data-testid="conversation-new-video"
                >
                  <Video size={14} className="text-muted-foreground" />
                  <span className="flex-1">{t('conversation.newVideoChat')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative p-3">
          <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('conversation.searchPlaceholder')}
            className="w-full rounded-md border border-border bg-muted py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredConversations.length === 0 ? (
            <EmptyState icon={<MessageSquare size={24} />} title={t('conversation.noConversations')} size="sm" />
          ) : (
            filteredConversations.map((conv) => {
              const kind = conv.kind ?? 'text';
              const meta =
                kind === 'audio'
                  ? t('conversation.audioMeta')
                  : kind === 'video'
                    ? t('conversation.videoMeta')
                    : `${conv.messages.length} ${t('conversation.messages')}`;
              return (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex cursor-pointer items-center gap-3 rounded-md p-3 transition-colors hover:bg-muted',
                    activeConversationId === conv.id && 'bg-foreground/10'
                  )}
                  onClick={() => setActiveConversation(conv.id)}
                  data-testid={`conversation-item-${kind}`}
                >
                  {kind === 'audio' ? (
                    <Mic size={16} className="flex-shrink-0 text-muted-foreground" />
                  ) : kind === 'video' ? (
                    <Video size={16} className="flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <MessageSquare size={16} className="flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{conv.title}</span>
                    <span className="text-xs text-muted-foreground">{meta}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); removeConversation(conv.id); }}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        {activeConversation ? (
          activeConversation.kind === 'audio' || activeConversation.kind === 'video' ? (
            <RecordingPanel
              session={activeConversation}
              onSessionChange={(id, updates) => updateConversation(id, updates)}
            />
          ) : (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
              {activeConversation.messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                    <Sparkles size={48} />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">{t('conversation.welcome')}</h2>
                  <p className="max-w-md text-sm text-muted-foreground">{t('conversation.welcomeDesc')}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setInput(t('conversation.helpWithTask'))}>
                      {t('conversation.helpWithTask')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setInput(t('conversation.whatCanYouDo'))}>
                      {t('conversation.whatCanYouDo')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setInput(t('conversation.showMyAgents'))}>
                      {t('conversation.showMyAgents')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {activeConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex max-w-[80%] gap-3',
                        msg.role === 'user' && 'self-end flex-row-reverse'
                      )}
                    >
                      <div className={cn(
                        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white',
                        msg.role === 'user' ? 'bg-primary' : 'bg-muted-foreground'
                      )}>
                        {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                      </div>
                      <div className="flex flex-col gap-1">
                        {msg.chatbi ? (
                          <ChartCard
                            vizType={msg.chatbi.viz_type}
                            columns={msg.chatbi.columns}
                            rows={msg.chatbi.rows}
                            title={msg.content}
                            className="max-w-full"
                          />
                        ) : msg.audio_event ? (
                          <AudioEventChip
                            classId={msg.audio_event.classId}
                            confidence={msg.audio_event.confidence}
                            source={msg.audio_event.source}
                            timestamp={msg.audio_event.timestamp}
                          />
                        ) : msg.visual_qa_clarification ? (
                          <VisualQaClarificationChip
                            clarification={msg.visual_qa_clarification}
                            onPick={(c) => {
                              if (!activeConversationId) return;
                              addMessage(activeConversationId, {
                                id: crypto.randomUUID(),
                                role: 'user',
                                content: t('conversation.visualQa.picked', {
                                  label: c.deviceLabel,
                                }),
                                timestamp: new Date(),
                              });
                              setInput(`${c.sourceId} ${c.deviceLabel}`);
                              setTimeout(() => {
                                void handleSendMessage();
                              }, 0);
                            }}
                          />
                        ) : msg.feishu_published ? (
                          <FeishuPublishedCard data={msg.feishu_published} />
                        ) : (
                          <div className={cn(
                            'whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-relaxed',
                            msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground'
                          )}>
                            {msg.content}
                          </div>
                        )}
                        <div className={cn(
                          'flex items-center gap-2 px-2 text-xs text-muted-foreground',
                          msg.role === 'user' && 'flex-row-reverse text-right'
                        )}>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {showTokenStats && msg.token_stats && msg.role === 'assistant' && (
                            <span
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
                              data-testid="token-stats"
                              title={t('conversation.tokenStats.tooltip', {
                                tokens: msg.token_stats.tokens,
                                seconds: (msg.token_stats.durationMs / 1000).toFixed(2),
                              })}
                            >
                              {t('conversation.tokenStats.summary', {
                                tokens: msg.token_stats.tokens,
                                speed: msg.token_stats.tokensPerSecond.toFixed(1),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex max-w-[80%] gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted-foreground text-white">
                        <Bot size={20} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="rounded-lg border border-border bg-card px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.2s]" />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.4s]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <CompanionModePanel />

            {activeConversationId && (
              <div className="flex justify-end px-4 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowRightLeft size={16} />}
                  onClick={() => setShowMoveDialog(true)}
                >
                  {t('common.migrate.title')}
                </Button>
              </div>
            )}

            <MoveSessionDialog
              open={showMoveDialog}
              sessionId={activeConversationId}
              messageCount={0}
              onClose={() => setShowMoveDialog(false)}
              onMigrated={(newId, peerName) => {
                console.log('Session migrated to', peerName, 'as', newId);
              }}
            />

            <div className="border-t border-border bg-card p-4">
              {stagedImages.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto px-4 py-2">
                  {stagedImages.map(img => (
                    <div key={img.id} className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded">
                      <img src={img.dataUrl} alt="preview" className="h-full w-full object-cover" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-0.5 top-0.5 h-[18px] w-[18px] min-w-0 rounded-full bg-black/60 p-0 text-white hover:bg-black/80"
                        onClick={() => handleRemoveImage(img.id)}
                        aria-label={t('common.delete')}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  onChange={handleImageSelect}
                  className="hidden"
                  multiple
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Paperclip size={18} />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                />
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={t('conversation.placeholder')}
                  rows={1}
                  className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
                />
                <VoiceButton
                  onTranscription={(text) => setInput(prev => prev ? `${prev} ${text}` : text)}
                  onError={(error) => console.error('Voice error:', error)}
                  disabled={isLoading}
                />
                <Button
                  variant="primary"
                  icon={<Send size={18} />}
                  onClick={handleSendMessage}
                  disabled={(!input.trim() && stagedImages.length === 0) || isLoading}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {t('conversation.pressEnter')}, {t('conversation.shiftEnterForNewLine')}
              </p>
            </div>
          </>
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <MessageSquare size={64} className="opacity-50" />
            <h3 className="text-lg font-medium text-foreground">{t('conversation.selectOrCreate')}</h3>
            <Button variant="primary" icon={<Plus size={18} />} onClick={handleNewConversation}>
              {t('conversation.newChat')}
            </Button>
          </div>
        )}
      </main>
      {/* R-11 — page-level preview-before-commit modal for
          computer-use actions. The modal lifecycle is independent
          of the message stream so it can block (Cancel clears the
          pending state without re-running the message render). */}
      <ComputerUsePendingModal
        action={pendingCuAction}
        onResolved={() => setPendingCuAction(null)}
      />
    </div>
  );
}

function CompanionModePanel() {
  const { t } = useTranslation();
  const {
    phase,
    transcript,
    partialTranscript,
    error,
    turnCount,
    isActive,
    wakeWordDetected,
    start,
    setWakeWordDetected,
  } = useCompanionModeStore();

  // DOC-03 / R-11 — the page-level `<ComputerUsePendingModal>` (in the parent
  // `ConversationPage` render) owns `pendingCuAction`. This panel only needs
  // to surface Feishu publish events into the active conversation, so we
  // pull just `activeConversationId` + `addMessage` from the store.
  const { activeConversationId, addMessage } = useConversationStore();

  const [wakeDetector] = useState(() => new WakeWordDetector());

  // DOC-03 share-URL card listener. DocumentPage fires a
  // window CustomEvent when a publish completes; we surface the URL
  // as a message in the current conversation so the user sees the
  // Feishu link next to the chat that asked for the publish.
  // `taskId` on the event detail disambiguates which conversation
  // (and within a task board) the card belongs to.
  useEffect(() => {
    function onFeishuPublished(ev: Event) {
      const detail = (ev as CustomEvent<{
        taskId: string;
        url: string;
        title?: string;
      }>).detail;
      if (!detail || !detail.taskId || !detail.url) return;
      if (!activeConversationId) return;
      const title =
        detail.title?.trim() || detail.taskId;
      addMessage(activeConversationId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('feishuPublished.messageContent', { title }),
        timestamp: new Date(),
        feishu_published: {
          taskId: detail.taskId,
          title,
          url: detail.url,
        },
      });
    }
    window.addEventListener('shadow:feishu-published', onFeishuPublished);
    return () => {
      window.removeEventListener('shadow:feishu-published', onFeishuPublished);
    };
  }, [activeConversationId, addMessage, t]);

  useEffect(() => {
    if (!wakeDetector.available) return;

    const unsubscribe = wakeDetector.onWakeWord((event) => {
      console.log('Wake word detected:', event.word);
      setWakeWordDetected(true);

      if (!isActive) {
        start();
      }

      setTimeout(() => setWakeWordDetected(false), 3000);
    });

    wakeDetector.start();

    return () => {
      unsubscribe();
      wakeDetector.stop();
    };
  }, [wakeDetector, isActive, start, setWakeWordDetected]);

  const phaseLabel = (() => {
    switch (phase) {
      case 'connecting': return t('common.connecting');
      case 'listening': return t('conversation.companion.listening');
      case 'speaking': return t('conversation.companion.speaking');
      case 'processing': return t('conversation.companion.processing');
      case 'barge_in': return t('conversation.companion.bargeIn');
      case 'error': return error || t('conversation.companion.connectError');
      default: return wakeWordDetected 
        ? t('conversation.companion.wakeWordDetected')
        : t('conversation.companion.listeningForWakeWord');
    }
  })();

  const phaseDotClass = (() => {
    switch (phase) {
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'listening':
      case 'speaking': return 'bg-blue-500';
      case 'processing': return 'bg-yellow-500 animate-pulse';
      case 'barge_in': return 'bg-purple-500';
      case 'error': return 'bg-red-500';
      default: return wakeWordDetected ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground';
    }
  })();

  return (
    <div className={cn(
      'mx-4 mb-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2.5 transition-colors',
      phase === 'speaking' && 'border-foreground',
      phase === 'error' && 'border-red-500',
      phase === 'processing' && 'border-yellow-500',
      phase === 'barge_in' && 'border-purple-500',
      wakeWordDetected && 'border-green-500'
    )}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted">
        <Mic size={20} className={wakeWordDetected ? 'text-green-500' : 'text-muted-foreground'} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', phaseDotClass)} />
        <span className="truncate text-sm text-foreground">{phaseLabel}</span>
        {isActive && turnCount > 0 && (
          <span className="ml-auto rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('conversation.companion.turnCount', { count: turnCount })}
          </span>
        )}
      </div>
      {(transcript || partialTranscript) && (
        <div className="mt-1.5 w-full border-t border-border pt-2 text-sm text-muted-foreground">
          {transcript}
          {partialTranscript && <em className="italic text-muted-foreground/60"> {partialTranscript}</em>}
        </div>
      )}
    </div>
  );
}
