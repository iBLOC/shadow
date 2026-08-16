import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  RefreshCw,
  X,
  Cloud,
  Server,
  Key,
  Link,
  Cpu,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button, EmptyState, Modal, Input } from '../components/ui';
import { cn } from '../lib/utils';

interface ProviderType {
  id: string;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  icon: React.ReactNode;
  color: string;
}

const PROVIDER_TYPES: ProviderType[] = [
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    icon: <Cpu size={20} />,
    color: 'text-orange-500',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    icon: <Cpu size={20} />,
    color: 'text-green-500',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    icon: <Cpu size={20} />,
    color: 'text-orange-500',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3',
    icon: <Server size={20} />,
    color: 'text-purple-500',
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    icon: <Cpu size={20} />,
    color: 'text-blue-500',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    icon: <Cpu size={20} />,
    color: 'text-cyan-500',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-Text-01',
    icon: <Cpu size={20} />,
    color: 'text-red-500',
  },
  {
    id: 'qwen',
    name: '通义千问',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'qwen-plus',
    icon: <Cpu size={20} />,
    color: 'text-blue-gray-500',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    icon: <Cpu size={20} />,
    color: 'text-indigo-500',
  },
  {
    id: 'zhipuai',
    name: '智谱AI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
    icon: <Cpu size={20} />,
    color: 'text-amber-500',
  },
  {
    id: 'local',
    name: '本地模型',
    defaultBaseUrl: 'http://localhost:8080',
    defaultModel: 'local-model',
    icon: <Server size={20} />,
    color: 'text-gray-500',
  },
];

interface Provider {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
}

interface ProviderFormData {
  type: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function ProvidersPage() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    type: 'openai',
    apiKey: '',
    baseUrl: '',
    model: '',
  });

  const loadProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setProviders([
        {
          id: '1',
          name: 'OpenAI',
          type: 'openai',
          apiKey: 'sk-...',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          enabled: true,
        },
        {
          id: '2',
          name: 'Ollama Local',
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: 'llama3',
          enabled: true,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleAdd = async () => {
    if (!formData.apiKey && formData.type !== 'ollama' && formData.type !== 'local') {
      setError('API Key is required');
      return;
    }

    try {
      const newProvider: Provider = {
        id: Date.now().toString(),
        name: PROVIDER_TYPES.find((t) => t.id === formData.type)?.name || formData.type,
        type: formData.type,
        apiKey: formData.apiKey || undefined,
        baseUrl: formData.baseUrl || undefined,
        model: formData.model || undefined,
        enabled: true,
      };

      setProviders((prev) => [...prev, newProvider]);
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
    }
  };

  const handleUpdate = async () => {
    if (!editingProvider) return;

    try {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === editingProvider.id
            ? {
                ...p,
                type: formData.type,
                apiKey: formData.apiKey || undefined,
                baseUrl: formData.baseUrl || undefined,
                model: formData.model || undefined,
              }
            : p
        )
      );
      setEditingProvider(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      setProviders((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle provider');
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'openai',
      apiKey: '',
      baseUrl: '',
      model: '',
    });
  };

  const openEditModal = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      type: provider.type,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      model: provider.model || '',
    });
  };

  const getProviderType = (typeId: string): ProviderType | undefined => {
    return PROVIDER_TYPES.find((t) => t.id === typeId);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-foreground text-background">
            <Cloud size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {t('providers.title') || '大模型服务提供商'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('providers.subtitle') || '管理和配置AI服务提供商'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<RefreshCw size={16} />}
            onClick={loadProviders}
            disabled={isLoading}
          >
            {t('common.refresh') || '刷新'}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setShowAddModal(true)}
          >
            {t('providers.add') || '添加提供商'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle size={16} />
          <span>{error}</span>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto"
            onClick={() => setError(null)}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            icon={<Cloud size={48} />}
            title={t('providers.empty') || '暂未配置提供商'}
            description={t('providers.emptyHint') || '点击上方按钮添加第一个提供商'}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => {
              const providerType = getProviderType(provider.type);
              return (
                <div
                  key={provider.id}
                  className={cn(
                    'rounded-lg border p-4 transition-colors',
                    provider.enabled
                      ? 'border-border bg-background'
                      : 'border-border/50 bg-muted/50'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-md',
                          providerType?.color || 'text-gray-500'
                        )}
                      >
                        {providerType?.icon || <Cloud size={20} />}
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">
                          {provider.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {provider.model || providerType?.defaultModel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleToggle(provider.id, !provider.enabled)
                        }
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          provider.enabled ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                            provider.enabled
                              ? 'translate-x-6'
                              : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {provider.apiKey && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Key size={12} />
                      <span>
                        API Key: {provider.apiKey.substring(0, 8)}...
                      </span>
                    </div>
                  )}

                  {provider.baseUrl && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Link size={12} />
                      <span className="truncate">{provider.baseUrl}</span>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(provider)}
                    >
                      {t('common.edit') || '编辑'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(provider.id)}
                    >
                      {t('common.delete') || '删除'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddModal || editingProvider !== null}
        onClose={() => {
          setShowAddModal(false);
          setEditingProvider(null);
          resetForm();
        }}
        title={
          editingProvider
            ? t('providers.edit') || '编辑提供商'
            : t('providers.add') || '添加提供商'
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              {t('providers.type') || '提供商类型'}
            </label>
            <select
              value={formData.type}
              onChange={(e) => {
                const selectedType = PROVIDER_TYPES.find(
                  (t) => t.id === e.target.value
                );
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value,
                  baseUrl: selectedType?.defaultBaseUrl || '',
                  model: selectedType?.defaultModel || '',
                }));
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {PROVIDER_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={t('providers.apiKey') || 'API Key'}
            value={formData.apiKey}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, apiKey: e.target.value }))
            }
            placeholder="sk-..."
            type="password"
          />

          <Input
            label={t('providers.baseUrl') || 'API 地址'}
            value={formData.baseUrl}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))
            }
            placeholder={
              PROVIDER_TYPES.find((t) => t.id === formData.type)
                ?.defaultBaseUrl
            }
          />

          <Input
            label={t('providers.model') || '模型'}
            value={formData.model}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, model: e.target.value }))
            }
            placeholder={
              PROVIDER_TYPES.find((t) => t.id === formData.type)
                ?.defaultModel
            }
          />

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddModal(false);
                setEditingProvider(null);
                resetForm();
              }}
            >
              {t('common.cancel') || '取消'}
            </Button>
            <Button
              variant="primary"
              onClick={editingProvider ? handleUpdate : handleAdd}
            >
              {editingProvider
                ? t('common.save') || '保存'
                : t('common.add') || '添加'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
