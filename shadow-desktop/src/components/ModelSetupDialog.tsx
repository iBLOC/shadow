import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Server, Loader2, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { Button, Input, Label } from './ui';
import { telencephalonClient } from '../lib/telencephalonClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ModelSetupDialogProps {
  open: boolean;
  onClose: () => void;
  userMessage: string;
  onConfigured: () => void;
}

type Provider = 'openai' | 'anthropic' | 'mimo' | 'deepseek' | 'local_minicpm5' | 'local_qwen3';

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  description: string;
  requiresKey: boolean;
  icon: 'cloud' | 'local';
}> = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o / GPT-4o-mini / GPT-3.5-turbo',
    requiresKey: true,
    icon: 'cloud',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 / 3.7 Sonnet / Haiku',
    requiresKey: true,
    icon: 'cloud',
  },
  {
    id: 'mimo',
    name: 'Xiaomi Mimo',
    description: 'mimo-v2.5-pro 等（魔搭默认）',
    requiresKey: true,
    icon: 'cloud',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'deepseek-chat / deepseek-coder',
    requiresKey: true,
    icon: 'cloud',
  },
  {
    id: 'local_minicpm5',
    name: 'MiniCPM5-1B (本地)',
    description: 'OpenBMB MiniCPM5-1B · 1B · Apache-2.0 · 自动从 ModelScope 下载',
    requiresKey: false,
    icon: 'local',
  },
  {
    id: 'local_qwen3',
    name: 'Qwen3-0.6B (本地)',
    description: '阿里 Qwen3-0.6B · Apache-2.0 · 自动下载',
    requiresKey: false,
    icon: 'local',
  },
];

export function ModelSetupDialog({ open, onClose, userMessage, onConfigured }: ModelSetupDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'pick' | 'configure' | 'testing' | 'success' | 'error'>('pick');
  const [selected, setSelected] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('pick');
    setSelected(null);
    setApiKey('');
    setBaseUrl('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelect = (id: Provider) => {
    setSelected(id);
    setStep('configure');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setStep('testing');
    setError(null);
    try {
      const result = await telencephalonClient.configureLlm({
        provider: selected,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
      });
      if (!result.success) {
        throw new Error(result.message || 'configure failed');
      }
      setStep('success');
      // 配置持久化到 ~/.shadow/cortex/llm-config.json 后，下次 cortex 启动会自动加载
      setTimeout(() => {
        onConfigured();
        handleClose();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const provider = PROVIDERS.find((p) => p.id === selected);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {t('modelSetup.title', '配置 LLM 模型')}
          </DialogTitle>
          <DialogDescription>
            {userMessage}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('modelSetup.pickProvider', '选择模型来源：')}</p>
            <div className="grid gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {p.icon === 'cloud' ? <Server size={16} /> : <Download size={16} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{p.name}</span>
                      {p.requiresKey && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t('modelSetup.requiresKey', '需 API Key')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'configure' && provider && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">{provider.name}</div>
              <div className="text-xs text-muted-foreground">{provider.description}</div>
            </div>
            {provider.requiresKey && (
              <>
                <div>
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                  />
                </div>
                {(provider.id === 'mimo' || provider.id === 'deepseek') && (
                  <div>
                    <Label htmlFor="baseUrl">Base URL (可选)</Label>
                    <Input
                      id="baseUrl"
                      type="text"
                      placeholder={
                        provider.id === 'mimo'
                          ? 'https://api.xiaomimimo.com/v1'
                          : 'https://api.deepseek.com/v1'
                      }
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
            {provider.icon === 'local' && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium text-foreground">{t('modelSetup.localModelTitle', '本地模型')}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('modelSetup.localModelDesc', '点击保存后，cortex 会自动从 ModelScope 下载模型权重（约 700MB），完成后即可使用。')}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'testing' && (
          <div className="flex items-center gap-3 py-4 text-sm">
            <Loader2 size={18} className="animate-spin text-primary" />
            <span>{t('modelSetup.testing', '正在配置并测试模型...')}</span>
          </div>
        )}

        {step === 'success' && (
          <div className="flex items-center gap-3 py-4 text-sm text-green-600">
            <CheckCircle2 size={18} />
            <span>{t('modelSetup.success', '模型配置成功！正在重新发送您的请求...')}</span>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">{t('modelSetup.errorTitle', '配置失败')}</div>
                <div className="mt-1 text-xs">{error}</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          {step === 'pick' && (
            <Button variant="ghost" onClick={handleClose}>
              {t('common.cancel', '取消')}
            </Button>
          )}
          {step === 'configure' && (
            <>
              <Button variant="ghost" onClick={() => setStep('pick')}>
                {t('common.back', '返回')}
              </Button>
              <Button onClick={handleSubmit}>
                {t('modelSetup.save', '保存')}
              </Button>
            </>
          )}
          {step === 'error' && (
            <Button onClick={() => setStep('configure')}>
              {t('common.retry', '重试')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}