import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@/components/ui/questionnaire';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Brain } from 'lucide-react';
import type { ModelProvider } from '@/lib/cortexClient';

/**
 * Decision made by the user in the bind-model flow.
 */
export interface BindModelDecision {
  providerId: string | null;
  modelId: string | null;
  capabilities: string[];
}

export interface BindModelDialogProps {
  open: boolean;
  agentName: string;
  providers: ModelProvider[];
  /** Optional list of capabilities the agent requires. */
  requiredCapabilities?: string[];
  /** Pre-selected provider id (e.g. when re-opening for an existing binding). */
  defaultProviderId?: string;
  /** Pre-selected model id (kept for future auto-select; not yet wired). */
  defaultModelId?: string;
  onSubmit: (decision: BindModelDecision) => void;
  onCancel?: () => void;
}

const COMMON_CAPABILITIES = [
  { value: 'chat', label: 'Chat' },
  { value: 'vision', label: 'Vision' },
  { value: 'tool_use', label: 'Tool use' },
  { value: 'code', label: 'Code' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'audio', label: 'Audio' },
];

/**
 * Multi-step "bind a model to an agent" flow:
 *   1. Pick a provider
 *   2. Pick a model
 *   3. Confirm the capabilities the agent needs
 *   4. Submit
 *
 * Implemented with the shadcn/ui `Questionnaire` primitive so the
 * component slots into the same form-driven pattern as every other
 * multi-step UX in the app.
 */
export function BindModelDialog({
  open,
  agentName,
  providers,
  requiredCapabilities = [],
  defaultProviderId,
  defaultModelId: _defaultModelId,
  onSubmit,
  onCancel,
}: BindModelDialogProps) {
  const { t } = useTranslation();

  const providerItems = useMemo(
    () =>
      providers.length === 0
        ? []
        : providers.map((p) => ({
            value: p.id,
            label: p.name,
            description: p.provider_type + (p.api_base ? ` · ${p.api_base}` : ''),
          })),
    [providers],
  );

  const initialProvider =
    providers.find((p) => p.id === defaultProviderId) ?? providers[0];
  const initialProviderId = initialProvider?.id;

  const modelItems = useMemo(() => {
    if (!initialProviderId) return [];
    const provider = providers.find((p) => p.id === initialProviderId);
    if (!provider) return [];
    return provider.models.map((m) => ({
      value: m.model_id,
      label: m.name,
      description: m.model_id === m.name ? undefined : m.model_id,
    }));
  }, [initialProviderId, providers]);

  const capabilityItems = useMemo(
    () =>
      COMMON_CAPABILITIES.map((c) => ({
        value: c.value,
        label: c.label,
      })),
    [],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);

    const providerId = (fd.get('provider') as string | null) ?? null;
    const modelId = (fd.get('model') as string | null) ?? null;
    const capabilities = fd.getAll('capabilities').map((c) => c.toString());

    onSubmit({ providerId, modelId, capabilities });
  }

  if (providers.length === 0) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onCancel?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('questionnaire.bindModel.title', { agent: agentName })}
            </DialogTitle>
            <DialogDescription>
              No model providers are configured yet. Add a provider in
              Settings → Models first.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel?.()}>
      <DialogContent
        className="max-w-2xl"
        data-testid="bind-model-dialog"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <DialogTitle>
              {t('questionnaire.bindModel.title', { agent: agentName })}
            </DialogTitle>
          </div>
          <DialogDescription>
            {t('questionnaire.bindModel.description')}
          </DialogDescription>
          {requiredCapabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
              <span>Agent requires:</span>
              {requiredCapabilities.map((c) => (
                <span
                  key={c}
                  className="rounded bg-muted px-2 py-0.5 font-mono"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </DialogHeader>

        <Questionnaire
          items={[
            {
              name: 'provider',
              required: true,
              prompt: t('questionnaire.bindModel.chooseProvider'),
              choices: providerItems,
            },
            {
              name: 'model',
              required: true,
              prompt: t('questionnaire.bindModel.chooseModel'),
              choices: modelItems,
            },
            {
              name: 'capabilities',
              required: false,
              prompt: t('questionnaire.bindModel.chooseCapabilities'),
              choices: capabilityItems,
            },
          ] as never}
          onSubmit={handleSubmit}
          className="gap-4"
        >
          <QuestionnaireProgress />

          <QuestionnaireItem name="provider" required>
            <QuestionnaireTitle>
              {t('questionnaire.bindModel.chooseProvider')}
            </QuestionnaireTitle>
            <QuestionnaireChoices>
              {providerItems.map((p) => (
                <QuestionnaireChoice key={p.value} value={p.value}>
                  <span className="font-medium">{p.label}</span>
                  {p.description && (
                    <QuestionnaireChoiceDescription>
                      {p.description}
                    </QuestionnaireChoiceDescription>
                  )}
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
          </QuestionnaireItem>

          <QuestionnaireItem name="model" required>
            <QuestionnaireTitle>
              {t('questionnaire.bindModel.chooseModel')}
            </QuestionnaireTitle>
            <QuestionnaireChoices>
              {modelItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No models available for this provider.
                </p>
              ) : (
                modelItems.map((m) => (
                  <QuestionnaireChoice key={m.value} value={m.value}>
                    <span className="font-medium">{m.label}</span>
                    {m.description && (
                      <QuestionnaireChoiceDescription>
                        {m.description}
                      </QuestionnaireChoiceDescription>
                    )}
                  </QuestionnaireChoice>
                ))
              )}
            </QuestionnaireChoices>
          </QuestionnaireItem>

          <QuestionnaireItem name="capabilities">
            <QuestionnaireTitle>
              {t('questionnaire.bindModel.chooseCapabilities')}
            </QuestionnaireTitle>
            <QuestionnaireChoices>
              {capabilityItems.map((c) => (
                <QuestionnaireChoice key={c.value} value={c.value}>
                  <span className="font-medium">{c.label}</span>
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
          </QuestionnaireItem>

          <QuestionnaireActions>
            <QuestionnairePrevious>
              {t('questionnaire.agentClarify.previous')}
            </QuestionnairePrevious>
            <QuestionnaireNext>
              {t('questionnaire.agentClarify.previous')}
            </QuestionnaireNext>
            <QuestionnaireSubmit>
              {t('questionnaire.bindModel.submit')}
            </QuestionnaireSubmit>
          </QuestionnaireActions>
        </Questionnaire>
      </DialogContent>
    </Dialog>
  );
}
