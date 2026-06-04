import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { safeInvoke } from '../lib/tauriSafe';
import { Database, Server, Cloud, Lock, CheckCircle, AlertCircle, Key, Plus, Loader2, ChevronRight } from 'lucide-react';
import { useDatabaseStore, type DatabaseType } from '../stores/databaseStore';
import { ProviderForm } from '../components/business';
import type { ProviderFormData, ProviderTypeOption } from '../components/business';
import './SetupPage.css';

interface LLMModel {
  id: string;
  name: string;
  model_id: string;
  model_type: string;
  context_length?: number;
  supports_vision: boolean;
  supports_function_calling: boolean;
  enabled: boolean;
  is_default: boolean;
}

interface ModelProvider {
  id: string;
  name: string;
  provider_type: string;
  api_base?: string;
  api_key?: string;
  enabled: boolean;
  models: LLMModel[];
}

const DB_TYPE_OPTIONS: { value: DatabaseType; icon: typeof Server; labelKey: string; descKey: string; disabled?: boolean }[] = [
  { value: 'embedded', icon: Server, labelKey: 'settings.dbEmbedded', descKey: 'setup.dbEmbeddedDesc' },
  { value: 'external', icon: Database, labelKey: 'settings.dbExternal', descKey: 'setup.dbExternalDesc' },
  { value: 'neon', icon: Cloud, labelKey: 'settings.dbNeon', descKey: 'setup.dbNeonDesc', disabled: true },
];

const PROVIDER_TYPES = [
  { id: 'openai', name: 'OpenAI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
  { id: 'github-copilot', name: 'GitHub Copilot', color: '#6e5494' },
  { id: 'google', name: 'Google', color: '#4285f4' },
  { id: 'openrouter', name: 'OpenRouter', color: '#7c3aed' },
  { id: 'vercel', name: 'Vercel', color: '#000000' },
  { id: 'minimax', name: 'MiniMax', color: '#00d2d3' },
  { id: 'minimax-cn', name: 'MiniMax 中国', color: '#00d2d3' },
  { id: 'moonshot', name: 'Moonshot AI', color: '#8b5cf6' },
  { id: 'moonshot-cn', name: 'Moonshot AI 中国', color: '#8b5cf6' },
  { id: 'zhipu', name: '智谱 AI', color: '#7c3aed' },
  { id: 'deepseek', name: 'DeepSeek', color: '#6366f1' },
  { id: 'grok', name: 'Grok', color: '#f97316' },
  { id: 'ollama', name: 'Ollama', color: '#ffffff' },
  { id: 'lmstudio', name: 'LM Studio', color: '#8050d4' },
  { id: 'togetherai', name: 'Together AI', color: '#7c3aed' },
  { id: 'groq', name: 'Groq', color: '#2ecc71' },
  { id: 'cerebras', name: 'Cerebras', color: '#ff6b6b' },
  { id: 'fireworks-ai', name: 'Fireworks AI', color: '#f97316' },
  { id: 'perplexity', name: 'Perplexity', color: '#1e3a5f' },
  { id: 'mistral', name: 'Mistral', color: '#f97316' },
  { id: 'cohere', name: 'Cohere', color: '#f97316' },
  { id: 'huggingface', name: 'Hugging Face', color: '#ffd21e' },
  { id: 'aws-bedrock', name: 'AWS Bedrock', color: '#ff9900' },
  { id: 'azure', name: 'Azure', color: '#0078d4' },
  { id: 'nvidia', name: 'NVIDIA', color: '#76b900' },
  { id: 'cloudflare', name: 'Cloudflare', color: '#f38020' },
  { id: 'modelscope', name: 'ModelScope', color: '#f97316' },
  { id: 'siliconflow', name: 'SiliconFlow', color: '#10a37f' },
  { id: 'siliconflow-cn', name: 'SiliconFlow 中国', color: '#10a37f' },
  { id: 'novita-ai', name: 'Novita AI', color: '#8b5cf6' },
  { id: 'friendli', name: 'Friendli', color: '#7c3aed' },
  { id: 'upstage', name: 'Upstage', color: '#f97316' },
  { id: 'abacus', name: 'Abacus', color: '#10a37f' },
  { id: 'aihubmix', name: 'AIHubMix', color: '#f97316' },
  { id: 'alibaba', name: 'Alibaba', color: '#ff6a00' },
  { id: 'alibaba-cn', name: 'Alibaba 中国', color: '#ff6a00' },
  { id: 'tencent', name: 'Tencent', color: '#ff6a00' },
  { id: 'stepfun', name: 'StepFun', color: '#7c3aed' },
  { id: 'qwen', name: 'Qwen', color: '#7c3aed' },
  { id: 'custom', name: 'Custom', color: '#7f8c8d' },
] as ProviderTypeOption[];
type ProviderTypeId = typeof PROVIDER_TYPES[number]['id'];

const DEFAULT_API_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  'github-copilot': 'https://api.githubcopilot.com/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  vercel: 'https://api.vercel.ai/v1',
  minimax: 'https://api.minimax.chat/v1',
  'minimax-cn': 'https://api.minimaxi.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  'moonshot-cn': 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  deepseek: 'https://api.deepseek.com/v1',
  grok: 'https://api.x.ai/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  togetherai: 'https://api.together.xyz/v1',
  groq: 'https://api.groq.com/openai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  'fireworks-ai': 'https://api.fireworks.ai/v1',
  perplexity: 'https://api.perplexity.ai',
  mistral: 'https://api.mistral.ai/v1',
  cohere: 'https://api.cohere.ai/v2',
  huggingface: 'https://api-inference.huggingface.co/v1',
  'aws-bedrock': 'https://bedrock-runtime.amazonaws.com',
  azure: 'https://{your-resource}.openai.azure.com/openai/deployments/{your-deployment-name}/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  cloudflare: 'https://api.cloudflare.com/v1',
  modelscope: 'https://api.modelscope.cn/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  'siliconflow-cn': 'https://api.siliconflow.cn/v1',
  'novita-ai': 'https://api.novita.ai/v1',
  friendli: 'https://api.friendli.ai/v1',
  upstage: 'https://api.upstage.ai/v1',
  abacus: 'https://api.madebyabacus.com/v1',
  aihubmix: 'https://aihubmix.com/v1',
  alibaba: 'https://dashscope.aliyuncs.com/api/v1',
  'alibaba-cn': 'https://dashscope.aliyuncs.com/api/v1',
  tencent: 'https://api.hunyuan.cloud.tencent.com/v1',
  stepfun: 'https://api.stepfun.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
};

