import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  Bot,
  Sliders,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Textarea,
  Input,
  Label,
  Separator,
} from '../components/ui';
import { usePromptStore, DEFAULT_PROMPT_TEXT } from '../stores/promptStore';

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}

export function PromptSettingsPage() {
  const { t } = useTranslation();
  const systemPrompt = usePromptStore((s) => s.systemPrompt);
  const customName = usePromptStore((s) => s.customName);
  const temperature = usePromptStore((s) => s.temperature);
  const topP = usePromptStore((s) => s.topP);
  const maxTokens = usePromptStore((s) => s.maxTokens);
  const setSystemPrompt = usePromptStore((s) => s.setSystemPrompt);
  const setCustomName = usePromptStore((s) => s.setCustomName);
  const setTemperature = usePromptStore((s) => s.setTemperature);
  const setTopP = usePromptStore((s) => s.setTopP);
  const setMaxTokens = usePromptStore((s) => s.setMaxTokens);
  const resetAll = usePromptStore((s) => s.resetAll);

  const [draft, setDraft] = useState(systemPrompt);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = draft !== systemPrompt;
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(systemPrompt), [systemPrompt]);

  const handleSave = () => {
    setSystemPrompt(draft);
    setSavedAt(Date.now());
    window.setTimeout(() => setSavedAt(null), 2500);
  };

  const handleResetToDefault = () => {
    setDraft(DEFAULT_PROMPT_TEXT);
    setSystemPrompt(DEFAULT_PROMPT_TEXT);
  };

  const insertTemplate = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      setDraft((prev) => `${prev}\n${text}\n`);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    window.setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> {t('prompt.title')}
          </h1>
          <p className="subtitle">{t('prompt.subtitle')}</p>
        </div>
        {dirty && (
          <Button onClick={handleSave} icon={<Save className="h-4 w-4" />}>
            {t('prompt.save')}
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('prompt.systemTitle')}</CardTitle>
          <CardDescription>{t('prompt.systemDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            ref={taRef}
            rows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={DEFAULT_PROMPT_TEXT}
            className="font-mono text-sm"
            aria-label={t('prompt.systemAria')}
          />

          <div className="flex flex-wrap gap-2">
            {[
              { label: t('prompt.template.role'), text: '\n## Role\nYou are a senior engineer who...\n' },
              { label: t('prompt.template.format'), text: '\n## Output format\nRespond as Markdown with sections.\n' },
              { label: t('prompt.template.tooluse'), text: '\n## Tools\nUse tools when you need external data. Always cite sources.\n' },
            ].map((tpl) => (
              <Button
                key={tpl.label}
                size="sm"
                variant="outline"
                onClick={() => insertTemplate(tpl.text)}
              >
                {tpl.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetToDefault}
              icon={<RotateCcw className="h-3 w-3" />}
            >
              {t('prompt.resetToDefault')}
            </Button>
          </div>

          {savedAt && (
            <div className="inline-flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              {t('prompt.savedAt', { at: new Date(savedAt).toLocaleTimeString() })}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-4 w-4" /> {t('prompt.identityTitle')}
          </CardTitle>
          <CardDescription>{t('prompt.identityDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="agent-name">{t('prompt.agentName')}</Label>
            <Input
              id="agent-name"
              value={customName ?? ''}
              onChange={(e) =>
                setCustomName(e.target.value.trim() ? e.target.value : null)
              }
              placeholder={t('prompt.agentNamePlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t('prompt.paramsTitle')}</CardTitle>
          <CardDescription>{t('prompt.paramsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Slider
            label={t('prompt.temperature')}
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label={t('prompt.topP')}
            value={topP}
            onChange={setTopP}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>{t('prompt.maxTokens')}</Label>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {maxTokens}
              </span>
            </div>
            <Input
              type="number"
              value={maxTokens}
              min={64}
              max={32768}
              step={64}
              onChange={(e) => setMaxTokens(Number(e.target.value) || 4096)}
              className="font-mono"
              aria-label={t('prompt.maxTokens')}
            />
          </div>

          <div className="border-t pt-4">
            <Button
              variant="ghost"
              onClick={resetAll}
              icon={<RotateCcw className="h-4 w-4" />}
            >
              {t('prompt.resetAll')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {temperature > 1.5 && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{t('prompt.highTempWarn')}</p>
        </div>
      )}
    </div>
  );
}
