import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentClarificationDialog } from '../../components/chat/AgentClarificationDialog';
import type { ClarificationItem } from '../../components/chat/AgentClarificationDialog';

const items: ClarificationItem[] = [
  {
    name: 'direction',
    prompt: 'What should we build?',
    required: true,
    choices: [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ],
  },
  {
    name: 'freeform',
    prompt: 'Anything else?',
    skippable: true,
    choices: [],
  },
];

function renderDialog(props: Partial<React.ComponentProps<typeof AgentClarificationDialog>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <AgentClarificationDialog
      open
      items={items}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel, ...utils };
}

describe('AgentClarificationDialog', () => {
  it('renders the title and every question prompt', () => {
    renderDialog();
    expect(screen.getByText('questionnaire.agentClarify.title')).toBeTruthy();
    expect(screen.getByText('What should we build?')).toBeTruthy();
    expect(screen.getByText('Anything else?')).toBeTruthy();
  });

  it('renders every choice label', () => {
    renderDialog();
    expect(screen.getByLabelText('Option A')).toBeTruthy();
    expect(screen.getByLabelText('Option B')).toBeTruthy();
  });

  it('includes freeform input when provided', () => {
    const itemsWithFreeform: ClarificationItem[] = [
      {
        name: 'approach',
        prompt: 'How should we implement?',
        required: true,
        choices: [
          { value: 'fast', label: 'Fast' },
          { value: 'safe', label: 'Safe' },
        ],
        freeform: { label: 'Other', placeholder: 'Describe…' },
      },
    ];
    renderDialog({ items: itemsWithFreeform });
    expect(screen.getByPlaceholderText('Describe…')).toBeTruthy();
  });

  it('renders empty state when items list is empty', () => {
    renderDialog({ items: [] });
    expect(screen.queryByText('What should we build?')).toBeNull();
  });
});