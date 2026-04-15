import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Badge, EmptyState, Loading } from '../components/ui';
import { AddProviderModal } from '../components/business';
import { Plus, Trash2, Cpu, TestTube, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ModelProvider } from '../components/business/AddProviderModal/types';
import './ModelsPage.css';

const API_BASE = 'http://localhost:8082';

const providerLogos: Record<string, { bg: string; text: string }> = {
  // Main providers
  openai: { bg: '#10a37f', text: 'AI' },
  anthropic: { bg: '#d4a574', text: 'AN' },
  github_copilot: { bg: '#6e5494', text: 'GH' },
  google: { bg: '#4285f4', text: 'GO' },
  openrouter: { bg: '#7c3aed', text: 'OR' },
  vercel: { bg: '#000000', text: 'VC' },
  // Chinese providers
  minimax: { bg: '#00d2d3', text: 'MM' },
  minimax_cn: { bg: '#00d2d3', text: 'MM' },
  moonshot: { bg: '#8b5cf6', text: 'MS' },
  moonshot_cn: { bg: '#8b5cf6', text: 'MS' },
  zhipu: { bg: '#7c3aed', text: 'ZP' },
  deepseek: { bg: '#6366f1', text: 'DS' },
  grok: { bg: '#f97316', text: 'GR' },
  // Local providers
  ollama: { bg: '#ffffff', text: 'OLL' },
  lmstudio: { bg: '#8050d4', text: 'LM' },
  // AI platforms
  togetherai: { bg: '#7c3aed', text: 'TO' },
  groq: { bg: '#2ecc71', text: 'GQ' },
  cerebras: { bg: '#ff6b6b', text: 'CB' },
  fireworks_ai: { bg: '#f97316', text: 'FW' },
  perplexity: { bg: '#1e3a5f', text: 'PP' },
  mistral: { bg: '#f97316', text: 'MS' },
  cohere: { bg: '#f97316', text: 'CO' },
  huggingface: { bg: '#ffd21e', text: 'HF' },
  // Cloud providers
  aws_bedrock: { bg: '#ff9900', text: 'AWS' },
  azure: { bg: '#0078d4', text: 'AZ' },
  nvidia: { bg: '#76b900', text: 'NV' },
  cloudflare: { bg: '#f38020', text: 'CF' },
  // Chinese cloud platforms
  modelscope: { bg: '#f97316', text: 'MS' },
  siliconflow: { bg: '#10a37f', text: 'SF' },
  siliconflow_cn: { bg: '#10a37f', text: 'SF' },
  novita_ai: { bg: '#8b5cf6', text: 'NV' },
  friendli: { bg: '#7c3aed', text: 'FR' },
  upstage: { bg: '#f97316', text: 'UP' },
  abacus: { bg: '#10a37f', text: 'AB' },
  aihubmix: { bg: '#f97316', text: 'AH' },
  alibaba: { bg: '#ff6a00', text: 'AL' },
  alibaba_cn: { bg: '#ff6a00', text: 'AL' },
  tencent: { bg: '#ff6a00', text: 'TC' },
  stepfun: { bg: '#7c3aed', text: 'SF' },
  qwen: { bg: '#7c3aed', text: 'QW' },
  custom: { bg: '#7f8c8d', text: 'CST' },
};

export function ModelsPage() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'error' | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_BASE}/models/providers`);
      if (!response.ok) throw new Error('Failed to load');
      const result = await response.json();
      setProviders(result);
    } catch (e) {
      console.error('Failed to load providers:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/models/providers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete provider:', e);
    }
  };

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    try {
      const response = await fetch(`${API_BASE}/models/${providerId}/${modelId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete model:', e);
    }
  };

  const testConnection = async (provider: ModelProvider) => {
    setTestingConnection(provider.id);
    setConnectionStatus(prev => ({ ...prev, [provider.id]: null }));
    
    try {
      const response = await fetch(`${API_BASE}/models/providers/${provider.id}/test`, {
        method: 'POST',
      });
      setConnectionStatus(prev => ({ ...prev, [provider.id]: response.ok ? 'success' : 'error' }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [provider.id]: 'error' }));
    } finally {
      setTestingConnection(null);
    }
  };

  const getProviderLogo = (providerType: string) => {
    return providerLogos[providerType] || providerLogos.custom;
  };

  if (isLoading) {
    return <Loading fullScreen text="Loading models..." />;
  }

  return (
    <div className="models-page">
      <header className="page-header">
        <div className="header-left">
          <h1>{t('models.title')}</h1>
          <p className="subtitle">{t('models.configureProviders')}</p>
        </div>
        <Button 
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => setShowAddProvider(true)}
        >
{t('models.addProvider')}
        </Button>
      </header>

      <div className="provider-list">
        {providers.length === 0 ? (
          <EmptyState
            icon={<Cpu size={48} />}
            title={t('models.noProviders')}
            description={t('models.noProvidersDesc')}
            action={{ label: t('models.addFirstProvider'), onClick: () => setShowAddProvider(true) }}
          />
        ) : (
          providers.map((provider) => {
            const logo = getProviderLogo(provider.provider_type);
            const isExpanded = expandedProvider === provider.id;
            
            return (
              <div key={provider.id} className="provider-card">
                <div 
                  className="provider-header"
                  onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                >
                  <div 
                    className="provider-logo"
                    style={{ background: logo.bg, color: provider.provider_type === 'ollama' ? '#333' : '#fff' }}
                  >
                    {logo.text}
                  </div>
                  <div className="provider-info">
                    <h3>{provider.name}</h3>
                    <span className="provider-type">{provider.provider_type}</span>
                  </div>
                  <div className="provider-meta">
                    <Badge variant="default">{t('models.modelsCount', { count: provider.models.length })}</Badge>
                    {connectionStatus[provider.id] === 'success' && (
                      <CheckCircle size={16} className="status-success" />
                    )}
                    {connectionStatus[provider.id] === 'error' && (
                      <XCircle size={16} className="status-error" />
                    )}
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="provider-details">
                    {provider.api_base && (
                      <div className="detail-row">
                        <span className="detail-label">{t('models.apiBase')}:</span>
                        <code>{provider.api_base}</code>
                      </div>
                    )}
                    
                    <div className="model-section">
                      <h4>{t('models.models', { count: provider.models.length })}</h4>
                      <div className="model-list">
                        {provider.models.map((model) => (
                          <div key={model.id} className="model-item">
                            <div className="model-info">
                              <span className="model-name">{model.name}</span>
                              <span className="model-id">{model.model_id}</span>
                            </div>
                            <div className="model-badges">
                              {model.is_default && <Badge variant="success" size="sm">{t('models.default')}</Badge>}
                              {model.supports_vision && <Badge variant="info" size="sm">{t('models.visionSupport')}</Badge>}
                              {model.supports_function_calling && <Badge variant="accent" size="sm">{t('models.functions')}</Badge>}
                            </div>
                            <button 
                              className="delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteModel(provider.id, model.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="provider-actions">
                      <Button 
                        variant="secondary" 
                        size="sm"
                        icon={<TestTube size={14} />}
                        loading={testingConnection === provider.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          testConnection(provider);
                        }}
                      >
                        {t('models.testConnection')}
                      </Button>
                      <Button 
                        variant="danger" 
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProvider(provider.id);
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <AddProviderModal
        isOpen={showAddProvider}
        onClose={() => setShowAddProvider(false)}
        onSuccess={loadProviders}
      />
    </div>
  );
}
