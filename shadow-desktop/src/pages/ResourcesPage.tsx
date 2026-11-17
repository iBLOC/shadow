/**
 * 资源管理 —— 桌面端页面。
 *
 * ## 这一页管什么
 *
 * 用户自己的**文件与产物**：列出来、搜出来、传上去、取回来、改名字、删掉。
 * 字节住在对象存储，可检索的那一份住在海马体的索引面（见
 * `lib/documentsClient.ts`）。
 *
 * ## 两条不许省的纪律
 *
 * ⚠️ **读不到 ≠ 没有**（承 MemoryPage 那一格）—— 海马体没挂、门没开、
 * 端脑不在线 ⇒ ⇒ 那是**读失败**，不是「这里空空的」⇒ ⇒ 两者**不许同屏**
 * （同屏 ⇒ ⇒ 用户分不清「这台大脑没挂」与「这里确实没有」）。
 *
 * ⚠️ **删除的回包有三件事实** —— 索引行删了没、字节删了没、字节为什么没删。
 * ⇒ ⇒ 「索引删了、字节还在」**不是成功** ⇒ ⇒ 那一条必须走错误通道说出来，
 * 不许混进「已删除」那一句里。
 *
 * ## 这一刀还没做的（别当成做了）
 *
 * · **落盘**：桌面端没有 fs/dialog 插件 ⇒ ⇒ 下载走的是浏览器下载通道
 *   （Blob URL ＋ anchor），不是「选个目录存进去」。
 * · **按 kind 过滤**：服务端 `metadata.kind` 是自由词表，过滤还在后面。
 * · **PDF/DOCX 抽取**：服务端目前只做 UTF-8 预览 ⇒ ⇒ 二进制文件只能
 *   **按名字**搜到（行里会如实标 `extracted: false`）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  FileText,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { EmptyState } from '../components/ui/empty-state';
import {
  documentsClient,
  type ResourceDocument,
  type ResourceSearchHit,
} from '../lib/documentsClient';
import { useIdentityStore } from '../stores/identityStore';

/** 字节数 → 人看得懂的字符串（不进 i18n —— 单位是通用的）。 */
function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** 一条命中（两个通道都用这一个形状画，但**分开标通道**）。 */
function HitRow({
  hit,
  onDownload,
  disabled,
}: {
  hit: ResourceSearchHit;
  onDownload: (doc: ResourceDocument) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const doc = hit.document;
  return (
    <li
      className="flex items-center gap-3 py-2"
      data-testid={`resource-hit-${hit.channel}-${doc.id}`}
    >
      <FileText size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{doc.name}</span>
      <span className="text-xs text-muted-foreground">
        {t(`resources.channel.${hit.channel}`)}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {hit.score.toFixed(3)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onDownload(doc)}
        data-testid={`resource-hit-download-${doc.id}`}
      >
        <Download size={13} />
        {t('resources.download')}
      </Button>
    </li>
  );
}

export function ResourcesPage() {
  const { t } = useTranslation();
  const tenantId = useIdentityStore((s) => s.tenantId);

  const [documents, setDocuments] = useState<ResourceDocument[]>([]);
  const [keywordHits, setKeywordHits] = useState<ResourceSearchHit[]>([]);
  const [vectorHits, setVectorHits] = useState<ResourceSearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState('');

  /** 列表/搜索**读**失败 —— 有它就不许画空态。 */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 操作失败（上传/下载/改名/删除）—— 不影响列表本身。 */
  const [actionError, setActionError] = useState<{
    label: string;
    detail: string;
  } | null>(null);
  /** 操作结果（中性信息）。 */
  const [notice, setNotice] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 把一个异常变成一句人话。 */
  const messageOf = useCallback(
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
    [],
  );

  /** 列表 —— 失败就是失败（**不许**悄悄变成空列表）。 */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // ⚠️ 租户由端脑说了算 ⇒ ⇒ 先问「你是谁」再读（并发调用共享同一次请求）。
      await useIdentityStore.getState().resolve();
      const list = await documentsClient.list({ limit: 100 });
      setDocuments(list);
      setHasSearched(false);
    } catch (e) {
      setLoadError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [messageOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const results = await documentsClient.search(q, 20);
      setKeywordHits(results.keyword);
      setVectorHits(results.vector);
      setHasSearched(true);
    } catch (e) {
      setLoadError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [messageOf, query]);

  const onFileChosen = useCallback(
    async (file: File) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await documentsClient.upload({
          name: file.name,
          bytes,
          mime: file.type || undefined,
          kind: 'file',
          source: 'desktop',
        });
        setNotice(t('resources.uploaded', { name: file.name }));
        await load();
      } catch (e) {
        setActionError({
          label: t('resources.uploadFailed'),
          detail: messageOf(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [load, messageOf, t],
  );

  const onDownload = useCallback(
    async (doc: ResourceDocument) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const content = await documentsClient.download(doc.id);
        // ⚠️ 桌面端没有 fs/dialog 插件 ⇒ ⇒ 这一步走浏览器下载通道。
        const blob = new Blob([content.bytes as unknown as BlobPart], {
          type: content.mime,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setActionError({
          label: t('resources.downloadFailed'),
          detail: messageOf(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [messageOf, t],
  );

  const confirmRename = useCallback(async () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) {
      setActionError({ label: t('resources.renameEmpty'), detail: '' });
      return;
    }
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await documentsClient.update(renamingId, { name });
      setNotice(t('resources.renamed', { name }));
      setRenamingId(null);
      await load();
    } catch (e) {
      setActionError({
        label: t('resources.renameFailed'),
        detail: messageOf(e),
      });
    } finally {
      setBusy(false);
    }
  }, [load, messageOf, renamingId, renameValue, t]);

  const onDelete = useCallback(
    async (doc: ResourceDocument) => {
      setBusy(true);
      setActionError(null);
      setNotice(null);
      try {
        const result = await documentsClient.remove(doc.id);
        if (!result.deleted) {
          // 压根没有这一行（可能已经被别的会话删了）。
          setNotice(t('resources.deleteNothing'));
        } else if (result.bytesDeleted) {
          setNotice(t('resources.deletedAll', { name: doc.name }));
        } else {
          // ⚠️ **索引删了、字节还在** ⇒ ⇒ 这不是成功 ⇒ ⇒ 走错误通道。
          setActionError({
            label: t('resources.deletedBytesKept'),
            detail: result.bytesError ?? '-',
          });
        }
        await load();
      } catch (e) {
        setActionError({
          label: t('resources.deleteFailed'),
          detail: messageOf(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [load, messageOf, t],
  );

  const showEmpty =
    !loadError && !loading && !hasSearched && documents.length === 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('resources.title')}</h1>
          <p className="subtitle">{t('resources.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('resources.currentPersona', { persona: tenantId })}
          </span>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            icon={<Upload size={16} />}
          >
            {t('resources.upload')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            data-testid="resource-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[300px] flex-1 items-center gap-3 rounded-lg border border-border bg-card px-4">
          <Search size={18} className="text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('resources.searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            className="flex-1 border-none bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            data-testid="resource-search-input"
          />
        </div>
        <Button onClick={() => void runSearch()} disabled={loading}>
          {loading ? t('common.loading') : t('resources.search')}
        </Button>
      </div>

      {/* ⚠️ **读失败** —— 有它就不许画空态（读不到 ≠ 没有）。 */}
      {loadError && (
        <div
          className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500"
          role="alert"
          data-testid="resource-load-error"
        >
          <p>{t('resources.loadFailed')}</p>
          {/* ⚠️ 原始原因**原样显示** —— 翻译只是前缀，真话在后头。
              （把原因塞进插值里 ⇒ ⇒ 键透传的测试环境会把它丢掉 ⇒ ⇒
              真话反而不见了 ⇒ ⇒ 所以分开画。） */}
          <p
            className="mt-1 text-xs opacity-80"
            data-testid="resource-load-error-detail"
          >
            {loadError}
          </p>
        </div>
      )}

      {actionError && (
        <div
          className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500"
          role="alert"
          data-testid="resource-action-error"
        >
          <p>{actionError.label}</p>
          {actionError.detail && (
            <p
              className="mt-1 text-xs opacity-80"
              data-testid="resource-action-error-detail"
            >
              {actionError.detail}
            </p>
          )}
        </div>
      )}

      {notice && (
        <div
          className="rounded-md border border-border bg-card p-3 text-sm text-foreground"
          role="status"
          data-testid="resource-notice"
        >
          {notice}
        </div>
      )}

      {hasSearched ? (
        <div className="flex flex-col gap-4">
          {/* ⚠️ **两个通道分开画** —— BM25 与余弦相似度**不可比**
              ⇒ ⇒ 排成一张表就是骗人。 */}
          <section data-testid="resource-keyword-section">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {t('resources.channel.keyword')}
            </h2>
            {keywordHits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('resources.channelEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {keywordHits.map((hit) => (
                  <HitRow
                    key={`kw-${hit.document.id}`}
                    hit={hit}
                    onDownload={(doc) => void onDownload(doc)}
                    disabled={busy}
                  />
                ))}
              </ul>
            )}
          </section>
          <section data-testid="resource-vector-section">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {t('resources.channel.vector')}
            </h2>
            {vectorHits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('resources.channelEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {vectorHits.map((hit) => (
                  <HitRow
                    key={`vec-${hit.document.id}`}
                    hit={hit}
                    onDownload={(doc) => void onDownload(doc)}
                    disabled={busy}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : showEmpty ? (
        <EmptyState
          icon={<FileText size={44} strokeWidth={1} />}
          title={t('resources.empty')}
          description={t('resources.emptyHint')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-border bg-card p-4"
              data-testid={`resource-row-${doc.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted-foreground" />
                    {renamingId === doc.id ? (
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        data-testid={`resource-rename-input-${doc.id}`}
                      />
                    ) : (
                      <span className="truncate text-sm font-medium text-foreground">
                        {doc.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      {t('resources.kindLabel')}: {doc.kind}
                    </span>
                    <span>{formatBytes(doc.size)}</span>
                    {doc.mime && <span>{doc.mime}</span>}
                    {/* ⚠️ 如实标：没有正文 ⇒ 只能按名字搜到。 */}
                    {!doc.extracted && (
                      <span className="text-amber-600">
                        {t('resources.nameOnlySearch')}
                      </span>
                    )}
                    {doc.truncated && (
                      <span className="text-amber-600">
                        {t('resources.truncated')}
                      </span>
                    )}
                    <span>
                      {format(doc.updatedAt, 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {renamingId === doc.id ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void confirmRename()}
                        data-testid={`resource-rename-confirm-${doc.id}`}
                      >
                        {t('common.save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setRenamingId(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('resources.rename')}
                        onClick={() => {
                          setRenamingId(doc.id);
                          setRenameValue(doc.name);
                        }}
                        data-testid={`resource-rename-${doc.id}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('resources.download')}
                        onClick={() => void onDownload(doc)}
                        data-testid={`resource-download-${doc.id}`}
                      >
                        <Download size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('common.delete')}
                        onClick={() => void onDelete(doc)}
                        data-testid={`resource-delete-${doc.id}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
