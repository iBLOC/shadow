import { useState, useMemo } from 'react';
import { Send, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Field descriptor for a single client-tool input. Maps to an AI SDK
 * tool's `input` schema field. Keep this declarative so the same shape
 * can drive multiple tools (`askQuestions`, `confirmAction`, ...).
 */
export interface ToolField {
  /** Field name — used as the JSON key in `addToolOutput`. */
  name: string;
  /** Human label shown above the input. */
  label: string;
  /** Optional helper text under the input. */
  description?: string;
  /** Input variant — drives which shadcn primitive we render. */
  kind: 'text' | 'textarea' | 'number' | 'checkbox';
  /** Whether the user must provide a value. */
  required?: boolean;
  /** Default value to pre-fill. */
  defaultValue?: string | number | boolean;
}

export interface ClientToolFormProps {
  toolCallId: string;
  toolName: string;
  /**
   * Field descriptors for the tool's input. If omitted the component
   * falls back to a single `value` textarea using the raw input JSON.
   */
  fields?: ToolField[];
  /** Raw input from the AI SDK tool part. Used when `fields` is absent. */
  rawInput: Record<string, unknown>;
  /** Title shown at the top of the form. */
  title?: string;
  /**
   * Called with the validated JSON output. Parent is responsible for
   * calling `addToolOutput({ tool, toolCallId, output })`.
   */
  onSubmit: (output: Record<string, unknown>) => Promise<void> | void;
  /**
   * Optional cancel handler. When provided, surfaces a "Cancel" button.
   */
  onCancel?: () => void;
  /**
   * If true, render compact (used when stacked in a busy thread).
   */
  compact?: boolean;
}

/**
 * Inline form rendered when a tool pauses for the user to supply input
 * (a "client-executed" tool in AI SDK terminology). Mirrors the
 * `askQuestions` example in the @shadcn/helpers docs.
 */
export function ClientToolForm({
  toolCallId,
  toolName,
  fields,
  rawInput,
  title,
  onSubmit,
  onCancel,
  compact = false,
}: ClientToolFormProps) {
  const initialValues = useMemo(() => buildInitialValues(fields, rawInput), [
    fields,
    rawInput,
  ]);
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    initialValues,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDeclaredFields = Array.isArray(fields) && fields.length > 0;

  function setValue(name: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const output = hasDeclaredFields ? validateAndCoerce(values, fields!) : { value: values.value };
      await onSubmit(output);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      className={cn('my-2 border-primary/40 bg-primary/5', compact && 'py-2')}
      data-tool-call-id={toolCallId}
      data-testid={`client-tool-form-${toolName}`}
    >
      <CardContent className={cn('flex flex-col gap-3', compact && 'p-3')}>
        <div className="flex items-start gap-2">
          <Wrench className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">
              {title ?? `Tool "${toolName}" needs your input`}
            </span>
            <span className="text-xs text-muted-foreground">
              Provide the requested information to continue.
            </span>
          </div>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {hasDeclaredFields ? (
            fields!.map((field) => (
              <FieldRow
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={(v) => setValue(field.name, v)}
                compact={compact}
              />
            ))
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${toolCallId}-value`}>Value</Label>
              <Textarea
                id={`${toolCallId}-value`}
                rows={4}
                value={String(values.value ?? '')}
                onChange={(e) => setValue('value', e.target.value)}
                placeholder="Describe what the assistant should do next…"
                data-testid={`client-tool-input-${toolName}-value`}
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              icon={
                submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )
              }
              data-testid={`client-tool-submit-${toolName}`}
            >
              Submit
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  compact,
}: {
  field: ToolField;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  compact: boolean;
}) {
  const labelEl = (
    <Label htmlFor={`field-${field.name}`}>
      {field.label}
      {field.required && <span className="ml-1 text-destructive">*</span>}
    </Label>
  );

  let inputEl: React.ReactNode;
  if (field.kind === 'textarea') {
    inputEl = (
      <Textarea
        id={`field-${field.name}`}
        rows={compact ? 2 : 3}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  } else if (field.kind === 'number') {
    inputEl = (
      <Input
        id={`field-${field.name}`}
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => {
          const parsed = e.target.value === '' ? '' : Number(e.target.value);
          onChange(parsed as number | string);
        }}
        required={field.required}
      />
    );
  } else if (field.kind === 'checkbox') {
    inputEl = (
      <input
        id={`field-${field.name}`}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
    );
  } else {
    inputEl = (
      <Input
        id={`field-${field.name}`}
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      {inputEl}
      {field.description && (
        <span className="text-xs text-muted-foreground">
          {field.description}
        </span>
      )}
    </div>
  );
}

function buildInitialValues(
  fields: ToolField[] | undefined,
  rawInput: Record<string, unknown>,
): Record<string, string | number | boolean> {
  if (!fields || fields.length === 0) {
    return { value: JSON.stringify(rawInput, null, 2) };
  }
  const next: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const raw = rawInput[field.name];
    if (raw === undefined || raw === null) {
      next[field.name] =
        field.defaultValue !== undefined ? field.defaultValue : '';
      continue;
    }
    if (field.kind === 'checkbox') {
      next[field.name] = Boolean(raw);
    } else if (field.kind === 'number') {
      next[field.name] = Number(raw);
    } else {
      next[field.name] = String(raw);
    }
  }
  return next;
}

function validateAndCoerce(
  values: Record<string, string | number | boolean>,
  fields: ToolField[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.required && (raw === '' || raw === undefined || raw === null)) {
      throw new Error(`Field "${field.label}" is required`);
    }
    if (field.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (raw !== '' && Number.isNaN(n)) {
        throw new Error(`Field "${field.label}" must be a number`);
      }
      out[field.name] = raw === '' ? null : n;
    } else if (field.kind === 'checkbox') {
      out[field.name] = Boolean(raw);
    } else {
      out[field.name] = String(raw);
    }
  }
  return out;
}
