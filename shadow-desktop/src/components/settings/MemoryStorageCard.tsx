import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Cloud, CloudCog, AlertTriangle, Loader2, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { telencephalonClient } from '../../lib/telencephalonClient';
import type {
  ConfigEntry,
  StorageMigrationStatus,
  StorageMigrationTarget,
} from '../../lib/telencephalonClient';
import { restartApp } from '../../lib/appRestart';
import { StorageMigrationDialog } from './StorageMigrationDialog';

/**
 * **记忆存储**设置 —— 记忆体（海马体 / Lance 数据集）落在哪里。
 *
 * ⚠️ **真相源是端脑的配置中心**（`hippocampus` 段），不是 Tauri 的
 * config.json：端脑的优先级是「控制面 → 宿主目录 → 环境 → 默认」
 * （`telencephalon/src/boot.rs`），所以记忆下落这件事**只有一个主人**。
 *
 * ⚠️ **支持集由 Lance 的 feature 决定**，不是「对象存储有什么」：
 *   * `file://` / 裸路径 —— 本地目录（手机上会被 SELinux 的硬链接限制挡掉）
 *   * `s3://` / `s3a://` —— AWS S3 **及所有 S3 兼容**（MinIO / RustFS / COS S3 模式）
 *   * `oss://` —— 阿里云 OSS（**endpoint 必填**）
 *   GCS / Azure 需要给 lance 加 feature，这里**不宣称**。
 *
 * ⚠️ **两句话必须写在界面上**（否则用户会误以为「保存了就是搬好了」）：
 *   1. 改存储**要重启**才生效（配置在 boot 时读一次）；
 *   2. 换存储**不迁移**已有记忆（Lance 数据集首次创建后就地生根）。
 */

const SECTION = 'hippocampus';
const KEY_URI = 'storage_uri';
const KEY_ACCESS = 'storage_access_key';
const KEY_SECRET = 'storage_secret_key';
const KEY_REGION = 'storage_region';
const KEY_ENDPOINT = 'storage_endpoint';
const KEY_ALLOW_HTTP = 'storage_allow_http';
const KEY_COPY = 'storage_copy_if_not_exists';

/** 读回来的掩码（服务端对 secret 条目这么回）。 */
const MASK = '***';

type Backend = 'local' | 's3' | 'oss';

function backendOf(uri: string): Backend {
  if (uri.startsWith('oss://')) return 'oss';
  if (uri.startsWith('s3://') || uri.startsWith('s3a://')) return 's3';
  return 'local';
}

function valueOf(entries: ConfigEntry[], key: string): string {
  const hit = entries.find((e) => e.key === key);
  if (!hit) return '';
  const v = hit.value;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v == null) return '';
  return String(v);
}

function secretOf(entries: ConfigEntry[], key: string): string {
  const hit = entries.find((e) => e.key === key);
  if (!hit) return '';
  // 服务端对 secret 条目回掩码 —— 原样显示成「已配置」。
  return typeof hit.value === 'string' && hit.value !== '' ? MASK : '';
}

