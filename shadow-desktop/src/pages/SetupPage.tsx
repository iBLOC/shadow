import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { safeInvoke } from '../lib/tauriSafe';
import { Server, Lock, Key, Plus, ChevronRight } from 'lucide-react';
import { useDatabaseStore } from '../stores/databaseStore';
import { ProviderForm } from '../components/business';
import type { ProviderFormData, ProviderTypeOption } from '../components/business';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

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

const PROVIDER_TYPES = [
  { id: 'xiaomi-mimo', name: 'Xiaomi MiMo', color: '#ff6900' },
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
  'xiaomi-mimo': 'https://api.xiaomimimo.com/v1',
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

type SetupStep = 'password' | 'provider' | 'models';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useDatabaseStore();
  const [step, setStep] = useState<SetupStep>('password');

  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [machineId, setMachineId] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  const [providerType, setProviderType] = useState<ProviderTypeId>('openai');
  const [providerName, setProviderName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerError, setProviderError] = useState('');

  const [providerFormData, setProviderFormData] = useState<ProviderFormData>({
    name: '', provider_type: 'openai', api_base: '', api_key: '', enabled: true,
  });

  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [isAddingModel, setIsAddingModel] = useState(false);

  useEffect(() => {
    safeInvoke<string>('get_machine_id').then((id) => { if (id) setMachineId(id); }).catch(console.error);
    loadSetupProgress();
  }, []);

  const loadSetupProgress = async () => {
    try {
      const savedStep = await safeInvoke<string>('get_setup_step');
      const providerConfig = await safeInvoke<{ provider_type: string; name: string; api_base: string; api_key: string | null }>('get_provider_config');
      if (savedStep && savedStep !== 'password') setStep(savedStep as SetupStep);
      if (providerConfig && providerConfig.name) {
        setProviderType(providerConfig.provider_type as ProviderTypeId);
        setProviderName(providerConfig.name);
        setApiBase(providerConfig.api_base);
        if (providerConfig.api_key) setApiKey(providerConfig.api_key);
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
    if (masterPasswordInput.length < 8) { setPasswordError(t('setup.passwordTooShort')); return; }
    if (masterPasswordInput !== confirmPassword) { setPasswordError(t('setup.passwordMismatch')); return; }
    setIsSettingPassword(true);
    setPasswordError('');
    try {
      await safeInvoke('set_password', { password: masterPasswordInput, machineId });
      await safeInvoke('update_setup_step', { step: 'provider' });
      setStep('provider');
    } catch (err) {
      setPasswordError(String(err));
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handleAddProvider = async () => {
    if (!providerName || !apiBase) return;
    setIsAddingProvider(true);
    setProviderError('');
    try {
      await safeInvoke('save_provider_config', {
        providerConfig: { provider_type: providerType, name: providerName, api_base: apiBase, api_key: apiKey || null },
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
      const models = await safeInvoke<FetchedModel[]>('fetch_provider_models', { apiBase, apiKey: apiKey || null });
      setFetchedModels((models ?? []).map(m => ({ ...m, enabled: true })));
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setFetchedModels(prev => prev.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m));
  };

  const handleAddModels = async () => {
    const enabledModels = fetchedModels
      .filter(m => m.enabled)
      .map((m, index) => ({
        id: crypto.randomUUID(),
        name: m.name, model_id: m.model_id, model_type: m.model_type,
        context_length: m.context_length,
        supports_vision: m.supports_vision, supports_function_calling: m.supports_function_calling,
        enabled: true, is_default: index === 0,
      }));

    setIsAddingModel(true);
    try {
      const providers = await safeInvoke<ModelProvider[]>('list_model_providers');
      const currentProvider = (providers ?? []).find(p => p.name === providerName);
      if (currentProvider && enabledModels.length > 0) {
        const updatedProvider = { ...currentProvider, models: [...(currentProvider.models || []), ...enabledModels] };
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

  const selectedProvider = PROVIDER_TYPES.find(p => p.id === providerType);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3 text-foreground">
            <Server size={32} />
            <h1 className="text-3xl font-bold">{t('layout.brandName')}</h1>
          </div>
          <p className="text-base text-muted-foreground">{t('setup.welcome')}</p>
        </div>

        <div className="mb-8 flex items-center justify-center">
          <StepIndicator step={step} stepName="password" label={t('setup.setPassword')} index={1} />
          <StepLine />
          <StepIndicator step={step} stepName="provider" label={t('setup.addProvider')} index={2} />
          <StepLine />
          <StepIndicator step={step} stepName="models" label={t('setup.manageModels')} index={3} />
        </div>

        <div className="rounded-lg bg-muted/30 p-6">
          {step === 'password' && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h2 className="mb-2 text-xl font-semibold text-foreground">{t('setup.setPasswordTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('setup.setPasswordDesc')}</p>
              </div>

              <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock size={14} /> {t('setup.masterPassword')}
                  </label>
                  <input
                    type="password"
                    value={masterPasswordInput}
                    onChange={(e) => setMasterPasswordInput(e.target.value)}
                    placeholder="********"
                    className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-foreground focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">{t('setup.confirmPassword')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="********"
                    className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-foreground focus:outline-none"
                  />
                </div>
                {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Key size={12} /> {t('setup.passwordHint')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('setup.machineId')}: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{machineId.slice(0, 8)}...</code>
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  onClick={handleSetPassword}
                  disabled={!masterPasswordInput || !confirmPassword || isSettingPassword}
                  loading={isSettingPassword}
                >
                  {isSettingPassword ? t('common.loading') : t('common.next')}
                </Button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h2 className="mb-2 text-xl font-semibold text-foreground">{t('setup.addProviderTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('setup.addProviderDesc')}</p>
              </div>

              <div>
                <ProviderForm
                  value={providerFormData}
                  onChange={handleProviderFormChange}
                  providerTypes={PROVIDER_TYPES}
                  defaultApiBase={DEFAULT_API_BASE}
                  showProviderName={true}
                />
                {providerError && <p className="mt-2 text-sm text-red-500">{providerError}</p>}
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep('password')}>{t('common.back')}</Button>
                <Button
                  onClick={handleAddProvider}
                  disabled={!providerName || !apiBase || isAddingProvider}
                  loading={isAddingProvider}
                  icon={isAddingProvider ? undefined : <ChevronRight size={14} />}
                >
                  {isAddingProvider ? t('common.loading') : t('setup.nextToModels')}
                </Button>
              </div>
            </div>
          )}

          {step === 'models' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3 rounded-md bg-card p-3">
                <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: selectedProvider?.color }} />
                <span className="flex-1 font-medium text-foreground">{providerName}</span>
                <Button type="button" variant="link" onClick={() => setStep('provider')}>
                  {t('setup.edit')}
                </Button>
              </div>

              <div className="text-center">
                <h2 className="mb-2 text-xl font-semibold text-foreground">{t('setup.selectModelsTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('setup.selectModelsDesc')}</p>
              </div>

              <div className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleFetchModels}
                  disabled={!apiBase || isFetchingModels}
                  loading={isFetchingModels}
                  icon={isFetchingModels ? undefined : <Plus size={14} />}
                >
                  {isFetchingModels ? t('common.loading') : t('setup.fetchModels')}
                </Button>

                {fetchError && <p className="text-sm text-red-500">{fetchError}</p>}

                {fetchedModels.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-medium text-foreground">{t('setup.availableModels')}</h4>
                      <span className="text-sm text-muted-foreground">
                        {fetchedModels.filter(m => m.enabled).length} / {fetchedModels.length}
                      </span>
                    </div>
                    {fetchedModels.map((model) => (
                      <div key={model.id} className={cn(
                        'flex items-center gap-3 rounded-md border border-border bg-card p-3',
                        model.enabled && 'border-foreground'
                      )}>
                        <label className="relative h-5 w-9 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={model.enabled}
                            onChange={() => toggleModel(model.id)}
                            className="peer absolute inset-0 cursor-pointer opacity-0"
                          />
                          <span className={cn(
                            'block h-5 w-9 cursor-pointer rounded-full transition-colors',
                            model.enabled ? 'bg-green-500' : 'bg-muted'
                          )}>
                            <span className={cn(
                              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                              model.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            )} />
                          </span>
                        </label>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{model.name}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{model.model_id}</span>
                        </div>
                        {model.context_length && (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {model.context_length.toLocaleString()} {t('setup.ctx')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep('provider')}>{t('common.back')}</Button>
                <Button
                  onClick={handleAddModels}
                  disabled={fetchedModels.length === 0 || fetchedModels.filter(m => m.enabled).length === 0 || isAddingModel}
                  loading={isAddingModel}
                  icon={isAddingModel ? undefined : <Plus size={14} />}
                >
                  {isAddingModel ? t('common.loading') : t('setup.completeSetup')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step, stepName, label, index }: { step: SetupStep; stepName: SetupStep; label: string; index: number }) {
  const isActive = step === stepName;
  const isCompleted = (
    (stepName === 'password' && ['provider', 'models'].includes(step)) ||
    (stepName === 'provider' && step === 'models')
  );
  return (
    <div className={cn('flex items-center gap-2', isActive && 'text-foreground')}>
      <span className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
        isActive && 'bg-foreground text-background',
        isCompleted && 'bg-green-500 text-white',
        !isActive && !isCompleted && 'bg-muted text-muted-foreground'
      )}>
        {index}
      </span>
      <span className={cn('text-sm', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
    </div>
  );
}

function StepLine() {
  return <div className="mx-3 h-0.5 w-15 bg-muted" />;
}
