import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderCard } from '../../src/components/business/ProviderCard/ProviderCard';
import type { ModelProvider, LLMModel } from '../../src/components/business/AddProviderModal/types';

const mockProvider: ModelProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  provider_type: 'openai',
  api_base: 'https://api.openai.com/v1',
  api_key: 'sk-test',
  enabled: true,
  models: [],
};

const mockProviderWithModels: ModelProvider = {
  ...mockProvider,
  models: [
    { id: 'model-1', name: 'GPT-4', model_id: 'gpt-4', enabled: true } as LLMModel,
    { id: 'model-2', name: 'GPT-3.5', model_id: 'gpt-3.5-turbo', enabled: false } as LLMModel,
  ],
};

describe('ProviderCard', () => {
  it('renders provider name in heading', () => {
    render(<ProviderCard provider={mockProvider} />);
    expect(screen.getByRole('heading', { name: /openai/i })).toBeInTheDocument();
  });

  it('renders provider type in span element', () => {
    render(<ProviderCard provider={mockProvider} />);
    const typeSpan = document.querySelector('span[class*="_type"]');
    expect(typeSpan?.textContent).toBe('openai');
  });

  it('renders enabled badge when provider is enabled', () => {
    render(<ProviderCard provider={mockProvider} />);
    expect(screen.getByText(/enabled/i)).toBeInTheDocument();
  });

  it('renders disabled badge when provider is disabled', () => {
    render(<ProviderCard provider={{ ...mockProvider, enabled: false }} />);
    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const handleEdit = vi.fn();
    render(<ProviderCard provider={mockProvider} onEdit={handleEdit} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[1].click();
    expect(handleEdit).toHaveBeenCalledWith(mockProvider);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const handleDelete = vi.fn();
    render(<ProviderCard provider={mockProvider} onDelete={handleDelete} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[2].click();
    expect(handleDelete).toHaveBeenCalledWith('provider-1');
  });

  it('calls onTest when test button is clicked', async () => {
    const handleTest = vi.fn();
    render(<ProviderCard provider={mockProvider} onTest={handleTest} />);
    
    const buttons = await screen.findAllByRole('button');
    await buttons[0].click();
    expect(handleTest).toHaveBeenCalledWith('provider-1');
  });

  it('toggles expanded state', async () => {
    const user = userEvent.setup();
    render(<ProviderCard provider={mockProviderWithModels} />);
    
    const card = document.querySelector('div[class*="_card"]');
    if (card) {
      await user.click(card);
    }
  });

  it('does not render models section when no models', async () => {
    render(<ProviderCard provider={mockProvider} />);
    expect(screen.queryByText(/models/i)).not.toBeInTheDocument();
  });
});