interface FetchedModel {
  id: string;
  name: string;
  model_id: string;
  model_type: string;
  context_length: number | null;
  supports_vision: boolean;
  supports_function_calling: boolean;
  enabled: boolean;
}

type SetupStep = 'password' | 'database' | 'provider' | 'models';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dbType, status, setDbType, startEmbedded } = useDatabaseStore();
  const [step, setStep] = useState<SetupStep>('password');

  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [machineId, setMachineId] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  const [externalDbConfig, setExternalDbConfig] = useState({
    host: 'localhost',
    port: '5432',
    username: 'postgres',
    password: '',
    database: 'shadow',
  });
  const [connectionTestResult, setConnectionTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const [providerType, setProviderType] = useState<ProviderTypeId>('openai');
  const [providerName, setProviderName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerError, setProviderError] = useState('');

  const [providerFormData, setProviderFormData] = useState<ProviderFormData>({
    name: '',
    provider_type: 'openai',
    api_base: '',
    api_key: '',
    enabled: true,
  });

  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [isAddingModel, setIsAddingModel] = useState(false);

  useEffect(() => {
    safeInvoke<string>('get_machine_id').then((id) => {
      if (id) setMachineId(id);
    }).catch(console.error);
    loadSetupProgress();
  }, []);

  const loadSetupProgress = async () => {
    try {
      const savedStep = await safeInvoke<string>('get_setup_step');
      const providerConfig = await safeInvoke<{ provider_type: string; name: string; api_base: string; api_key: string | null }>('get_provider_config');

      if (savedStep && savedStep !== 'password') {
        setStep(savedStep as SetupStep);
      }

      if (providerConfig && providerConfig.name) {
        setProviderType(providerConfig.provider_type as ProviderTypeId);
        setProviderName(providerConfig.name);
        setApiBase(providerConfig.api_base);
        if (providerConfig.api_key) {
          setApiKey(providerConfig.api_key);
        }
      }
    } catch (err) {
      console.error('Failed to load setup progress:', err);
    }
  };

  const handleProviderFormChange = (data: ProviderFormData) => {
    setProviderFormData(data);
    setProviderType(data.provider_type as ProviderTypeId);
    setProviderName(data.name);
    setApiBase(data.api_base);
    setApiKey(data.api_key);
  };

  const handleSetPassword = async () => {
    if (masterPasswordInput.length < 8) {
      setPasswordError(t('setup.passwordTooShort'));
      return;
    }
    if (masterPasswordInput !== confirmPassword) {
      setPasswordError(t('setup.passwordMismatch'));
      return;
    }

    setIsSettingPassword(true);
    setPasswordError('');

    try {
      await safeInvoke('set_password', { password: masterPasswordInput, machineId });
      await safeInvoke('update_setup_step', { step: 'database' });
      setStep('database');
    } catch (err) {
      setPasswordError(String(err));
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handleSelectDb = (type: DatabaseType) => {
    setDbType(type);
  };

  const handleConfigureDb = async () => {
    if (dbType === 'embedded') {
      await startEmbedded();
      await safeInvoke('update_setup_step', { step: 'provider' });
      setStep('provider');
    } else if (dbType === 'external') {
      setConnectionTestResult('testing');
      try {
        await safeInvoke('save_db_config', {
          dbType: 'external',
          dbConfig: {
            host: externalDbConfig.host,
            port: parseInt(externalDbConfig.port, 10),
            username: externalDbConfig.username,
            password: externalDbConfig.password,
            database: externalDbConfig.database,
          },
        });
        setConnectionTestResult('success');
        await safeInvoke('update_setup_step', { step: 'provider' });
        setTimeout(() => setStep('provider'), 1000);
      } catch {
        setConnectionTestResult('failed');
      }
    }
  };

  const handleTestConnection = async () => {
    setConnectionTestResult('testing');
    try {
      await safeInvoke('save_db_config', {
        dbType: 'external',
        dbConfig: {
          host: externalDbConfig.host,
          port: parseInt(externalDbConfig.port, 10),
          username: externalDbConfig.username,
          password: externalDbConfig.password,
          database: externalDbConfig.database,
        },
      });
      setConnectionTestResult('success');
    } catch {
      setConnectionTestResult('failed');
    }
  };

  const handleAddProvider = async () => {
    if (!providerName || !apiBase) return;

    setIsAddingProvider(true);
    setProviderError('');

    try {
      await safeInvoke('save_provider_config', {
        providerConfig: {
          provider_type: providerType,
          name: providerName,
          api_base: apiBase,
          api_key: apiKey || null,
        },
      });
      await safeInvoke('update_setup_step', { step: 'models' });
      setStep('models');
    } catch (err) {
      setProviderError(String(err));
    } finally {
      setIsAddingProvider(false);
    }
  };

  const handleFetchModels = async () => {
    if (!apiBase) return;

    setIsFetchingModels(true);
    setFetchError('');
    setFetchedModels([]);

    try {
      const models = await safeInvoke<FetchedModel[]>('fetch_provider_models', {
        apiBase,
        apiKey: apiKey || null,
      });

      const modelsWithToggle = (models ?? []).map(m => ({
        ...m,
        enabled: true,
      }));

      setFetchedModels(modelsWithToggle);
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setFetchedModels(prev =>
      prev.map(m =>
        m.id === modelId ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const handleAddModels = async () => {
    const enabledModels = fetchedModels
      .filter(m => m.enabled)
      .map((m, index) => ({
        id: crypto.randomUUID(),
        name: m.name,
        model_id: m.model_id,
        model_type: m.model_type,
        context_length: m.context_length,
        supports_vision: m.supports_vision,
        supports_function_calling: m.supports_function_calling,
        enabled: true,
        is_default: index === 0,
      }));

    setIsAddingModel(true);
    try {
      const providers = await safeInvoke<ModelProvider[]>('list_model_providers');
      const currentProvider = (providers ?? []).find(p => p.name === providerName);

      if (currentProvider && enabledModels.length > 0) {
        const updatedProvider = {
          ...currentProvider,
          models: [...(currentProvider.models || []), ...enabledModels],
        };
        await safeInvoke('delete_model_provider', { id: currentProvider.id });
        await safeInvoke('add_model_provider', { provider: updatedProvider });
      }

      await safeInvoke('mark_setup_complete');
      localStorage.setItem('shadow_setup_complete', 'true');
      navigate('/');
    } catch (err) {
      console.error('Failed to add models:', err);
    } finally {
      setIsAddingModel(false);
    }
  };

  const getStatusIcon = () => {
    if (status === 'connected') {
      return <CheckCircle size={16} className="status-success" />;
    }
    if (status === 'error') {
      return <AlertCircle size={16} className="status-error" />;
    }
    return null;
  };

  const selectedProvider = PROVIDER_TYPES.find(p => p.id === providerType);

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <div className="logo">
            <Server size={32} />
            <h1>{t('layout.brandName')}</h1>
          </div>
          <p className="setup-subtitle">{t('setup.welcome')}</p>
        </div>

        <div className="setup-steps">
          <div className={`step ${step === 'password' ? 'active' : ''} ${['database', 'provider', 'models'].includes(step) ? 'completed' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">{t('setup.setPassword')}</span>
          </div>
          <div className="step-line" />
          <div className={`step ${step === 'database' ? 'active' : ''} ${['provider', 'models'].includes(step) ? 'completed' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">{t('setup.selectDatabase')}</span>
          </div>
          <div className="step-line" />
          <div className={`step ${step === 'provider' ? 'active' : ''} ${step === 'models' ? 'completed' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">{t('setup.addProvider')}</span>
          </div>
          <div className="step-line" />
          <div className={`step ${step === 'models' ? 'active' : ''}`}>
            <span className="step-number">4</span>
            <span className="step-label">{t('setup.manageModels')}</span>
          </div>
        </div>

        <div className="setup-content">
          {step === 'password' && (
            <div className="step-content">
              <h2>{t('setup.setPasswordTitle')}</h2>
              <p className="step-desc">{t('setup.setPasswordDesc')}</p>

              <div className="password-form">
                <div className="form-group">
                  <label><Lock size={14} /> {t('setup.masterPassword')}</label>
                  <input
                    type="password"
                    value={masterPasswordInput}
                    onChange={(e) => setMasterPasswordInput(e.target.value)}
                    placeholder="********"
                  />
                </div>
                <div className="form-group">
                  <label>{t('setup.confirmPassword')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="********"
                  />
                </div>
                {passwordError && <p className="error-text">{passwordError}</p>}
                <p className="password-hint">
                  <Key size={12} /> {t('setup.passwordHint')}
                </p>
                <p className="machine-id-display">
                  {t('setup.machineId')}: <code>{machineId.slice(0, 8)}...</code>
                </p>
              </div>

              <div className="step-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSetPassword}
                  disabled={!masterPasswordInput || !confirmPassword || isSettingPassword}
                >
                  {isSettingPassword ? t('common.loading') : t('common.next')}
                </button>
              </div>
            </div>
          )}

          {step === 'database' && (
            <div className="step-content">
              <h2>{t('setup.selectDatabaseTitle')}</h2>
              <p className="step-desc">{t('setup.selectDatabaseDesc')}</p>

              <div className="db-type-cards">
                {DB_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      className={`db-type-card ${dbType === option.value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
                      onClick={() => !option.disabled && handleSelectDb(option.value)}
                      disabled={option.disabled}
                    >
                      <Icon size={32} />
                      <h3>{t(option.labelKey)}</h3>
                      <p>{t(option.descKey)}</p>
                    </button>
                  );
                })}
              </div>

              {dbType === 'embedded' && (
                <div className="embedded-status">
                  <div className="status-row">
                    <Database size={20} />
                    <span>{t('settings.dbEmbedded')}</span>
                    {getStatusIcon()}
                  </div>
                  {status === 'connected' && (
                    <p className="status-text success">{t('setup.dbReady')}</p>
                  )}
                  {status === 'connecting' && (
                    <p className="status-text">{t('setup.connecting')}</p>
                  )}
                </div>
              )}

              {dbType === 'external' && (
                <div className="external-config">
                  <div className="form-group">
                    <label>{t('settings.dbHost')}</label>
                    <input
                      type="text"
                      value={externalDbConfig.host}
                      onChange={(e) => setExternalDbConfig({ ...externalDbConfig, host: e.target.value })}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('settings.dbPort')}</label>
                      <input
                        type="text"
                        value={externalDbConfig.port}
                        onChange={(e) => setExternalDbConfig({ ...externalDbConfig, port: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('settings.dbName')}</label>
                      <input
                        type="text"
                        value={externalDbConfig.database}
                        onChange={(e) => setExternalDbConfig({ ...externalDbConfig, database: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('settings.dbUser')}</label>
                    <input
                      type="text"
                      value={externalDbConfig.username}
                      onChange={(e) => setExternalDbConfig({ ...externalDbConfig, username: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('settings.dbPassword')}</label>
                    <input
                      type="password"
                      value={externalDbConfig.password}
                      onChange={(e) => setExternalDbConfig({ ...externalDbConfig, password: e.target.value })}
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handleTestConnection}
                    disabled={connectionTestResult === 'testing'}
                  >
                    {connectionTestResult === 'testing' ? t('settings.dbConnecting') : t('settings.dbTestConnection')}
                  </button>
                  {connectionTestResult === 'success' && (
                    <p className="status-text success"><CheckCircle size={14} /> {t('setup.connectionSuccess')}</p>
                  )}
                  {connectionTestResult === 'failed' && (
                    <p className="status-text error"><AlertCircle size={14} /> {t('setup.connectionFailed')}</p>
                  )}
                </div>
              )}

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => setStep('password')}>
                  {t('common.back')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfigureDb}
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div className="step-content">
              <h2>{t('setup.addProviderTitle')}</h2>
              <p className="step-desc">{t('setup.addProviderDesc')}</p>

              <div className="model-form">
                <ProviderForm
                  value={providerFormData}
                  onChange={handleProviderFormChange}
                  providerTypes={PROVIDER_TYPES}
                  defaultApiBase={DEFAULT_API_BASE}
                  showProviderName={true}
                />
                {providerError && <p className="error-text">{providerError}</p>}
              </div>

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => setStep('database')}>
                  {t('common.back')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAddProvider}
                  disabled={!providerName || !apiBase || isAddingProvider}
                >
                  {isAddingProvider ? (
                    <><Loader2 size={14} className="spin" /> {t('common.loading')}</>
                  ) : (
                    <><ChevronRight size={14} /> {t('setup.nextToModels')}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'models' && (
            <div className="step-content">
              <div className="provider-summary">
                <span 
                  className="provider-dot" 
                  style={{ background: selectedProvider?.color }}
                />
                <span className="provider-name">{providerName}</span>
                <button 
                  type="button" 
                  className="btn-link"
                  onClick={() => setStep('provider')}
                >
                  {t('setup.edit')}
                </button>
              </div>

              <h2>{t('setup.selectModelsTitle')}</h2>
              <p className="step-desc">{t('setup.selectModelsDesc')}</p>

              <div className="model-form">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleFetchModels}
                  disabled={!apiBase || isFetchingModels}
                >
                  {isFetchingModels ? (
                    <><Loader2 size={14} className="spin" /> {t('common.loading')}</>
                  ) : (
                    <><Plus size={14} /> {t('setup.fetchModels')}</>
                  )}
                </button>

                {fetchError && (
                  <p className="error-text">{fetchError}</p>
                )}

                {fetchedModels.length > 0 && (
                  <div className="fetched-models">
                    <div className="models-header">
                      <h4>{t('setup.availableModels')}</h4>
                      <span className="models-count">
                        {fetchedModels.filter(m => m.enabled).length} / {fetchedModels.length}
                      </span>
                    </div>
                    {fetchedModels.map((model) => (
                      <div key={model.id} className={`model-item ${model.enabled ? 'enabled' : ''}`}>
                        <label className="model-toggle">
                          <input
                            type="checkbox"
                            checked={model.enabled}
                            onChange={() => toggleModel(model.id)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                        <div className="model-info">
                          <span className="model-name">{model.name}</span>
                          <span className="model-id">{model.model_id}</span>
                        </div>
                        {model.context_length && (
                          <span className="model-context">{model.context_length.toLocaleString()} {t('setup.ctx')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => setStep('provider')}>
                  {t('common.back')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAddModels}
                  disabled={fetchedModels.length === 0 || fetchedModels.filter(m => m.enabled).length === 0 || isAddingModel}
                >
                  {isAddingModel ? (
                    <><Loader2 size={14} className="spin" /> {t('common.loading')}</>
                  ) : (
                    <><Plus size={14} /> {t('setup.completeSetup')}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}