export function MemoryStorageCard() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ConfigEntry[] | null>(null);
  const [appliesWhen, setAppliesWhen] = useState<string>('');
  const [unreadable, setUnreadable] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [backend, setBackend] = useState<Backend>('local');
  const [location, setLocation] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [region, setRegion] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [allowHttp, setAllowHttp] = useState(false);
  const [copyIfNotExists, setCopyIfNotExists] = useState('');
  // **换根迁移**（2026-11-13）：非 null ⇒ 弹阻塞弹窗并轮询。
  const [migration, setMigration] = useState<StorageMigrationStatus | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnreadable('');
    try {
      const view = await telencephalonClient.neuron.configSection(SECTION);
      setEntries(view.entries);
      setAppliesWhen(view.applies_when ?? '');
      const uri = valueOf(view.entries, KEY_URI);
      setBackend(backendOf(uri));
      setLocation(uri);
      setEndpoint(valueOf(view.entries, KEY_ENDPOINT));
      setRegion(valueOf(view.entries, KEY_REGION));
      setAccessKey(secretOf(view.entries, KEY_ACCESS));
      setSecretKey(secretOf(view.entries, KEY_SECRET));
      setAllowHttp(valueOf(view.entries, KEY_ALLOW_HTTP) === 'true');
      setCopyIfNotExists(valueOf(view.entries, KEY_COPY));
    } catch (e) {
      // ⚠️ **读不到 ≠ 没配过** —— 503 是「控制面未连接」，不是「空」。
      setEntries(null);
      setUnreadable(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // **迁移进度轮询**：迁移进行中每秒读一次；到 `done` 就重启应用
  // （存储根只在 boot 时读一次 ⇒ 新根要下一次启动才生效）。
  useEffect(() => {
    if (!migration) return;
    const state = migration.state;
    if (state === 'done') {
      if (!restarting) {
        setRestarting(true);
        void restartApp();
      }
      return;
    }
    if (state === 'failed' || state === 'aborted') return;
    const timer = globalThis.setInterval(() => {
      void telencephalonClient.neuron
        .storageMigration()
        .then((next) => {
          if (next.state !== 'idle') setMigration(next);
        })
        .catch((e) => {
          // ⚠️ 读不到就**停下来并说真话**（不静默重试到天荒地老）：
          // 迁移期 `/hippocampus` 都被挡，这条状态面不受影响；它要是也
          // 读不到，那是大脑真的没了。
          setMigration((prev) =>
            prev
              ? {
                  ...prev,
                  state: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                }
              : prev,
          );
        });
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [migration, restarting]);

  const configured = useMemo(
    () => (entries ?? []).some((e) => e.key === KEY_URI),
    [entries],
  );

  const validate = (): string => {
    if (!location.trim()) return t('settings.memoryStorage.invalidLocation');
    if (backend !== 'local') {
      const prefix = backend === 'oss' ? 'oss://' : 's3://';
      const ok = location.startsWith(prefix) || (backend === 's3' && location.startsWith('s3a://'));
      if (!ok) return t('settings.memoryStorage.invalidScheme', { scheme: prefix });
      const bucket = location.slice(location.indexOf('://') + 3).split('/')[0];
      if (!bucket) return t('settings.memoryStorage.invalidLocation');
    }
    if (backend === 'oss' && !endpoint.trim()) {
      return t('settings.memoryStorage.invalidOssEndpoint');
    }
    return '';
  };

  const putOrDelete = async (key: string, value: string, secret = false) => {
    if (value.trim() === '') {
      // ⚠️ **键本来不存在就不发 DELETE**（真机 2026-11-13 红 toast 那一格
      // 的修法）：切后端时卡片会顺手清 `storage_endpoint`/`storage_region`，
      // 而从没配过远端的用户这两键**不存在** ⇒ 404 ⇒ 全局拦截器弹红 ⇒ ⇒
      // 「保存成功」与红报错同屏（成功长得像失败）。entries 是 load() 刚读
      // 回来的真值，用它决定发不发。
      const exists = (entries ?? []).some((e) => e.key === key);
      if (!exists) return;
      try {
        await telencephalonClient.neuron.deleteConfig(SECTION, key);
      } catch (e) {
        // 竞态兜底：读回来之后被别人删了 ⇒ 404 就是想要的状态；
        // 其余错误（500/503/网络）**必须照抛** —— 吞掉它们＝「控制面
        // 坏了也说保存成功」＝失败长得像成功。
        if (!/404|not_found/i.test(String(e))) throw e;
      }
      return;
    }
    await telencephalonClient.neuron.putConfig(SECTION, key, value.trim(), { secret });
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      setSaved(false);
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      // ⚠️ **换根要搬数据**（2026-11-13 用户拍板）：目标与当前不同 ⇒ 不要
      // 只改一行 `storage_uri`（那样新根是空库、旧数据留在原处）⇒ 交给
      // 大脑的迁移面：它搬完 → 校验 → 切配置 → 删旧 → 等重启。
      const current = (entries ?? []).find((e) => e.key === KEY_URI)?.value;
      const currentUri = typeof current === 'string' ? current : '';
      if (currentUri && currentUri.trim().replace(/\/+$/, '') !== location.trim().replace(/\/+$/, '')) {
        const target: StorageMigrationTarget = {
          uri: location.trim(),
          ...(backend === 'local' ? {} : { endpoint: endpoint.trim() }),
          ...(backend === 's3' ? { region: region.trim() } : {}),
          ...(backend !== 'local' ? { allow_http: allowHttp } : {}),
          ...(backend !== 'local' && copyIfNotExists.trim()
            ? { copy_if_not_exists: copyIfNotExists.trim() }
            : {}),
          ...(accessKey && accessKey !== MASK ? { access_key: accessKey } : {}),
          ...(secretKey && secretKey !== MASK ? { secret_key: secretKey } : {}),
        };
        const started = await telencephalonClient.neuron.startStorageMigration(target);
        setMigration({
          state: started.needs_migration ? 'copying' : 'done',
          restart_required: started.restart_required,
          src: started.src,
          dst: started.dst,
        });
        return;
      }
      await putOrDelete(KEY_URI, location);
      await putOrDelete(KEY_ENDPOINT, backend === 'local' ? '' : endpoint);
      await putOrDelete(KEY_REGION, backend === 's3' ? region : '');
      if (backend !== 'local') {
        await putOrDelete(KEY_ALLOW_HTTP, allowHttp ? 'true' : '');
        await putOrDelete(KEY_COPY, copyIfNotExists);
      }
      // ⚠️ 秘密只在**用户真的输入了新值**时才写（掩码/空 ⇒ 保留原值）。
      if (accessKey && accessKey !== MASK) await putOrDelete(KEY_ACCESS, accessKey, true);
      if (secretKey && secretKey !== MASK) await putOrDelete(KEY_SECRET, secretKey, true);
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.memoryStorage.loading')}
        </CardContent>
      </Card>
    );
  }

  if (unreadable) {
    return (
      <Card data-testid="memory-storage-unreadable">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t('settings.memoryStorage.unreadableTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.memoryStorage.unreadableHint', { reason: unreadable })}
          </CardDescription>
          {/* 原始错误照实显示（支持人员据此区分「没配」与「控制面没连上」）。 */}
          <div
            className="text-xs text-muted-foreground break-all"
            data-testid="memory-storage-unreadable-reason"
          >
            {unreadable}
          </div>
        </CardHeader>
      </Card>
    );
  }

  const Icon = backend === 'local' ? HardDrive : backend === 's3' ? CloudCog : Cloud;

  return (
    <>
      <Card data-testid="memory-storage-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {t('settings.memoryStorage.title')}
          {configured ? (
            <Badge variant="success">{t('settings.memoryStorage.configured')}</Badge>
          ) : (
            <Badge variant="secondary">{t('settings.memoryStorage.notConfigured')}</Badge>
          )}
        </CardTitle>
        <CardDescription>{t('settings.memoryStorage.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 后端三选一 —— 受 Lance feature 限制（见文件头） */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.memoryStorage.backend')}>
          {(['local', 's3', 'oss'] as Backend[]).map((b) => (
            <Button
              key={b}
              type="button"
              size="sm"
              variant={backend === b ? 'default' : 'outline'}
              data-testid={`memory-storage-backend-${b}`}
              onClick={() => {
                setBackend(b);
                setSaved(false);
                // 换后端时把位置换成对应前缀的形状提示（不擅自填内容）。
                setLocation((prev) => {
                  if (b === 'local') return prev.startsWith('s3') || prev.startsWith('oss') ? '' : prev;
                  const prefix = b === 'oss' ? 'oss://' : 's3://';
                  return prev.startsWith(prefix) ? prev : prefix;
                });
              }}
            >
              {t(`settings.memoryStorage.backend_${b}`)}
            </Button>
          ))}
        </div>

        <Input
          label={t('settings.memoryStorage.location')}
          value={location}
          data-testid="memory-storage-location"
          onChange={(e) => setLocation(e.target.value)}
          hint={
            backend === 'local'
              ? t('settings.memoryStorage.locationLocalHint')
              : t('settings.memoryStorage.locationRemoteHint')
          }
          fullWidth
        />

        {backend !== 'local' && (
          <>
            <Input
              label={t('settings.memoryStorage.endpoint')}
              value={endpoint}
              data-testid="memory-storage-endpoint"
              onChange={(e) => setEndpoint(e.target.value)}
              hint={t('settings.memoryStorage.endpointHint')}
              fullWidth
            />
            {backend === 's3' && (
              <Input
                label={t('settings.memoryStorage.region')}
                value={region}
                data-testid="memory-storage-region"
                onChange={(e) => setRegion(e.target.value)}
                fullWidth
              />
            )}
            <Input
              label={t('settings.memoryStorage.accessKey')}
              value={accessKey}
              data-testid="memory-storage-access-key"
              type="password"
              onChange={(e) => setAccessKey(e.target.value)}
              hint={t('settings.memoryStorage.secretHint')}
              fullWidth
            />
            <Input
              label={t('settings.memoryStorage.secretKey')}
              value={secretKey}
              data-testid="memory-storage-secret-key"
              type="password"
              onChange={(e) => setSecretKey(e.target.value)}
              hint={t('settings.memoryStorage.secretHint')}
              fullWidth
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="memory-storage-allow-http"
                checked={allowHttp}
                onChange={(e) => setAllowHttp(e.target.checked)}
              />
              {t('settings.memoryStorage.allowHttp')}
            </label>
            <Input
              label={t('settings.memoryStorage.copyIfNotExists')}
              value={copyIfNotExists}
              data-testid="memory-storage-copy-if-not-exists"
              onChange={(e) => setCopyIfNotExists(e.target.value)}
              hint={t('settings.memoryStorage.copyIfNotExistsHint')}
              fullWidth
            />
          </>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={() => void save()}
            disabled={saving}
            icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          >
            {saving ? t('settings.memoryStorage.saving') : t('settings.memoryStorage.save')}
          </Button>
          {saved && (
            <span className="text-sm text-muted-foreground" data-testid="memory-storage-saved">
              {appliesWhen === 'restart'
                ? t('settings.memoryStorage.savedPendingRestart')
                : t('settings.memoryStorage.saved')}
            </span>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive" data-testid="memory-storage-error">
            {error}
          </div>
        )}

        {/* ⚠️ 两件必须说的事：要重启、（现在**会**迁移了）；外加优先级。 */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t('settings.memoryStorage.pendingRestartHint')}</p>
          <p>{t('settings.memoryStorage.migrationHint')}</p>
          <p>{t('settings.memoryStorage.priorityHint')}</p>
        </div>
      </CardContent>
      </Card>

      {migration && (
        <StorageMigrationDialog
          status={migration}
          restarting={restarting}
          onRetry={() => {
            // 重试 = 关掉旧记录再发一次：先让大脑把失败记录清掉（放弃），
            // 再用卡片上**当前**的输入重发。
            void telencephalonClient.neuron
              .cancelStorageMigration()
              .catch(() => undefined)
              .then(() => {
                setMigration(null);
                setRestarting(false);
                void save();
              });
          }}
          onAbort={() => {
            void telencephalonClient.neuron
              .cancelStorageMigration()
              .catch(() => undefined)
              .then(() => {
                setMigration(null);
                setRestarting(false);
              });
          }}
        />
      )}
    </>
  );
}
